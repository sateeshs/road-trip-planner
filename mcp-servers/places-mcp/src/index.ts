import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { resolveCityCoords } from './route-utils'
import { overpassQuery } from './overpass-client'
import { osmAttractions, osmSurroundingsQuery, type Attraction } from './osm-helpers'

function createServer(): McpServer {
  const server = new McpServer({ name: 'places-mcp', version: '1.0.0' })

  server.tool(
    'search_attractions',
    '[long_running] Search for popular attractions, landmarks, museums, and parks at a given city stop.',
    {
      city: z.string().describe('City name, e.g. "Indianapolis"'),
      state: z.string().describe('State abbreviation, e.g. "IN"'),
      categories: z.array(z.enum(['landmarks', 'museums', 'parks', 'restaurants', 'entertainment'])).optional(),
      limit: z.number().min(1).max(10).default(5),
    },
    async ({ city, limit }) => {
      const attractions = await osmAttractions(city, limit)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ attractions, city }) }] }
    }
  )

  server.tool(
    'search_restaurants',
    'Search for restaurants and dining options near a stop city. ' +
    'Call once per stop AFTER search_hotels completes. ' +
    'Uses OpenStreetMap data — returns top dining spots within 5 km.',
    {
      city: z.string().describe('City name — use the exact canonical name from suggest_route_stops'),
    },
    async ({ city }) => {
      const coords = await resolveCityCoords(city)
      if (!coords) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ restaurants: [], city }) }] }
      }
      const { lat, lng } = coords
      const ql = `[out:json][timeout:12];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub|bistro"](around:5000,${lat},${lng});
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
            address: [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(' ') || city,
            coordinates: { lat: elLat, lng: elLng },
            description: el.tags?.cuisine ? `Cuisine: ${el.tags.cuisine}` : undefined,
            website: el.tags?.website,
          }
        })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ restaurants, city }) }] }
    }
  )

  server.tool(
    'explore_surroundings',
    '[long_running] Search for outdoor activities and surroundings near a road trip stop. ' +
    'Use cruise/boat_tour for cities with harbors or lakes. Use zip_line/scenic_ride for mountain towns.',
    {
      city: z.string().describe('City name of the road trip stop'),
      state: z.string().describe('State abbreviation, e.g. "TN"'),
      activities: z.array(z.enum([
        'camping', 'kayaking', 'hiking', 'cycling', 'atv_rides',
        'horseback', 'rock_climbing', 'fishing', 'swimming',
        'rafting', 'boating', 'cruise', 'boat_tour', 'zip_line',
        'scenic_ride', 'scenic_views', 'skiing', 'waterfalls',
      ])).min(1).describe('Activity types to search for'),
      limit: z.number().min(1).max(12).default(8),
    },
    async ({ city, limit }) => {
      const coords = await resolveCityCoords(city)
      if (!coords) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ surroundings: [], city, activities: [] }) }] }
      }
      const surroundings = await osmSurroundingsQuery(coords.lat, coords.lng, city, limit)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ surroundings, city }) }] }
    }
  )

  return server
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'places-mcp' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const server = createServer()
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
