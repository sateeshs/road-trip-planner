import { tool } from 'ai'
import { z } from 'zod'
import { searchAttractions, searchSurroundings, ATTRACTION_CATEGORIES, type SurroundingsCategory } from './foursquare-client'
import { searchHotelsByCity, getHotelOffers, CITY_TO_IATA } from './amadeus-client'
import { addDays, cityCoords } from './route-utils'
import { getRoute, metersToMiles, secondsToTime } from './openrouteservice'
import type { RouteStop, Attraction, Hotel } from '@/types'

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
        const coords = cityCoords(city)
        if (!coords) unknown.push(city)
        else waypoints.push({ city: city.replace(/,?\s+[A-Z]{2}$/, '').trim(), ...coords })
      }
      if (unknown.length > 0) {
        return {
          error: `Unknown cities: ${unknown.join(', ')}. Only use major US city names (no state suffix) from this list: Chicago, Indianapolis, Louisville, Nashville, Atlanta, Miami, New York, Philadelphia, Washington DC, Charlotte, Dallas, Houston, San Antonio, Austin, New Orleans, Memphis, St. Louis, Kansas City, Denver, Phoenix, Las Vegas, Los Angeles, San Francisco, Seattle, Portland, Minneapolis, Detroit, Cleveland, Columbus, Cincinnati, Pittsburgh, Baltimore, Boston, Tampa, Orlando, Jacksonville, Savannah, Richmond, Raleigh, Albuquerque, Oklahoma City, Tulsa, Little Rock, Jackson, Birmingham, Knoxville, Chattanooga, Lexington`,
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
      const cityCode = CITY_TO_IATA[city]
      if (!cityCode) return { hotels: [], error: `Unknown city: ${city}` }
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
      const offers = await getHotelOffers([hotelId], checkIn, checkOut, adults)
      if (!offers.length) return { available: false, hotelId, hotelName }
      return { available: true, hotelId, hotelName, checkIn, checkOut, offers: offers[0]?.offers || [] }
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
1. First understand: origin, destination, dates, number of travelers (adults/kids), and interests
2. Decide on a realistic route with 1-3 intermediate stops (aim for 4-6 hour max drive segments per day for families)
3. Call suggest_route_stops with the COMPLETE ordered city list — this fetches real road distances and times from OpenRouteService
   IMPORTANT: Pass only plain city names (no state suffix) from this exact list: Chicago, Indianapolis, Louisville, Nashville, Atlanta, Miami, New York, Philadelphia, Washington DC, Charlotte, Dallas, Houston, San Antonio, Austin, New Orleans, Memphis, St. Louis, Kansas City, Denver, Phoenix, Las Vegas, Los Angeles, San Francisco, Seattle, Portland, Minneapolis, Detroit, Cleveland, Columbus, Cincinnati, Pittsburgh, Baltimore, Boston, Tampa, Orlando, Jacksonville, Savannah, Richmond, Raleigh, Albuquerque, Oklahoma City, Tulsa, Little Rock, Jackson, Birmingham, Knoxville, Chattanooga, Lexington
   Pick the closest major city from the list if the exact city isn't available. Never pass a city not on this list.
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
