import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { osmHotels, buildBookingSummaryPayload, type Hotel } from './osm-hotel-helpers'
import { npsByBbox, CAMPGROUND_FCATS } from './nps-client'
import { resolveCityCoords } from './route-utils'

interface Env {
  NPS_DB: D1Database
}

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: 'hotels-mcp', version: '1.0.0' })

  server.tool(
    'search_hotels',
    '[long_running] Search for hotels at a road trip stop with pricing. Uses OpenStreetMap data.',
    {
      city: z.string().describe('City name, e.g. "Louisville"'),
      checkIn: z.string().describe('Check-in date, ISO format YYYY-MM-DD'),
      checkOut: z.string().describe('Check-out date, ISO format YYYY-MM-DD'),
      adults: z.number().min(1).max(8).default(2),
    },
    async ({ city, checkIn, checkOut }) => {
      const hotels = await osmHotels(city)

      // If OSM returned fewer than 2 hotels, supplement with NPS campgrounds from D1
      let allHotels: Hotel[] = hotels
      if (hotels.length < 2 && env.NPS_DB) {
        const coords = await resolveCityCoords(city)
        if (coords) {
          const campgrounds = await npsByBbox(env.NPS_DB, coords.lat, coords.lng, 50, CAMPGROUND_FCATS, 5)
          const campgroundHotels: Hotel[] = campgrounds.map(p => ({
            hotelId: `nps-${p.id}`,
            name: p.name,
            address: `${p.park_code.toUpperCase()} National Park`,
            coordinates: { lat: p.lat, lng: p.lng },
            pricePerNight: p.fcat === 'Lodge' ? 150 : 35,
            currency: 'USD',
            dealTag: 'NPS Property',
            amenities: p.fcat === 'Lodge' ? ['Restaurant', 'WiFi'] : ['Fire Ring', 'Restrooms'],
            availableOffers: [{
              offerId: `nps-offer-${p.id}`,
              roomType: p.fcat === 'Lodge' ? 'Lodge Room' : 'Campsite',
              bedType: p.fcat === 'Lodge' ? 'Queen' : 'N/A',
              price: p.fcat === 'Lodge' ? 150 : 35,
              currency: 'USD',
              cancellationPolicy: 'Non-refundable',
              breakfastIncluded: false,
            }],
          }))
          allHotels = [...hotels, ...campgroundHotels]
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ hotels: allHotels, city, checkIn, checkOut }) }] }
    }
  )

  server.tool(
    'check_hotel_availability',
    '[long_running] Check detailed availability and room options for a specific hotel.',
    {
      hotelId: z.string(),
      hotelName: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      adults: z.number().default(2),
    },
    async ({ hotelId, hotelName, checkIn, checkOut }) => {
      const payload = {
        available: true, hotelId, hotelName, checkIn, checkOut,
        offers: [{
          id: `offer-${hotelId}-std`,
          roomType: 'Standard Room',
          bedType: 'King',
          price: 120,
          currency: 'USD',
          cancellationPolicy: 'Non-refundable',
          breakfastIncluded: false,
        }],
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
    }
  )

  server.tool(
    'build_booking_summary',
    '[requires_confirmation] Build a booking summary for user review before redirecting to the hotel payment page.',
    {
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
    },
    async (params) => {
      const payload = buildBookingSummaryPayload(params)
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
    }
  )

  return server
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'hotels-mcp', d1: !!env.NPS_DB }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const server = createServer(env)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
