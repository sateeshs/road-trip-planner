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

        // Per-segment distance/time from ORS segments array
        const seg = orsResult?.segments[i - 1]
        return {
          city: wp.city,
          state: wp.state,
          coordinates: { lat: wp.lat, lng: wp.lng },
          driveTimeFromPrevious: seg ? secondsToTime(seg.duration) : undefined,
          driveDistanceFromPrevious: seg ? metersToMiles(seg.distance) : undefined,
          stayNights,
          checkIn,
          checkOut,
        }
      })

      return {
        stops,
        routeGeometry: orsResult?.geometry ?? null,  // [lat, lng][] for Leaflet
        totalDistance: orsResult ? metersToMiles(orsResult.totalDistance) : null,
        totalDuration: orsResult ? secondsToTime(orsResult.totalDuration) : null,
        message: `Route planned: ${cities.join(' → ')}`,
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
      'Search for outdoor activities and surroundings near a road trip stop — camping, kayaking, hiking, ATV rides, fishing, rafting, boating, rock climbing, horseback riding, and more. ' +
      'Call this when the user asks about outdoor activities, adventures, or things to do in nature near a stop. ' +
      'Also call proactively when a stop is near a national park, lake, river, or mountain area.',
    parameters: z.object({
      city: z.string().describe('City name of the road trip stop'),
      state: z.string().describe('State abbreviation, e.g. "TN"'),
      activities: z
        .array(z.enum([
          'camping', 'kayaking', 'hiking', 'cycling', 'atv_rides',
          'horseback', 'rock_climbing', 'fishing', 'swimming',
          'rafting', 'boating', 'scenic_views', 'skiing', 'waterfalls',
        ]))
        .min(1)
        .describe('Activity types to search for. Pick the most relevant ones for the area.'),
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
      // Fallback: OSM outdoor/leisure POIs via Overpass (fast grouped tilde queries)
      try {
        const coords = await resolveCityCoords(city)
        if (!coords) return { surroundings: [], city, activities }
        const { lat, lng } = coords
        const r = 30000  // 30 km radius for outdoor activities
        const ql = `[out:json][timeout:10];
(
  node["leisure"~"park|nature_reserve|marina|swimming_pool|golf_course"](around:${r},${lat},${lng});
  node["sport"~"hiking|cycling|kayak|canoe|climbing|fishing|skiing|swimming|rafting"](around:${r},${lat},${lng});
  node["tourism"~"camp_site|caravan_site"](around:${r},${lat},${lng});
  node["natural"~"waterfall|beach|peak|hot_spring"](around:${r},${lat},${lng});
);
out ${limit * 2};`
        const elements = await overpassQuery(ql)
        const seen = new Set<string>()
        const surroundings: Attraction[] = []
        for (const el of elements) {
          const elLat = el.lat ?? el.center?.lat
          const elLng = el.lon ?? el.center?.lon
          const tags = el.tags ?? {}
          const name = tags.name ?? tags['name:en'] ?? tags.brand
          if (!elLat || !elLng || !name || seen.has(name)) continue
          seen.add(name)
          const cat =
            tags.tourism === 'camp_site' ? 'Campground' :
            tags.tourism === 'caravan_site' ? 'RV Park' :
            tags.natural === 'waterfall' ? 'Waterfall' :
            tags.natural === 'beach' ? 'Beach' :
            tags.natural === 'peak' ? 'Mountain Peak' :
            tags.natural === 'hot_spring' ? 'Hot Spring' :
            tags.sport === 'kayak' || tags.sport === 'canoe' ? 'Kayaking' :
            tags.sport === 'climbing' ? 'Rock Climbing' :
            tags.sport === 'rafting' ? 'Rafting' :
            tags.sport ? tags.sport.charAt(0).toUpperCase() + tags.sport.slice(1) :
            tags.leisure === 'nature_reserve' ? 'Nature Reserve' :
            tags.leisure === 'marina' ? 'Marina' :
            tags.leisure ? tags.leisure.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
            'Outdoor Activity'
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

When planning a trip:
1. **Plan immediately** — if the user gives you an origin and destination (with or without exact dates), start planning right away. Do not ask clarifying questions upfront. Use sensible defaults: today's date if no date given, 2 adults if not specified, direct route with 1-2 stops for trips under 10 hours.
2. Decide on a realistic route with 1-3 intermediate stops (aim for 4-6 hour max drive segments per day for families)
3. Call suggest_route_stops with the COMPLETE ordered city list — this uses OpenStreetMap/OSRM routing (free, no API key). Pass any US city name — the system uses Nominatim geocoding to resolve any city automatically.
4. For each stop, call search_attractions to find top things to do
5. Proactively call search_hotels for each stop — find the best deals
6. When a user wants to book, call check_hotel_availability then build_booking_summary

Always be specific about driving times and distances. Families with kids need bathroom breaks and rest stops — account for that.
When you suggest a booking, always explain the cancellation policy clearly.

For outdoor/surroundings exploration:
- Call explore_surroundings proactively when a stop is near a national park, lake, river, mountain, or forest
- Suggest camping near national parks, kayaking near rivers/lakes, hiking near mountains, ATV near desert/rural areas
- When the user mentions interests like "outdoor", "nature", "adventure", "family activities" — call explore_surroundings for relevant stops
- Present surroundings results with their emoji (⛺ camping, 🚣 kayaking, 🥾 hiking, etc.) for quick scanning`
