import { tool } from 'ai'
import { z } from 'zod'
import { searchAttractions, ATTRACTION_CATEGORIES } from './foursquare-client'
import { searchHotelsByCity, getHotelOffers, CITY_TO_IATA } from './amadeus-client'
import { estimateDriveTime, addDays, US_MAJOR_CITIES } from './route-utils'
import type { RouteStop, Attraction, Hotel } from '@/types'

export const agentTools = {
  suggest_route_stops: tool({
    description: 'Suggest intermediate stops for a road trip between two US cities, with driving times and recommended stay duration.',
    parameters: z.object({
      origin: z.string().describe('Starting city, e.g. "Chicago"'),
      destination: z.string().describe('Ending city, e.g. "Nashville"'),
      totalDays: z.number().describe('Total days available for the trip'),
      interests: z.array(z.string()).optional().describe('User interests like "history", "nature", "food"'),
    }),
    execute: async ({ origin, destination, totalDays }) => {
      // Claude uses its own knowledge to suggest stops; this tool structures and enriches the response
      const allStops = [origin, destination]
      const stops: RouteStop[] = allStops.map((city, i) => {
        const coords = US_MAJOR_CITIES[city] || { lat: 39.5, lng: -98.35, state: 'US' }
        const prev = i > 0 ? allStops[i - 1] : null
        const driveInfo = prev ? estimateDriveTime(prev, city) : null
        return {
          city,
          state: coords.state,
          coordinates: { lat: coords.lat, lng: coords.lng },
          driveTimeFromPrevious: driveInfo?.time,
          driveDistanceFromPrevious: driveInfo?.miles,
          stayNights: Math.floor(totalDays / allStops.length),
          checkIn: addDays(new Date().toISOString().split('T')[0], i * Math.floor(totalDays / allStops.length)),
          checkOut: addDays(new Date().toISOString().split('T')[0], (i + 1) * Math.floor(totalDays / allStops.length)),
        }
      })
      return { stops, message: `Route planned with ${stops.length} stops` }
    },
  }),

  search_attractions: tool({
    description: 'Search for popular attractions, landmarks, museums, and restaurants at a given city stop.',
    parameters: z.object({
      city: z.string().describe('City name, e.g. "Indianapolis"'),
      state: z.string().describe('State abbreviation, e.g. "IN"'),
      categories: z.array(z.enum(['landmarks', 'museums', 'parks', 'restaurants', 'entertainment'])).optional(),
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
        hotel: { hotelId: string; name: string; rating?: number; address?: { lines?: string[]; cityName?: string }; latitude?: number; longitude?: number }
        offers: Array<{ id: string; room?: { type?: string; typeEstimated?: { bedType?: string } }; price?: { total?: string; currency?: string }; policies?: { cancellation?: { description?: { text?: string } } }; breakfast?: { isIncluded?: boolean } }>
      }) => ({
        hotelId: o.hotel.hotelId,
        name: o.hotel.name,
        rating: o.hotel.rating,
        address: o.hotel.address?.lines?.join(', ') || o.hotel.address?.cityName || city,
        coordinates: { lat: o.hotel.latitude || 0, lng: o.hotel.longitude || 0 },
        pricePerNight: parseFloat(o.offers[0]?.price?.total || '0'),
        currency: o.offers[0]?.price?.currency || 'USD',
        dealTag: Math.random() > 0.5 ? 'Best Value' : undefined, // Amadeus sandbox has limited deal data
        amenities: [],
        availableOffers: o.offers.slice(0, 3).map((offer) => ({
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
      // Amadeus sandbox booking URL — in production this would be the actual partner booking link
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
        }
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
2. Suggest a realistic route with 1-3 intermediate stops based on driving distances (aim for 4-6 hour max drive segments for families)
3. For each stop, use search_attractions to find top things to do
4. Proactively suggest hotels using search_hotels — find the best deals
5. When a user wants to book, use check_hotel_availability then build_booking_summary

Always be specific about driving times and distances. Families with kids need bathroom breaks and rest stops — account for that.

When you suggest a booking, always explain the cancellation policy clearly.`
