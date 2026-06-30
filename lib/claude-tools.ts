import { tool } from 'ai'
import { z } from 'zod'
import { searchAttractions, searchSurroundings, ATTRACTION_CATEGORIES, type SurroundingsCategory } from './foursquare-client'
import { searchHotelsByCity, getHotelOffers, CITY_TO_IATA } from './amadeus-client'
import { addDays, resolveCityCoords } from './route-utils'
import { getRoute, metersToMiles, secondsToTime } from './osrm-client'
import { overpassQuery } from './overpass-client'
import type { OsmElement } from './overpass-client'
import type { RouteStop, Attraction, Hotel } from '@/types'

// ─── OSM tag → human-readable category (ported + expanded from TREK) ───────

const TOURISM_CATEGORY: Record<string, string> = {
  attraction: 'Attraction',
  viewpoint: 'Scenic Viewpoint',
  museum: 'Museum',
  gallery: 'Art Gallery',
  artwork: 'Public Art',
  zoo: 'Zoo',
  aquarium: 'Aquarium',
  theme_park: 'Theme Park',
  hotel: 'Hotel',
  motel: 'Motel',
  hostel: 'Hostel',
  guest_house: 'Guest House',
  apartment: 'Apartment',
  camp_site: 'Campground',
  caravan_site: 'RV Park',
}

const AMENITY_CATEGORY: Record<string, string> = {
  theatre: 'Theatre',
  cinema: 'Cinema',
  arts_centre: 'Arts Centre',
  place_of_worship: 'Place of Worship',
  nightclub: 'Nightclub',
}

const LEISURE_CATEGORY: Record<string, string> = {
  park: 'Park',
  nature_reserve: 'Nature Reserve',
  garden: 'Garden',
  marina: 'Marina',
  water_park: 'Water Park',
  golf_course: 'Golf Course',
}

const HISTORIC_CATEGORY: Record<string, string> = {
  monument: 'Monument',
  memorial: 'Memorial',
  castle: 'Castle',
  ruins: 'Ruins',
  archaeological_site: 'Archaeological Site',
  battlefield: 'Historic Battlefield',
}

const NATURAL_CATEGORY: Record<string, string> = {
  beach: 'Beach',
  peak: 'Mountain Peak',
  waterfall: 'Waterfall',
  hot_spring: 'Hot Spring',
  cave_entrance: 'Cave',
}

function osmCategory(tags: Record<string, string>): string {
  return (
    TOURISM_CATEGORY[tags.tourism ?? ''] ??
    AMENITY_CATEGORY[tags.amenity ?? ''] ??
    LEISURE_CATEGORY[tags.leisure ?? ''] ??
    HISTORIC_CATEGORY[tags.historic ?? ''] ??
    NATURAL_CATEGORY[tags.natural ?? ''] ??
    'Attraction'
  )
}

function osmAddress(tags: Record<string, string>, city: string): string {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] ?? city,
    tags['addr:postcode'],
  ].filter(Boolean).join(', ')
}

// ─── OSM Attractions (free, no key) ─────────────────────────────────────────
// Uses grouped tilde-regex filters on node only — fast enough for edge runtime.
// (nwr with 22 separate filters was too slow: all mirrors timed out at 12s)

async function osmAttractions(city: string, _state: string, limit: number): Promise<Attraction[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 15000  // 15 km radius

  const ql = `[out:json][timeout:10];
(
  node["tourism"~"attraction|viewpoint|museum|gallery|artwork|zoo|aquarium|theme_park"](around:${r},${lat},${lng});
  node["historic"~"monument|memorial|castle|ruins|archaeological_site"](around:${r},${lat},${lng});
  node["amenity"~"theatre|cinema|arts_centre"](around:${r},${lat},${lng});
  node["leisure"~"park|nature_reserve|garden"](around:${r},${lat},${lng});
  node["natural"~"beach|peak|waterfall"](around:${r},${lat},${lng});
);
out ${limit * 2};`

  const elements = await overpassQuery(ql)
  const seen = new Set<string>()
  const results: Attraction[] = []

  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)

    results.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: osmCategory(tags),
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      website: tags.website ?? tags['contact:website'] ?? tags.url,
      description: tags.description,
    })
    if (results.length >= limit) break
  }
  return results
}

// ─── OSM Surroundings — shared function called by explore_surroundings AND suggest_route_stops ──
// Extracted so suggest_route_stops can auto-populate surroundings for water-adjacent stops
// without needing a separate AI tool call (avoids edge timeout issues).

/** Detect if a stop is water-adjacent based on coords + name — Great Lakes / river / harbor heuristic */
function isWaterAdjacent(lat: number, lng: number, cityName: string): boolean {
  const name = cityName.toLowerCase()
  // Name keywords for water-based destinations
  if (/lake|locks|sault|falls|beach|harbor|bay|river|canal|lakeshore|narrows|straits|pictured|rocks/.test(name)) return true
  // Great Lakes bounding box (Lake Superior, Michigan, Huron, Erie, Ontario + connecting waters)
  if (lat > 41.3 && lat < 49.5 && lng > -92.5 && lng < -75.5) return true
  return false
}

/** Parse raw Overpass elements into Attraction objects for surroundings */
function parseSurroundingsElements(elements: OsmElement[], city: string, limit: number): Attraction[] {
  const seen = new Set<string>()
  const surroundings: Attraction[] = []
  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)
    const nameLower = name.toLowerCase()
    const inferredCat =
      tags.tourism === 'attraction' ? (
        /cruise|cruises|boat.?tour|ship|sail|ferry|charter/.test(nameLower) ? 'Boat Tour / Cruise' :
        /kayak|canoe|paddle/.test(nameLower) ? 'Kayaking' :
        /zip.?line|canopy|aerial/.test(nameLower) ? 'Zip Line' :
        /horse|equestri/.test(nameLower) ? 'Horseback Riding' :
        /climb|rappel/.test(nameLower) ? 'Rock Climbing' :
        /raft|tubing|float/.test(nameLower) ? 'Rafting' :
        /waterfall|falls/.test(nameLower) ? 'Waterfall' :
        /hike|trail|scenic/.test(nameLower) ? 'Hiking / Scenic' :
        'Attraction'
      ) : null
    const cat = inferredCat ??
      (tags.amenity === 'boat_rental' ? 'Boat / Kayak Rental' :
      tags.tourism === 'boat_tour' ? 'Boat Tour' :
      tags.tourism === 'camp_site' || tags.leisure === 'camp_site' ? 'Campground' :
      tags.tourism === 'caravan_site' ? 'RV Park' :
      tags.attraction === 'boat_tour' ? 'Boat Tour' :
      tags.attraction === 'scenic_railway' ? 'Scenic Train Ride' :
      tags.attraction === 'zip_line' ? 'Zip Line' :
      tags.attraction === 'gondola_lift' || tags.attraction === 'chair_lift' ? 'Scenic Gondola / Tram' :
      tags.attraction === 'waterfall' ? 'Waterfall' :
      tags.natural === 'waterfall' ? 'Waterfall' :
      tags.natural === 'beach' ? 'Beach' :
      tags.natural === 'peak' ? 'Mountain Peak' :
      tags.natural === 'hot_spring' ? 'Hot Spring' :
      tags.natural === 'cave_entrance' ? 'Cave' :
      tags.sport === 'kayak' || tags.sport === 'kayaking' || tags.sport === 'canoe' || tags.sport === 'canoeing' ? 'Kayaking & Canoeing' :
      tags.sport === 'sailing' || tags.sport === 'rowing' || tags.sport === 'windsurfing' ? 'Water Sports' :
      tags.sport === 'climbing' ? 'Rock Climbing' :
      tags.sport === 'rafting' ? 'Rafting' :
      tags.sport === 'fishing' ? 'Fishing' :
      tags.sport === 'skiing' ? 'Skiing' :
      tags.sport ? tags.sport.charAt(0).toUpperCase() + tags.sport.slice(1) :
      tags.leisure === 'nature_reserve' ? 'Nature Reserve' :
      tags.leisure === 'marina' ? 'Marina' :
      tags.leisure === 'water_park' ? 'Water Park' :
      tags.leisure ? tags.leisure.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
      'Outdoor Activity')
    surroundings.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: cat,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      website: tags.website ?? tags['contact:website'],
    })
    if (surroundings.length >= limit) break
  }
  return surroundings
}

/** Query OSM for outdoor/activity POIs around a lat/lng. Used by explore_surroundings and suggest_route_stops. */
async function osmSurroundingsQuery(lat: number, lng: number, city: string, limit = 8, qlTimeout = 15): Promise<Attraction[]> {
  const r = 30000
  const ql = `[out:json][timeout:${qlTimeout}];
(
  node["leisure"~"park|nature_reserve|marina|swimming_pool|golf_course|water_park"](around:${r},${lat},${lng});
  node["sport"~"hiking|cycling|kayak|kayaking|canoe|canoeing|climbing|fishing|skiing|swimming|rafting|sailing|windsurfing|rowing"](around:${r},${lat},${lng});
  node["tourism"~"attraction|viewpoint|theme_park|zoo|aquarium"](around:${r},${lat},${lng});
  node["tourism"~"camp_site|caravan_site|boat_tour"](around:${r},${lat},${lng});
  node["leisure"="camp_site"](around:${r},${lat},${lng});
  node["amenity"~"boat_rental"](around:${r},${lat},${lng});
  node["natural"~"waterfall|beach|peak|hot_spring|cave_entrance"](around:${r},${lat},${lng});
  node["attraction"~"boat_tour|scenic_railway|zip_line|gondola_lift|chair_lift|waterfall"](around:${r},${lat},${lng});
  node["name"~"cruise|cruises|kayak|canoe|paddle|boat.?tour|raft|zip.?line|scenic.?ride",i](around:${r},${lat},${lng});
);
out ${limit * 2};`
  const elements = await overpassQuery(ql)
  return parseSurroundingsElements(elements, city, limit)
}

// ─── OSM Hotels (free, no key) ───────────────────────────────────────────────
// Star rating + type-based price estimation — ported from TREK pattern.

const HOTEL_PRICE_TIER: Record<string, number> = {
  hotel: 130, motel: 80, hostel: 50, guest_house: 90,
  apartment: 100, camp_site: 35, caravan_site: 45,
}
// Price by star rating: index = stars (0-5)
const STAR_PRICE = [0, 65, 85, 115, 170, 240]

async function osmHotels(city: string, state: string, _checkIn: string, _checkOut: string): Promise<Hotel[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 12000  // 12 km radius

  const ql = `[out:json][timeout:10];
(
  nwr["tourism"~"hotel|motel|hostel|guest_house|apartment"](around:${r},${lat},${lng});
);
out center tags 20;`

  const elements = await overpassQuery(ql)
  const seen = new Set<string>()
  const results: Hotel[] = []

  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)

    const type = tags.tourism ?? 'hotel'
    const stars = tags.stars ? Math.min(5, parseInt(tags.stars)) : undefined
    const basePrice = stars ? (STAR_PRICE[stars] ?? HOTEL_PRICE_TIER[type] ?? 100) : (HOTEL_PRICE_TIER[type] ?? 100)

    // Amenities from OSM tags (ported from TREK)
    const amenities = [
      (tags.internet === 'yes' || tags.wifi === 'yes' || tags['internet_access'] === 'wlan') ? 'Free WiFi' : '',
      tags.parking === 'yes' ? 'Parking' : '',
      tags.swimming_pool === 'yes' ? 'Pool' : '',
      tags.restaurant === 'yes' ? 'Restaurant' : '',
      tags.breakfast === 'yes' ? 'Breakfast Included' : '',
      tags.bar === 'yes' ? 'Bar' : '',
      tags.gym === 'yes' ? 'Gym' : '',
      tags.sauna === 'yes' ? 'Sauna' : '',
      tags.air_conditioning === 'yes' ? 'Air Conditioning' : '',
      tags.elevator === 'yes' ? 'Elevator' : '',
      tags['pets_allowed'] === 'yes' ? 'Pet Friendly' : '',
    ].filter(Boolean)

    const roomType = stars && stars >= 4 ? 'Deluxe Room' : stars === 3 ? 'Superior Room' : 'Standard Room'

    results.push({
      hotelId: `osm-${el.type}-${el.id}`,
      name,
      starRating: stars,
      rating: stars ? Math.min(5, stars * 0.8 + 1) : undefined,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      pricePerNight: basePrice,
      currency: 'USD',
      amenities,
      availableOffers: [{
        offerId: `osm-offer-${el.id}`,
        roomType,
        bedType: stars && stars >= 3 ? 'King' : 'Queen',
        price: basePrice,
        currency: 'USD',
        cancellationPolicy: 'Free cancellation before check-in',
        breakfastIncluded: tags.breakfast === 'yes',
        bookingUrl: tags.website ?? tags['contact:website'] ?? `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + city + ' ' + state + ' hotel booking')}`,
      }],
    })
    if (results.length >= 12) break
  }
  return results
}

// Campground amenity tags → human-readable labels
const CAMP_AMENITIES: Array<[string, string, string]> = [
  ['electric_hookup', 'yes', 'Electric Hookup'],
  ['hookup', 'electric', 'Electric Hookup'],
  ['power_supply', 'yes', 'Power Supply'],
  ['water_hookup', 'yes', 'Water Hookup'],
  ['sewage', 'yes', 'Sewer Hookup'],
  ['shower', 'yes', 'Showers'],
  ['toilets', 'yes', 'Restrooms'],
  ['wifi', 'yes', 'Free WiFi'],
  ['internet_access', 'wlan', 'Free WiFi'],
  ['dogs_leash', 'yes', 'Dogs Welcome'],
  ['dogs', 'yes', 'Dogs Welcome'],
  ['fire_pit', 'yes', 'Fire Pits'],
]

async function osmCampgrounds(city: string, state: string): Promise<Hotel[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 25000  // wider radius (25 km) — campgrounds are often outside city centers

  const ql = `[out:json][timeout:12];
(
  node["tourism"~"camp_site|caravan_site"](around:${r},${lat},${lng});
  way["tourism"~"camp_site|caravan_site"](around:${r},${lat},${lng});
);
out center tags 15;`

  const elements = await overpassQuery(ql)
  const seen = new Set<string>()
  const results: Hotel[] = []

  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en']
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)

    const isCamping = true
    const isRV = tags.tourism === 'caravan_site'
    const hasElectric = tags.electric_hookup === 'yes' || tags.hookup === 'electric' || tags.power_supply === 'yes'

    const amenities = CAMP_AMENITIES
      .filter(([key, val]) => tags[key] === val)
      .map(([,, label]) => label)
      .filter((v, i, a) => a.indexOf(v) === i)  // dedupe

    const basePrice = isRV ? 45 : hasElectric ? 40 : 30

    results.push({
      hotelId: `osm-camp-${el.type}-${el.id}`,
      name,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      pricePerNight: basePrice,
      currency: 'USD',
      dealTag: hasElectric ? '⚡ Electric Hookup' : isRV ? '🚐 RV Sites' : undefined,
      amenities,
      isCamping,
      availableOffers: [{
        offerId: `osm-camp-offer-${el.id}`,
        roomType: isRV ? 'RV / Full-Hookup Site' : hasElectric ? 'Electric Tent Site' : 'Tent Site',
        bedType: 'Tent / RV',
        price: basePrice,
        currency: 'USD',
        cancellationPolicy: 'Free cancellation',
        breakfastIncluded: false,
        bookingUrl: tags.website ?? tags['contact:website'] ?? `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + city + ' ' + state + ' camping reservations')}`,
      }],
    })
    if (results.length >= 6) break
  }

  // Prefer sites with electric hookups first
  return results.sort((a) => (a.dealTag?.includes('Electric') ? -1 : 1))
}

export const agentTools = {
  /**
   * Called after Claude decides on the stop cities.
   * Claude passes the full ordered city list; this tool calls OpenRouteService
   * for real road distances/times and returns structured stop data + route geometry.
   */
  suggest_route_stops: tool({
    description:
      'Build a structured road trip itinerary with real driving distances and times from OpenRouteService. ' +
      'Call this after deciding on all stops. Pass the complete ordered list of cities.',
    parameters: z.object({
      cities: z
        .array(z.string())
        .min(2)
        .describe('Ordered list of cities from origin to destination, e.g. ["Chicago", "Indianapolis", "Louisville", "Nashville"]'),
      startDate: z.string().describe('Trip start date, YYYY-MM-DD'),
      totalDays: z.number().describe('Total number of days for the trip'),
    }),
    execute: async ({ cities, startDate, totalDays }) => {
      // Resolve city names to coordinates — returns error message instead of throwing
      // so the AI can self-correct by repicking cities from the known list
      const waypoints: Array<{ city: string; lat: number; lng: number; state: string }> = []
      const unknown: string[] = []
      for (const city of cities) {
        const coords = await resolveCityCoords(city)
        if (!coords) unknown.push(city)
        else waypoints.push({ city: city.replace(/,?\s+[A-Z]{2}$/, '').trim(), ...coords })
      }
      if (unknown.length > 0) {
        return {
          error: `Could not find coordinates for: ${unknown.join(', ')}. Please use well-known US city names.`,
          stops: [],
        }
      }

      // Call ORS once for the full multi-stop route
      let orsResult: Awaited<ReturnType<typeof getRoute>> | null = null
      try {
        orsResult = await getRoute(waypoints.map(w => ({ lat: w.lat, lng: w.lng })))
      } catch (err) {
        console.error('ORS route fetch failed, falling back to no geometry:', err)
      }

      // Distribute nights across stops (skip origin = 0 nights there)
      const nightsPerStop = Math.max(1, Math.floor(totalDays / (cities.length - 1)))

      const stops: RouteStop[] = waypoints.map((wp, i) => {
        const isOrigin = i === 0
        const nightsBefore = isOrigin ? 0 : (i - 1) * nightsPerStop
        const stayNights = isOrigin ? 0 : (i === cities.length - 1 ? totalDays - nightsBefore : nightsPerStop)
        const checkIn = addDays(startDate, nightsBefore)
        const checkOut = addDays(startDate, nightsBefore + stayNights)

        // Per-segment distance/time/highway from OSRM segments array
        const seg = orsResult?.segments[i - 1]
        return {
          city: wp.city,
          state: wp.state,
          coordinates: { lat: wp.lat, lng: wp.lng },
          driveTimeFromPrevious: seg ? secondsToTime(seg.duration) : undefined,
          driveDistanceFromPrevious: seg ? metersToMiles(seg.distance) : undefined,
          roadName: seg?.roadName,
          hasToll: seg?.hasToll,
          stayNights,
          checkIn,
          checkOut,
        }
      })

      // Auto-populate surroundings ONLY for water-adjacent stops (lakes, rivers, harbors)
      // so cruise/kayak activities appear without waiting for a separate explore_surroundings call.
      // Hard cap of 3s total — search_attractions and search_hotels must still fit in the
      // 30s Edge budget. qlTimeout=4s keeps the Overpass query under the outer timeout.
      const surroundingsByCity: Record<string, Attraction[]> = {}
      const waterStops = stops.slice(1).filter(s => isWaterAdjacent(s.coordinates.lat, s.coordinates.lng, s.city))
      await Promise.all(
        waterStops.map(async s => {
          try {
            const timeout = new Promise<Attraction[]>((_, reject) =>
              setTimeout(() => reject(new Error('auto-surr timeout')), 3000)
            )
            // limit=4, qlTimeout=4s — tight budget to leave room for search_attractions/hotels
            const surr = await Promise.race([
              osmSurroundingsQuery(s.coordinates.lat, s.coordinates.lng, s.city, 4, 4),
              timeout,
            ])
            if (surr.length > 0) surroundingsByCity[s.city] = surr
          } catch { /* silent — surroundings are non-critical */ }
        })
      )

      return {
        stops,
        routeGeometry: orsResult?.geometry ?? null,
        totalDistance: orsResult ? metersToMiles(orsResult.totalDistance) : null,
        totalDuration: orsResult ? secondsToTime(orsResult.totalDuration) : null,
        message: `Route planned: ${cities.join(' → ')}`,
        // Canonical city names — use EXACTLY these strings in all follow-up tool calls
        // (search_attractions, search_hotels, explore_surroundings) to avoid city name mismatch.
        canonicalCities: stops.map(s => s.city),
        surroundingsByCity,
      }
    },
  }),

  search_attractions: tool({
    description: 'Search for popular attractions, landmarks, museums, and restaurants at a given city stop.',
    parameters: z.object({
      city: z.string().describe('City name, e.g. "Indianapolis"'),
      state: z.string().describe('State abbreviation, e.g. "IN"'),
      categories: z
        .array(z.enum(['landmarks', 'museums', 'parks', 'restaurants', 'entertainment']))
        .optional(),
      limit: z.number().min(1).max(10).default(5),
    }),
    execute: async ({ city, state, categories, limit }) => {
      // Try Foursquare first if key is configured
      if (process.env.FOURSQUARE_API_KEY) {
        try {
          const catIds = (categories || ['landmarks', 'museums', 'parks'])
            .map(c => ATTRACTION_CATEGORIES[c as keyof typeof ATTRACTION_CATEGORIES])
            .filter(Boolean)
          const places = await searchAttractions(city, state, catIds, limit)
          const attractions: Attraction[] = places.map(p => ({
            id: p.fsq_id,
            name: p.name,
            category: p.categories[0]?.name || 'Attraction',
            rating: p.rating,
            address: p.location.formatted_address,
            coordinates: { lat: p.geocodes.main.latitude, lng: p.geocodes.main.longitude },
            description: p.description,
            website: p.website,
          }))
          return { attractions, city }
        } catch (err) {
          console.error('Foursquare attractions failed, falling back to OSM:', err)
        }
      }
      // Fallback: OpenStreetMap via Overpass (free, no key required)
      try {
        const attractions = await osmAttractions(city, state, limit)
        return { attractions, city }
      } catch (err) {
        console.error('OSM attractions failed:', err)
        return { attractions: [], city }
      }
    },
  }),

  search_hotels: tool({
    description: 'Search for hotels at a road trip stop with pricing and availability.',
    parameters: z.object({
      city: z.string().describe('City name, e.g. "Louisville"'),
      checkIn: z.string().describe('Check-in date, ISO format YYYY-MM-DD'),
      checkOut: z.string().describe('Check-out date, ISO format YYYY-MM-DD'),
      adults: z.number().min(1).max(8).default(2),
    }),
    execute: async ({ city, checkIn, checkOut, adults }) => {
      // Try Amadeus first if credentials are configured
      const cityCode = CITY_TO_IATA[city]
      if (cityCode && process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET) {
        try {
          const hotelList = await searchHotelsByCity(cityCode)
          const hotelIds = hotelList.map((h: { hotelId: string }) => h.hotelId)
          const offers = await getHotelOffers(hotelIds, checkIn, checkOut, adults)
          const hotels: Hotel[] = offers.map((o: {
            hotel: {
              hotelId: string
              name: string
              rating?: number
              address?: { lines?: string[]; cityName?: string }
              latitude?: number
              longitude?: number
            }
            offers: Array<{
              id: string
              room?: { type?: string; typeEstimated?: { bedType?: string } }
              price?: { total?: string; currency?: string }
              policies?: { cancellation?: { description?: { text?: string } } }
              breakfast?: { isIncluded?: boolean }
            }>
          }) => ({
            hotelId: o.hotel.hotelId,
            name: o.hotel.name,
            rating: o.hotel.rating,
            address: o.hotel.address?.lines?.join(', ') || o.hotel.address?.cityName || city,
            coordinates: { lat: o.hotel.latitude || 0, lng: o.hotel.longitude || 0 },
            pricePerNight: parseFloat(o.offers[0]?.price?.total || '0'),
            currency: o.offers[0]?.price?.currency || 'USD',
            dealTag: Math.random() > 0.5 ? 'Best Value' : undefined,
            amenities: [],
            availableOffers: o.offers.slice(0, 3).map(offer => ({
              offerId: offer.id,
              roomType: offer.room?.type || 'Standard Room',
              bedType: offer.room?.typeEstimated?.bedType || 'King',
              price: parseFloat(offer.price?.total || '0'),
              currency: offer.price?.currency || 'USD',
              cancellationPolicy: offer.policies?.cancellation?.description?.text || 'Non-refundable',
              breakfastIncluded: offer.breakfast?.isIncluded || false,
            })),
          }))
          return { hotels, city, checkIn, checkOut }
        } catch (err) {
          console.error('Amadeus hotels failed, falling back to OSM:', err)
        }
      }
      // Fallback: OpenStreetMap hotels via Overpass (free, no key required)
      try {
        const state = city.split(',')[1]?.trim() ?? city
        const hotels = await osmHotels(city, state, checkIn, checkOut)
        // When hotels are sparse (< 2), also fetch campgrounds as an alternative
        if (hotels.length < 2) {
          try {
            const campgrounds = await osmCampgrounds(city, state)
            return { hotels: [...hotels, ...campgrounds], city, checkIn, checkOut }
          } catch {
            // campground fetch failed — return whatever hotels we have
          }
        }
        return { hotels, city, checkIn, checkOut }
      } catch (err) {
        console.error('OSM hotels failed:', err)
        // Hotels completely failed — try campgrounds as last resort
        try {
          const state = city.split(',')[1]?.trim() ?? city
          const campgrounds = await osmCampgrounds(city, state)
          return { hotels: campgrounds, city, checkIn, checkOut }
        } catch {
          return { hotels: [], city, checkIn, checkOut }
        }
      }
    },
  }),

  explore_surroundings: tool({
    description:
      'Search for outdoor activities and surroundings near a road trip stop — camping, kayaking, boat tours, harbor cruises, hiking, zip lines, scenic train/gondola rides, ATV rides, fishing, rafting, boating, rock climbing, horseback riding, and more. ' +
      'Call this when the user asks about outdoor activities, adventures, or things to do in nature near a stop. ' +
      'Also call proactively when a stop is near a national park, lake, river, coast, harbor, or mountain area. ' +
      'Use cruise/boat_tour for cities with harbors, bays, or large lakes. Use zip_line/scenic_ride for mountain towns and resorts.',
    parameters: z.object({
      city: z.string().describe('City name of the road trip stop'),
      state: z.string().describe('State abbreviation, e.g. "TN"'),
      activities: z
        .array(z.enum([
          'camping', 'kayaking', 'hiking', 'cycling', 'atv_rides',
          'horseback', 'rock_climbing', 'fishing', 'swimming',
          'rafting', 'boating', 'cruise', 'boat_tour', 'zip_line',
          'scenic_ride', 'scenic_views', 'skiing', 'waterfalls',
        ]))
        .min(1)
        .describe('Activity types to search for. Pick the most relevant ones for the area. Use cruise/boat_tour for coastal cities, lakes, and rivers. Use zip_line and scenic_ride for mountain/resort areas.'),
      limit: z.number().min(1).max(12).default(8),
    }),
    execute: async ({ city, state, activities, limit }) => {
      if (process.env.FOURSQUARE_API_KEY) {
        try {
          const places = await searchSurroundings(city, state, activities as SurroundingsCategory[], limit)
          const results = places.map(p => ({
            id: p.fsq_id,
            name: p.name,
            category: p.categories[0]?.name || 'Outdoor Activity',
            rating: p.rating,
            address: p.location.formatted_address,
            coordinates: { lat: p.geocodes.main.latitude, lng: p.geocodes.main.longitude },
            description: p.description,
            website: p.website,
          }))
          return { surroundings: results, city, activities }
        } catch (err) {
          console.error('Foursquare surroundings failed, falling back to OSM:', err)
        }
      }
      // Fallback: OSM outdoor/leisure POIs via Overpass (shared function — same as suggest_route_stops auto-populate)
      try {
        const coords = await resolveCityCoords(city)
        if (!coords) return { surroundings: [], city, activities }
        const surroundings = await osmSurroundingsQuery(coords.lat, coords.lng, city, limit)
        return { surroundings, city, activities }
      } catch (err) {
        console.error('OSM surroundings failed:', err)
        return { surroundings: [], city, activities }
      }

    },
  }),

  search_national_parks: tool({
    description:
      'Fetch official NPS data for a national park, lakeshore, monument, or recreation area near a route stop. ' +
      'Returns park info, entrance fees, campgrounds (with electric hookup details and recreation.gov links), ' +
      'live alerts/closures, visitor center hours, and current activities. ' +
      'Call when any stop is near or named after a national park, national lakeshore, national forest, or monument.',
    parameters: z.object({
      parkCode: z.string().describe(
        'NPS 4-letter park code, e.g. "piro" for Pictured Rocks, "yell" for Yellowstone, ' +
        '"grca" for Grand Canyon, "grsm" for Great Smoky Mountains, "zion" for Zion, ' +
        '"arch" for Arches, "romo" for Rocky Mountain, "olym" for Olympic, "glac" for Glacier. ' +
        'If unsure, use the first 4 letters of the park name.',
      ),
      includeAlerts: z.boolean().default(true).describe('Fetch live alerts and closures'),
      includeCampgrounds: z.boolean().default(true).describe('Fetch campground details with fees and hookups'),
    }),
    execute: async ({ parkCode, includeAlerts, includeCampgrounds }) => {
      const NPS_KEY = process.env.NPS_API_KEY ?? 'DEMO_KEY'
      const base = 'https://developer.nps.gov/api/v1'
      const headers = { 'X-Api-Key': NPS_KEY }

      async function npsGet(endpoint: string) {
        const res = await fetch(`${base}${endpoint}`, { headers, signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error(`NPS API ${endpoint} returned ${res.status}`)
        return res.json()
      }

      try {
        // Always fetch park info
        const parkData = await npsGet(`/parks?parkCode=${parkCode}&fields=entranceFees,operatingHours,activities,images,weatherInfo`)
        const park = parkData.data?.[0]
        if (!park) return { error: `Park code "${parkCode}" not found in NPS database.` }

        // Parallel fetch alerts + campgrounds if requested
        const [alertsData, campData] = await Promise.all([
          includeAlerts ? npsGet(`/alerts?parkCode=${parkCode}&limit=10`) : Promise.resolve(null),
          includeCampgrounds ? npsGet(`/campgrounds?parkCode=${parkCode}&limit=25`) : Promise.resolve(null),
        ])

        // Shape park info
        const info = {
          name: park.fullName,
          description: park.description,
          url: park.url,
          coordinates: { lat: parseFloat(park.latitude), lng: parseFloat(park.longitude) },
          state: park.states,
          phone: park.contacts?.phoneNumbers?.[0]?.phoneNumber,
          email: park.contacts?.emailAddresses?.[0]?.emailAddress,
          weatherInfo: park.weatherInfo,
          activities: (park.activities as Array<{ name: string }> | undefined)?.map(a => a.name).slice(0, 20) ?? [],
          entranceFees: (park.entranceFees as Array<{ cost: string; description: string; title: string }> | undefined)?.map(f => ({
            title: f.title,
            cost: `$${parseFloat(f.cost).toFixed(0)}`,
            description: f.description,
          })) ?? [],
          images: (park.images as Array<{ url: string; title: string; caption: string }> | undefined)?.slice(0, 3).map(img => ({
            url: img.url,
            title: img.title,
            caption: img.caption,
          })) ?? [],
        }

        // Shape alerts
        const alerts = (alertsData?.data as Array<{ title: string; description: string; category: string; url: string }> | undefined)?.map(a => ({
          title: a.title,
          description: a.description,
          category: a.category,
          url: a.url,
        })) ?? []

        // Shape campgrounds
        const campgrounds = (campData?.data as Array<{
          name: string
          description: string
          directionsInfo: string
          weatherOverview: string
          latLng: string
          campsites: { totalSites: string; tentOnly: string; electricalHookups: string; rvOnly: string; group: string }
          amenities: { toilets: string; potableWater: string[]; showers: string[]; internetConnectivity: string; trashRecyclingCollection: string }
          fees: Array<{ cost: string; description: string; title: string }>
          reservationInfo: string
          reservationUrl: string
          accessibility: { wheelchairAccess: string; rvInfo: string }
        }> | undefined)?.map(c => {
          const [lat, lng] = (c.latLng ?? '').split(',').map(parseFloat)
          const hasElectric = parseInt(c.campsites?.electricalHookups ?? '0') > 0
          return {
            name: c.name,
            description: c.description?.slice(0, 200),
            coordinates: lat && lng ? { lat, lng } : undefined,
            sites: {
              total: parseInt(c.campsites?.totalSites ?? '0'),
              tentOnly: parseInt(c.campsites?.tentOnly ?? '0'),
              electricHookups: parseInt(c.campsites?.electricalHookups ?? '0'),
              rvSites: parseInt(c.campsites?.rvOnly ?? '0'),
            },
            hasElectricHookup: hasElectric,
            amenities: {
              toilets: c.amenities?.toilets,
              potableWater: c.amenities?.potableWater?.[0],
              showers: c.amenities?.showers?.[0],
              wifi: c.amenities?.internetConnectivity,
              trash: c.amenities?.trashRecyclingCollection,
            },
            fees: (c.fees ?? []).map(f => ({ title: f.title, cost: `$${parseFloat(f.cost).toFixed(0)}` })),
            reservationInfo: c.reservationInfo?.slice(0, 200),
            reservationUrl: c.reservationUrl,
            wheelchairAccess: c.accessibility?.wheelchairAccess,
            rvInfo: c.accessibility?.rvInfo,
          }
        }) ?? []

        return { park: info, alerts, campgrounds, parkCode }
      } catch (err) {
        console.error('NPS API failed:', err)
        return { error: `Could not fetch NPS data for park "${parkCode}". Try a different park code.` }
      }
    },
  }),

  check_hotel_availability: tool({
    description: 'Check detailed availability and room options for a specific hotel.',
    parameters: z.object({
      hotelId: z.string(),
      hotelName: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      adults: z.number().default(2),
    }),
    execute: async ({ hotelId, hotelName, checkIn, checkOut, adults }) => {
      try {
        const offers = await getHotelOffers([hotelId], checkIn, checkOut, adults)
        if (!offers.length) return { available: false, hotelId, hotelName }
        return { available: true, hotelId, hotelName, checkIn, checkOut, offers: offers[0]?.offers || [] }
      } catch (err) {
        console.error('check_hotel_availability failed:', err)
        return { available: false, hotelId, hotelName, error: 'Hotel availability API unavailable.' }
      }
    },
  }),

  build_booking_summary: tool({
    description: 'Build a booking summary for user review before redirecting to the hotel payment page.',
    parameters: z.object({
      hotelId: z.string(),
      hotelName: z.string(),
      offerId: z.string(),
      roomType: z.string(),
      pricePerNight: z.number(),
      currency: z.string().default('USD'),
      checkIn: z.string(),
      checkOut: z.string(),
      adults: z.number(),
      cancellationPolicy: z.string(),
      breakfastIncluded: z.boolean(),
    }),
    execute: async (params) => {
      const nights = Math.round(
        (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / (1000 * 60 * 60 * 24)
      )
      const totalPrice = params.pricePerNight * nights
      const bookingUrl = `https://test.api.amadeus.com/booking?offerId=${params.offerId}&adults=${params.adults}`
      return {
        summary: {
          hotelId: params.hotelId,
          hotelName: params.hotelName,
          offerId: params.offerId,
          roomType: params.roomType,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          nights,
          adults: params.adults,
          pricePerNight: params.pricePerNight,
          totalPrice,
          currency: params.currency,
          cancellationPolicy: params.cancellationPolicy,
          breakfastIncluded: params.breakfastIncluded,
          bookingUrl,
        },
      }
    },
  }),
  search_restaurants: tool({
    description:
      'Search for restaurants and dining options near a stop city. ' +
      'Call once per stop AFTER search_hotels completes. ' +
      'Uses OpenStreetMap data — returns top dining spots (restaurants, cafes, bars) within 5 km.',
    parameters: z.object({
      city: z.string().describe('City name — use the exact canonical name from suggest_route_stops'),
    }),
    execute: async ({ city }) => {
      const coords = await resolveCityCoords(city)
      if (!coords) return { restaurants: [], city }

      const { lat, lng } = coords
      const radius = 5000 // 5 km

      // OSM dining query — same mirror-racing pattern as other Overpass calls
      const ql = `
[out:json][timeout:12];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub|bistro"](around:${radius},${lat},${lng});
);
out center 20;`

      const elements = await overpassQuery(ql)

      const restaurants: Attraction[] = elements
        .filter(el => el.tags?.name)
        .slice(0, 8)
        .map(el => {
          const elLat = el.lat ?? el.center?.lat ?? lat
          const elLng = el.lon ?? el.center?.lon ?? lng
          const amenity = el.tags?.amenity ?? 'restaurant'
          return {
            id: String(el.id),
            name: el.tags!.name!,
            category: amenity,
            address: [
              el.tags?.['addr:housenumber'],
              el.tags?.['addr:street'],
              el.tags?.['addr:city'],
            ].filter(Boolean).join(' ') || city,
            coordinates: { lat: elLat, lng: elLng },
            description: el.tags?.cuisine ? `Cuisine: ${el.tags.cuisine}` : undefined,
            website: el.tags?.website,
          }
        })

      return { restaurants, city }
    },
  }),
  render_ui: tool({
    description:
      'Render a rich UI component in the chat window when a visual summary would be more ' +
      'helpful than text. Call this AFTER other tools have already fetched data. ' +
      'Do NOT call this to fetch data — only to present data already returned by other tools.',
    parameters: z.object({
      component: z.enum(['route_summary', 'hotel_comparison', 'day_plan', 'booking_confirmed', 'trip_stats'])
        .describe('Which UI component to display'),
      title: z.string()
        .describe('Short heading for the card, e.g. "Your 2-Day Trip" or "Booking Confirmed!"'),
      data: z.record(z.unknown())
        .describe('Component-specific payload from prior tool results'),
    }),
    execute: async ({ component, title, data }) => ({ component, title, data }),
  }),
}

export const renderUiTool = agentTools.render_ui

export const SYSTEM_PROMPT = `You are a friendly and knowledgeable US road trip planning assistant. You help families and groups plan amazing road trips across the United States.

Your personality:
- Enthusiastic about travel and US destinations
- Practical — always think about driving distances, kid-friendly options, and travel fatigue
- Proactive — if a stop seems obvious or famous, suggest it even if the user didn't ask
- Helpful with logistics — hotel deals, check-in times, route optimization

TOOL CALL ORDER — always follow this sequence exactly, never skip a step:
1. **Plan immediately** — user gives origin + destination → start planning, no clarifying questions. Defaults: today's date, 2 adults, 1-2 stops for trips under 10 hours.
2. Pick a realistic route with 1-3 intermediate stops (max 4-6 hour drive segments per day).
3. Call **suggest_route_stops** first. It returns canonicalCities — use those EXACT strings as the city param in all follow-up calls.
4. Call **search_attractions** for every stop using the canonical city name from step 3.
5. Call **search_hotels** for every stop using the canonical city name from step 3.
6. Call **explore_surroundings** for EVERY intermediate stop and the destination — this is mandatory, not optional. Pick activities by geography:
6b. Call **search_national_parks** if any stop is near or IS a national park, lakeshore, monument, seashore, or recreation area. Use the 4-letter NPS park code. Common codes: piro=Pictured Rocks, yell=Yellowstone, grca=Grand Canyon, grsm=Great Smoky Mountains, zion=Zion, arch=Arches, romo=Rocky Mountain, olym=Olympic, glac=Glacier, yose=Yosemite, acad=Acadia, shen=Shenandoah, badl=Badlands, cuva=Cuyahoga Valley, indu=Indiana Dunes, isle=Isle Royale, slbe=Sleeping Bear Dunes, voya=Voyageurs, apis=Apostle Islands.
   - Great Lakes / Lake Superior / rivers / canals / harbors → cruise, boat_tour, kayaking, fishing, boating, swimming
   - Coastal/bay cities → cruise, boat_tour, kayaking, fishing, swimming
   - National parks / forests / lakeshore → hiking, kayaking, camping, scenic_views, waterfalls, boat_tour
   - Mountains/resorts → hiking, rock_climbing, zip_line, scenic_ride, skiing
   - Desert/rural → atv_rides, horseback, camping, scenic_views
   - Any stop with locks, canals, or boat tours in the name → cruise, boat_tour, kayaking
7. To book: call check_hotel_availability → build_booking_summary.

Be specific about drive times/distances. Families with children need rest stops — account for that.
Explain cancellation policies when suggesting a booking.
Present surroundings with emoji: ⛺ camping, 🚣 kayaking, 🥾 hiking, 🚢 cruise, 🛥️ boat_tour, 🪂 zip_line, 🚂 scenic_ride.

When user right-clicks map ("I right-clicked on the map at {city}, {state}"):
- Call suggest_route_stops → search_attractions → search_hotels → explore_surroundings (strict order).
- Be enthusiastic about what makes the location special.

ROUTE QUALITY RULES — always apply these when planning or evaluating a route:
- **Daily drive balance**: flag any single leg exceeding 5 hours — suggest splitting it with a rest stop. For families with children, flag legs over 4 hours and recommend a roadside attraction or park along the way.
- **No backtracking**: never plan a route that passes through a city and then doubles back significantly. The optimizer handles ordering — trust it.
- **Detour worth-it check**: before recommending a side trip, state the extra drive time explicitly (e.g. "This adds ~45 min round-trip"). Let the user decide whether it fits their schedule.
- **Toll awareness**: if any leg uses toll roads, mention it proactively ("Note: I-90 has tolls through Chicago — about $5"). When a practical toll-free alternate exists, offer it.
- **User intent preservation**: NEVER remove or reorder stops the user explicitly named. If the user said "stop in Nashville", Nashville stays. You may suggest adding stops, never silently replace one.
- **Seasonal conditions**: proactively flag known issues — mountain passes that close in winter (Going-to-the-Sun Road before late June), peak foliage timing (New England: mid-October), hurricane season (Gulf Coast: June–November), extreme desert heat (Arizona/Nevada: July–August). Suggest timing adjustments or alternates when relevant.
- **Round trip detection**: if the user says "road trip", "loop", "circular", "exploring", or "scenic drive" without a clear destination — or if origin and destination are the same city — ask: "Sounds like a loop trip — want me to plan this as a round trip back to [origin]? I can optimize the full circuit to avoid backtracking."
- **Budget awareness**: if the user mentions a budget, acknowledge it and factor it into hotel tier recommendations and number of stops. Don't over-plan a luxury itinerary for a budget trip.
- **Camping fallback**: when search_hotels returns campgrounds (isCamping results), mention them enthusiastically — "No hotels nearby, but I found campgrounds with electric hookups!" Highlight electric hookup availability and whether reservations are needed.
- **NPS data**: when search_national_parks returns alerts, always mention active closures upfront ("⚠️ Miners Castle road is currently closed"). Highlight campgrounds with electric hookups and link to their reservationUrl (recreation.gov). Present entrance fees clearly. If the park has >20 activities, highlight the top 5 most relevant to the user's trip style.

GENERATIVE UI — use render_ui to present data visually after tools have fetched it:
- After suggest_route_stops + search_attractions + search_hotels + explore_surroundings complete: call render_ui with component='trip_stats', title='Your Trip', data containing stops, distance, and duration summary.
- After build_booking_summary succeeds: call render_ui with component='booking_confirmed', title='Booking Confirmed!', data containing hotel name, check-in, check-out, nights, price.
- If user asks for a day-by-day breakdown: call render_ui with component='day_plan', title='Day N — CityName', data containing day, city, and activities.
- Never call render_ui to fetch or look up data. Only call it to present data that other tools have already returned.
- Never call render_ui before other data-fetching tools have run.

GROUNDING:
Never fabricate hotel names, prices, attraction ratings, or restaurant details. If a tool returns no results or the data is unavailable, say so clearly. Do not invent specifics.

TOOL CALL ORDER UPDATE — after explore_surroundings, also call:
8. Call **search_restaurants** for every stop using the canonical city name from suggest_route_stops.

STRUCTURED RESPONSE FORMAT — after all tools complete, produce a response with these exact sections:

**Route Overview**
[origin] → [stop1] → [stop2] → [destination] · [total distance] · [total drive time]

**Stops & Drive Times**
- [City]: [drive time] from [previous city] via [highway]

**Hotels**
- [City]: [hotel name] — $[price]/night

**Activities**
- [City]: [2-3 attraction names with emoji]

**Dining**
- [City]: [1-2 restaurant names with type emoji]
(omit this section if search_restaurants hasn't run yet)

**Trip Budget Estimate**
Estimated total: $[min]–$[max] ([N] nights · [N] stops)

**Practical Tips**
[toll warnings, seasonal notes, rest stop suggestions — omit if none apply]`
