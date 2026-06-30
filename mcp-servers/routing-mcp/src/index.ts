import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { resolveCityCoords, addDays } from './route-utils'
import { getRoute, metersToMiles, secondsToTime, type OsrmRouteResult } from './osrm-client'

function createServer(): McpServer {
  const server = new McpServer({ name: 'routing-mcp', version: '1.0.0' })

  // [long_running] — makes multiple Nominatim + OSRM calls; can take 5-10s
  server.tool(
    'suggest_route_stops',
    '[long_running] Build a structured road trip itinerary with real driving distances and times. ' +
    'Call this after deciding on all stops. Pass the complete ordered list of cities.',
    {
      cities: z.array(z.string()).min(2).describe('Ordered list of cities from origin to destination'),
      startDate: z.string().describe('Trip start date, YYYY-MM-DD'),
      totalDays: z.number().describe('Total number of days for the trip'),
    },
    async ({ cities, startDate, totalDays }) => {
      type Waypoint = { city: string; lat: number; lng: number; state: string }
      const waypoints: Waypoint[] = []
      const unknown: string[] = []

      for (const city of cities) {
        const coords = await resolveCityCoords(city)
        if (!coords) unknown.push(city)
        else waypoints.push({ city: city.replace(/,?\s+[A-Z]{2}$/, '').trim(), ...coords })
      }

      if (unknown.length > 0) {
        const payload = {
          error: `Could not find coordinates for: ${unknown.join(', ')}. Please use well-known US city names.`,
          stops: [],
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }

      let orsResult: OsrmRouteResult | null = null
      try {
        orsResult = await getRoute(waypoints.map(w => ({ lat: w.lat, lng: w.lng })))
      } catch (err) {
        console.error('OSRM route fetch failed:', err)
      }

      const nightsPerStop = Math.max(1, Math.floor(totalDays / (cities.length - 1)))

      const stops = waypoints.map((wp, i) => {
        const isOrigin = i === 0
        const nightsBefore = isOrigin ? 0 : (i - 1) * nightsPerStop
        const stayNights = isOrigin ? 0 : (i === cities.length - 1 ? totalDays - nightsBefore : nightsPerStop)
        const checkIn = addDays(startDate, nightsBefore)
        const checkOut = addDays(startDate, nightsBefore + stayNights)
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

      const payload = {
        stops,
        routeGeometry: orsResult?.geometry ?? null,
        totalDistance: orsResult ? metersToMiles(orsResult.totalDistance) : null,
        totalDuration: orsResult ? secondsToTime(orsResult.totalDuration) : null,
        message: `Route planned: ${cities.join(' → ')}`,
        canonicalCities: stops.map(s => s.city),
        surroundingsByCity: {},
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
    }
  )

  return server
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'routing-mcp' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const server = createServer()
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
