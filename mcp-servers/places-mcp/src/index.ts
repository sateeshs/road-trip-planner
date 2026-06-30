import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { resolveCityCoords } from './route-utils'
import { overpassQuery } from './overpass-client'
import { osmAttractions, osmSurroundingsQuery, type Attraction } from './osm-helpers'
import {
  npsByBbox, npsByParkCode, fcatToCategory,
  SURROUNDINGS_FCATS, ALL_VISITOR_FCATS,
} from './nps-client'

interface Env {
  NPS_DB: D1Database
}

function createServer(env: Env): McpServer {
  const server = new McpServer({ name: 'places-mcp', version: '1.0.0' })

  // ── search_attractions ─────────────────────────────────────────────────────
  server.tool(
    'search_attractions',
    '[long_running] Search for popular attractions, landmarks, museums, and parks at a given city stop.',
    {
      city:       z.string().describe('City name, e.g. "Indianapolis"'),
      state:      z.string().describe('State abbreviation, e.g. "IN"'),
      categories: z.array(z.enum(['landmarks', 'museums', 'parks', 'restaurants', 'entertainment'])).optional(),
      limit:      z.number().min(1).max(10).default(5),
    },
    async ({ city, limit }) => {
      const attractions = await osmAttractions(city, limit)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ attractions, city }) }] }
    }
  )

  // ── search_restaurants ─────────────────────────────────────────────────────
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
          return {
            id: String(el.id),
            name: el.tags!.name!,
            category: el.tags?.amenity ?? 'restaurant',
            address: [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']]
              .filter(Boolean).join(' ') || city,
            coordinates: { lat: elLat, lng: elLng },
            description: el.tags?.cuisine ? `Cuisine: ${el.tags.cuisine}` : undefined,
            website: el.tags?.website,
          }
        })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ restaurants, city }) }] }
    }
  )

  // ── explore_surroundings ───────────────────────────────────────────────────
  // Merges OSM results + NPS D1 results for richer outdoor activity data
  server.tool(
    'explore_surroundings',
    '[long_running] Search for outdoor activities and surroundings near a road trip stop. ' +
    'Combines OpenStreetMap and NPS National Park data. ' +
    'Use cruise/boat_tour for cities with harbors or lakes. Use zip_line/scenic_ride for mountain towns.',
    {
      city:       z.string().describe('City name of the road trip stop'),
      state:      z.string().describe('State abbreviation, e.g. "TN"'),
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
      const { lat, lng } = coords

      // Run OSM + NPS D1 queries in parallel
      const [osmResults, npsResults] = await Promise.all([
        osmSurroundingsQuery(lat, lng, city, limit),
        npsByBbox(env.NPS_DB, lat, lng, 50, SURROUNDINGS_FCATS, limit),
      ])

      // Convert NPS results to Attraction shape
      const npsAttractions: Attraction[] = npsResults.map(p => ({
        id:          `nps-${p.id}`,
        name:        p.name,
        category:    fcatToCategory(p.fcat),
        address:     `${p.park_code.toUpperCase()} National Park`,
        coordinates: { lat: p.lat, lng: p.lng },
        description: `NPS: ${p.fcat}`,
      }))

      // Merge — NPS results first (more authoritative), then OSM
      const seen = new Set<string>()
      const surroundings: Attraction[] = []
      for (const a of [...npsAttractions, ...osmResults]) {
        const key = a.name.toLowerCase().trim()
        if (!seen.has(key)) {
          seen.add(key)
          surroundings.push(a)
        }
        if (surroundings.length >= limit * 2) break
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ surroundings, city }) }] }
    }
  )

  // ── explore_nps_park ───────────────────────────────────────────────────────
  // New tool: query NPS D1 directly by park code for rich park POI data
  server.tool(
    'explore_nps_park',
    'Get detailed points of interest for a specific National Park from the NPS database. ' +
    'Returns campgrounds, trailheads, overlooks, boat launches, visitor centers, and more. ' +
    'Use when a route stop is at or near a national park.',
    {
      parkCode: z.string().describe(
        'NPS park unit code (lowercase), e.g. "piro" for Pictured Rocks, ' +
        '"yell" for Yellowstone, "grca" for Grand Canyon, "grsm" for Great Smoky Mountains. ' +
        'Common codes: piro, yell, grca, grsm, zion, arch, romo, olym, glac, yose, acad, shen, ' +
        'badl, cuva, indu, isle, slbe, voya, apis, blri, cany, sagu, deva, brca'
      ),
    },
    async ({ parkCode }) => {
      const allFcats = [...SURROUNDINGS_FCATS, ...ALL_VISITOR_FCATS] as readonly string[]
      const places = await npsByParkCode(env.NPS_DB, parkCode, allFcats, 30)

      if (places.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            parkCode,
            places: [],
            message: `No POIs found for park code "${parkCode}". Verify the code is correct.`,
          })}],
        }
      }

      // Group by fcat for structured response
      const grouped: Record<string, typeof places> = {}
      for (const p of places) {
        grouped[p.fcat] = grouped[p.fcat] ?? []
        grouped[p.fcat].push(p)
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          parkCode,
          totalPlaces: places.length,
          grouped,
          places,
        })}],
      }
    }
  )

  return server
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'places-mcp', d1: !!env.NPS_DB }), {
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
