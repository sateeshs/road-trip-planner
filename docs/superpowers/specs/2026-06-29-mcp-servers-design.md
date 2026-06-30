# MCP Servers for Road Trip Planner — Design Spec

**Date:** 2026-06-29
**Branch:** feature/mcp-servers (to be cut from master)

---

## Goal

Extract the app's AI tool implementations into three standalone MCP servers hosted on Cloudflare Workers. The Next.js app becomes an MCP client. Tools use free APIs only (OSRM, Nominatim, Overpass/OSM). Each server is independently deployable and reusable by other agents.

---

## Architecture

### High-Level

```
Browser (React)
  └── TripContext (useChat SSE stream)
        └── app/api/chat/route.ts  [Vercel Edge]
              ├── MCP client → routing-mcp  [CF Worker]
              ├── MCP client → places-mcp   [CF Worker]
              └── MCP client → hotels-mcp   [CF Worker]
```

The Next.js Edge route creates three MCP clients at request time, fetches their tool lists in parallel, merges them into `streamText()`, and streams the result back to the browser. No other file in the app changes.

### Transport

MCP **Streamable HTTP** (POST `/mcp`). Each Cloudflare Worker accepts a single POST endpoint and responds with JSON. No SSE, no WebSockets, no persistent connections — stateless per-request, compatible with Cloudflare Workers' execution model.

---

## Full Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER (React Client — Vercel)                                    │
│                                                                     │
│  TripContext.tsx                                                    │
│  ├── useChat({ url: '/api/chat', body: { tripStyles } })           │
│  │     Returns: messages[] with tool-invocation parts              │
│  │                                                                 │
│  ├── useEffect watches messages[] for tool results                 │
│  │   part.type === 'tool-invocation' && state === 'result'         │
│  │   ├── suggest_route_stops  → setStops([...])                   │
│  │   ├── search_hotels        → setHotelsByCity({ city: [] })     │
│  │   ├── search_attractions   → setAttractionsByCity({ city: [] })│
│  │   ├── search_restaurants   → setAttractionsByCity (dining)     │
│  │   └── explore_surroundings → setSurroundings([...])            │
│  │                                                                 │
│  ├── estimatedTripCost  (useMemo from hotelsByCity)               │
│  └── confirmedReservations[]                                       │
│                                                                     │
│  Components consuming TripContext:                                 │
│  ├── ChatPanel.tsx                                                 │
│  │   ├── Renders messages[].parts text bubbles                    │
│  │   └── ChatToolResultRenderer (per tool-invocation part)        │
│  │       ├── suggest_route_stops  → RouteSummaryCard              │
│  │       ├── search_hotels        → HotelResultsCard              │
│  │       ├── search_attractions   → AttractionGridCard            │
│  │       ├── search_restaurants   → RestaurantCard                │
│  │       ├── explore_surroundings → SurroundingsCard              │
│  │       └── render_ui            → DynamicUICard                 │
│  ├── LeafletMap.tsx      → stop markers, route polyline, clusters │
│  ├── StopBottomSheet.tsx → hotels / attractions per selected stop │
│  ├── FloatingRouteSummary→ ~$NNN badge, 📅 Export button         │
│  └── TripStylePicker.tsx → chip selection → tripStyles[]          │
└─────────────────────────────────────────────────────────────────────┘
          ▲
          │  SSE (AI SDK useChat data stream)
          │
┌─────────────────────────────────────────────────────────────────────┐
│  app/api/chat/route.ts  [Vercel Edge, 30s limit]                   │
│                                                                     │
│  1. Parse body: { messages, tripStyles }                           │
│  2. Trim history to MAX_HISTORY_MESSAGES (30)                      │
│  3. Create 3 MCP clients in parallel:                              │
│     ├── experimental_createMCPClient(ROUTING_MCP_URL)             │
│     ├── experimental_createMCPClient(PLACES_MCP_URL)              │
│     └── experimental_createMCPClient(HOTELS_MCP_URL)              │
│  4. Fetch tool schemas from all 3 servers (Promise.all)           │
│  5. streamText({                                                   │
│       model: openrouter(MODEL),                                    │
│       system: SYSTEM_PROMPT + styleNote + today,                  │
│       messages: trimmed,                                           │
│       tools: {                                                     │
│         ...routingTools,   // from routing-mcp                    │
│         ...placesTools,    // from places-mcp                     │
│         ...hotelTools,     // from hotels-mcp                     │
│         render_ui,         // stays inline (UI dispatch)          │
│       },                                                           │
│       maxSteps: 15,                                                │
│     })                                                             │
│  6. toDataStreamResponse() → SSE back to browser                  │
└─────────────────────────────────────────────────────────────────────┘
          │
          │  MCP Streamable HTTP  POST /mcp
          │  (parallel per tool call — AI SDK handles routing)
          ├──────────────────┬───────────────────┐
          ▼                  ▼                   ▼
┌─────────────────┐ ┌────────────────┐ ┌─────────────────┐
│  routing-mcp    │ │  places-mcp    │ │  hotels-mcp     │
│  CF Worker      │ │  CF Worker     │ │  CF Worker      │
│                 │ │                │ │                 │
│  Tools:         │ │  Tools:        │ │  Tools:         │
│  suggest_route_ │ │  search_       │ │  search_hotels  │
│  stops          │ │  attractions   │ │                 │
│                 │ │                │ │  check_hotel_   │
│  External APIs: │ │  search_       │ │  availability   │
│  OSRM           │ │  restaurants   │ │                 │
│  (routing.osm   │ │                │ │  build_booking_ │
│   .de + fallback│ │  explore_      │ │  summary        │
│   osrm demo)    │ │  surroundings  │ │                 │
│                 │ │                │ │  External APIs: │
│  Nominatim      │ │  External APIs:│ │  Overpass OSM   │
│  (geocoding,    │ │  Overpass OSM  │ │  (mirror race,  │
│   2-pass retry) │ │  (4-mirror     │ │   4 mirrors)    │
│                 │ │   race,        │ │                 │
│                 │ │   Promise.any) │ │                 │
└─────────────────┘ └────────────────┘ └─────────────────┘
```

---

## MCP Servers

### routing-mcp

**Cloudflare Worker name:** `road-trip-routing-mcp`
**Endpoint:** `https://road-trip-routing-mcp.<subdomain>.workers.dev/mcp`

**Tool: `suggest_route_stops`**

Parameters: `{ origin: string, destination: string, stops?: string[] }`

Execution:
1. `resolveCityCoords()` for all cities — hardcoded table → in-memory cache → Nominatim 2-pass
2. OSRM route request (primary: routing.openstreetmap.de, fallback: router.project-osrm.org) with `steps=true`
3. Extract per-leg drive time, distance, dominant highway names, toll flags from OSRM step refs
4. Return `SuggestRouteStopsResult`: stops array + route geometry + leg summaries

**Free APIs:**
- OSRM (routing.openstreetmap.de) — no key, no limit for reasonable use
- Nominatim (nominatim.openstreetmap.org) — no key, 1 req/s rate limit; worker enforces 1.1s throttle

---

### places-mcp

**Cloudflare Worker name:** `road-trip-places-mcp`
**Endpoint:** `https://road-trip-places-mcp.<subdomain>.workers.dev/mcp`

**Tool: `search_attractions`**

Parameters: `{ city: string }`

Execution:
1. Resolve city coords
2. Overpass QL — node queries for tourism, historic, amenity, leisure, natural within 10km
3. Return top 10 named POIs as `SearchAttractionsResult`

**Tool: `search_restaurants`**

Parameters: `{ city: string }`

Execution:
1. Resolve city coords
2. Overpass QL — `amenity~"restaurant|cafe|fast_food|bar|pub|bistro|food_court"` within 5km
3. Return top 8 named results as `SearchRestaurantsResult`

**Tool: `explore_surroundings`**

Parameters: `{ city: string }`

Execution:
1. Resolve city coords
2. Overpass QL — leisure, sport, tourism, natural, attraction within 30km, timeout 15s
3. Infer activity category from name keywords (kayak, cruise, zip line, etc.)
4. Return `SearchSurroundingsResult` with category-grouped activities

**Free APIs:**
- Overpass API — 4-mirror race (`Promise.any()`), 12s AbortController per mirror, 5-min TTL POI cache

---

### hotels-mcp

**Cloudflare Worker name:** `road-trip-hotels-mcp`
**Endpoint:** `https://road-trip-hotels-mcp.<subdomain>.workers.dev/mcp`

**Tool: `search_hotels`**

Parameters: `{ city: string }`

Execution:
1. Resolve city coords
2. Overpass QL — `nwr["tourism"~"hotel|motel|hostel|guest_house"]` within 10km
3. Star-based price estimation (`STAR_PRICE = [0, 65, 85, 115, 170, 240]`)
4. Return top 5 hotels as `SearchHotelsResult`

**Tool: `check_hotel_availability`**

Parameters: `{ hotelId: string, checkIn: string, checkOut: string }`

Returns mock availability data (OSM has no real-time availability). Returns structured `HotelOffer` with estimated pricing for the dates requested.

**Tool: `build_booking_summary`**

Parameters: `{ hotel: Hotel, checkIn: string, checkOut: string, guests: number }`

Pure computation — no external API call. Calculates total price, builds `ConfirmedReservation` shape for the browser to store.

**Free APIs:**
- Overpass API — same 4-mirror race pattern as places-mcp

---

## File Structure

```
road-trip-planner/            ← existing Next.js app
  app/api/chat/route.ts       ← MODIFIED: MCP clients replace inline tools
  lib/claude-tools.ts         ← MODIFIED: only render_ui tool + SYSTEM_PROMPT remain
  .env.local                  ← MODIFIED: add ROUTING_MCP_URL, PLACES_MCP_URL, HOTELS_MCP_URL

mcp-servers/                  ← NEW: sibling directory (or separate repo)
  routing-mcp/
    src/
      index.ts                ← McpServer + suggest_route_stops tool
      route-utils.ts          ← resolveCityCoords (ported from lib/route-utils.ts)
      osrm-client.ts          ← OSRM client (ported from lib/osrm-client.ts)
    wrangler.toml
    package.json
    tsconfig.json
  places-mcp/
    src/
      index.ts                ← McpServer + 3 place tools
      overpass-client.ts      ← Overpass mirror race (ported from lib/overpass-client.ts)
      route-utils.ts          ← resolveCityCoords
    wrangler.toml
    package.json
    tsconfig.json
  hotels-mcp/
    src/
      index.ts                ← McpServer + 3 hotel tools
      overpass-client.ts      ← Overpass mirror race
      route-utils.ts          ← resolveCityCoords
    wrangler.toml
    package.json
    tsconfig.json
```

---

## Next.js App Changes

### `app/api/chat/route.ts`

```typescript
import { streamText, experimental_createMCPClient } from 'ai'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { renderUiTool, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const runtime = 'edge'
export const maxDuration = 30

export async function POST(req: Request) {
  const body = await req.json() as { messages: unknown[]; tripStyles?: string[] }
  const { messages, tripStyles } = body

  // Create MCP clients in parallel
  const [routingClient, placesClient, hotelsClient] = await Promise.all([
    experimental_createMCPClient({
      transport: new StreamableHTTPClientTransport(
        new URL(process.env.ROUTING_MCP_URL!)
      ),
    }),
    experimental_createMCPClient({
      transport: new StreamableHTTPClientTransport(
        new URL(process.env.PLACES_MCP_URL!)
      ),
    }),
    experimental_createMCPClient({
      transport: new StreamableHTTPClientTransport(
        new URL(process.env.HOTELS_MCP_URL!)
      ),
    }),
  ])

  // Fetch tool schemas in parallel
  const [routingTools, placesTools, hotelTools] = await Promise.all([
    routingClient.tools(),
    placesClient.tools(),
    hotelsClient.tools(),
  ])

  const result = streamText({
    model: openrouter(MODEL),
    system: SYSTEM_PROMPT + styleNote + dateNote,
    messages: trimmed,
    tools: {
      ...routingTools,
      ...placesTools,
      ...hotelTools,
      render_ui: renderUiTool,  // stays inline — UI dispatch only
    },
    maxSteps: 15,
  })

  return result.toDataStreamResponse()
}
```

### `lib/claude-tools.ts`

After migration, retains only:
- `SYSTEM_PROMPT` constant
- `renderUiTool` (the `render_ui` tool definition)
- All tool result TypeScript types (moved to `types/index.ts` if not already there)

All Overpass/OSRM/geocoding logic moves to the MCP server packages.

### Environment Variables Added

```bash
# .env.local
ROUTING_MCP_URL=https://road-trip-routing-mcp.<subdomain>.workers.dev/mcp
PLACES_MCP_URL=https://road-trip-places-mcp.<subdomain>.workers.dev/mcp
HOTELS_MCP_URL=https://road-trip-hotels-mcp.<subdomain>.workers.dev/mcp
```

```bash
# Vercel dashboard (Production)
ROUTING_MCP_URL=...
PLACES_MCP_URL=...
HOTELS_MCP_URL=...
```

---

## Cloudflare Worker Implementation Pattern

Each Worker follows this pattern using `@modelcontextprotocol/sdk`:

```typescript
// src/index.ts (e.g. places-mcp)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const server = new McpServer({ name: 'places-mcp', version: '1.0.0' })

server.tool(
  'search_attractions',
  'Search for landmarks, museums, and parks near a city',
  { city: z.string().describe('City name to search near') },
  async ({ city }) => {
    const coords = await resolveCityCoords(city)
    if (!coords) return { content: [{ type: 'text', text: JSON.stringify({ attractions: [], city }) }] }
    const elements = await overpassQuery(attractionsQL(coords))
    const attractions = mapElements(elements)
    return { content: [{ type: 'text', text: JSON.stringify({ attractions, city }) }] }
  }
)

// Cloudflare Workers fetch handler
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
```

### `wrangler.toml` (per server)

```toml
name = "road-trip-places-mcp"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
# No secrets needed — Overpass is public
```

### Deploy

```bash
cd mcp-servers/places-mcp
npx wrangler deploy
# → https://road-trip-places-mcp.<subdomain>.workers.dev
```

---

## Deployment Strategy

| Phase | Action |
|-------|--------|
| 1 | Deploy all 3 Workers (`wrangler deploy`) |
| 2 | Set env vars in `.env.local` and Vercel dashboard |
| 3 | Update `app/api/chat/route.ts` to use MCP clients |
| 4 | Smoke test locally (`npm run dev`) — plan a trip, verify all cards appear |
| 5 | Deploy Next.js to Vercel (`vercel --prod`) |
| 6 | Remove now-unused tool implementations from `lib/claude-tools.ts` |

---

## Cloudflare Free Tier Limits

| Resource | Free Limit | Expected Usage |
|----------|-----------|----------------|
| Requests | 100K/day | ~10–50/day for hobby app |
| CPU time | 10ms/invocation | Sufficient — Workers fan out to fetch, don't compute |
| Memory | 128MB | Well within — no state stored |
| Subrequests | 50/request | Each tool makes 1–3 Overpass/OSRM calls |

---

## Error Handling

- **MCP client connection failure**: Wrap `experimental_createMCPClient` in try/catch; fall back to inline tool definitions (kept as backup in `lib/claude-tools.ts` behind a `USE_MCP` env flag)
- **Tool execution failure inside Worker**: Return `{ content: [{ type: 'text', text: JSON.stringify({ error, city }) }] }` — AI SDK propagates as tool result, AI generates graceful text response
- **Overpass mirror all down**: `Promise.any()` rejects → Worker returns error result → AI skips that section

---

## What Does NOT Change

- `TripContext.tsx` — state management, tool result extraction (`useEffect` watching `messages[]`), all unchanged
- `ChatToolResultRenderer.tsx` — tool name → card mapping unchanged; tool names are identical
- All chat-ui card components (`RouteSummaryCard`, `HotelResultsCard`, etc.) — unchanged
- `LeafletMap.tsx`, `StopBottomSheet.tsx`, `FloatingRouteSummary.tsx` — unchanged
- `types/index.ts` — tool result types unchanged
- `SYSTEM_PROMPT` — unchanged (stays in `lib/claude-tools.ts`)
- The AI model, OpenRouter gateway, streaming pipeline — all unchanged
