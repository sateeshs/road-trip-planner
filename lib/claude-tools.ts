import { tool } from 'ai'
import { z } from 'zod'
import { searchAttractions, searchSurroundings, ATTRACTION_CATEGORIES, type SurroundingsCategory } from './foursquare-client'
import { searchHotelsByCity, getHotelOffers, CITY_TO_IATA } from './amadeus-client'
import { addDays, resolveCityCoords } from './route-utils'
import { getRoute, metersToMiles, secondsToTime } from './osrm-client'
import type { RouteStop, Attraction, Hotel } from '@/types'

// ─── Overpass API (OpenStreetMap, free, no key) ────────────────────────────
// Races 4 public mirrors via Promise.any() — first to respond wins.
// Pattern ported from TREK's mapsService.ts overpassFetch().

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface OsmElement {
  id: number
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// In-memory POI cache — 5-min TTL, 500-entry FIFO cap (ported from TREK)
const POI_CACHE = new Map<string, { at: number; elements: OsmElement[] }>()
const POI_CACHE_TTL_MS = 5 * 60 * 1000
const POI_CACHE_MAX = 500

async function overpassQuery(ql: string): Promise<OsmElement[]> {
  // Cache check
  const cached = POI_CACHE.get(ql)
  if (cached) {
    if (Date.now() - cached.at < POI_CACHE_TTL_MS) return cached.elements
    POI_CACHE.delete(ql)
  }

  const body = `data=${encodeURIComponent(ql)}`
  const controllers: AbortController[] = []

  const attempt = async (url: string): Promise<OsmElement[]> => {
    const ctrl = new AbortController()
    controllers.push(ctrl)
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url}`)
      const data = await res.json() as { elements?: OsmElement[]; remark?: string }
      // Overpass signals timeout via 'remark' even on HTTP 200
      if (data.remark) throw new Error(`Overpass remark @ ${url}`)
      if (!Array.isArray(data.elements)) throw new Error(`Non-OSM body @ ${url}`)
      return data.elements
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    const elements = await Promise.any(OVERPASS_MIRRORS.map(attempt))
    // Store in cache
    if (POI_CACHE.size >= POI_CACHE_MAX) {
      const oldest = POI_CACHE.keys().next().value
      if (oldest !== undefined) POI_CACHE.delete(oldest)
    }
    POI_CACHE.set(ql, { at: Date.now(), elements })
    return elements
  } catch {
    return []
  } finally {
    // Cancel all losing / in-flight requests
    for (const ctrl of controllers) { try { ctrl.abort() } catch { /* noop */ } }
  }
}

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
        const hotels = await osmHotels(city, city.split(',')[0], checkIn, checkOut)
        return { hotels, city, checkIn, checkOut }
      } catch (err) {
        console.error('OSM hotels failed:', err)
        return { hotels: [], city, checkIn, checkOut }
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
}

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
- **Budget awareness**: if the user mentions a budget, acknowledge it and factor it into hotel tier recommendations and number of stops. Don't over-plan a luxury itinerary for a budget trip.`
