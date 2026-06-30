# MCP Servers for Road Trip Planner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the app's AI tools into three standalone MCP servers on Cloudflare Workers and wire the Next.js app to call them via the Vercel AI SDK MCP client.

**Architecture:** Three Cloudflare Workers (`routing-mcp`, `places-mcp`, `hotels-mcp`) each expose a `POST /mcp` endpoint using MCP Streamable HTTP transport. The Next.js `app/api/chat/route.ts` creates three MCP clients per request using `experimental_createMCPClient`, fetches tool schemas, and merges them into `streamText()`. Tool names and parameter shapes are identical to the current inline tools so `TripContext`, the card components, and `SYSTEM_PROMPT` require no changes.

**Tech Stack:** `@modelcontextprotocol/sdk ^1.12.0`, `zod ^3.23`, `wrangler ^3.78`, `vitest ^2.0`, `ai ^4.3.16` (already installed in Next.js app), Node v22.13.1

## Global Constraints

- All MCP Workers live in `mcp-servers/` at the repo root, each in its own subdirectory with its own `package.json`
- Cloudflare Workers runtime: `compatibility_date = "2025-01-01"`, `compatibility_flags = ["nodejs_compat"]`
- Tool names MUST match exactly: `suggest_route_stops`, `search_attractions`, `search_restaurants`, `explore_surroundings`, `search_hotels`, `check_hotel_availability`, `build_booking_summary`
- Tool parameter schemas MUST be identical to the current inline tools in `lib/claude-tools.ts` (LLM already knows them from SYSTEM_PROMPT)
- MCP tool results use envelope: `{ content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }`
- GeoAgent patterns: annotate `[long_running]` in description for OSRM/Overpass tools; annotate `[requires_confirmation]` for `build_booking_summary`
- No `console.log` in production Worker code — use `console.error` only for caught exceptions
- Every Worker has a `GET /health` endpoint returning `{ status: 'ok', server: '<name>' }`
- Node v22.13.1 required: prefix all commands with `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"`
- Tests use `vitest` for pure-function unit tests; `wrangler dev` + `curl` for integration tests
- Build check for Next.js: `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run build`

---

## File Map

### New (mcp-servers/)

```
mcp-servers/
  routing-mcp/
    src/
      index.ts           — McpServer + suggest_route_stops tool entry point
      route-utils.ts     — resolveCityCoords, addDays (ported from lib/route-utils.ts)
      osrm-client.ts     — getRoute, metersToMiles, secondsToTime (ported from lib/osrm-client.ts)
    wrangler.toml
    package.json
    tsconfig.json
    vitest.config.ts
    __tests__/
      route-utils.test.ts
      osrm-client.test.ts

  places-mcp/
    src/
      index.ts           — McpServer + search_attractions, search_restaurants, explore_surroundings
      route-utils.ts     — resolveCityCoords (ported)
      overpass-client.ts — overpassQuery, OsmElement (ported from lib/overpass-client.ts)
      osm-helpers.ts     — osmCategory, osmAddress, osmAttractions, osmSurroundingsQuery,
                           parseSurroundingsElements, category constants (ported from lib/claude-tools.ts)
    wrangler.toml
    package.json
    tsconfig.json
    vitest.config.ts
    __tests__/
      osm-helpers.test.ts

  hotels-mcp/
    src/
      index.ts           — McpServer + search_hotels, check_hotel_availability, build_booking_summary
      route-utils.ts     — resolveCityCoords (ported)
      overpass-client.ts — overpassQuery, OsmElement (ported)
      osm-hotel-helpers.ts — osmHotels, STAR_PRICE, HOTEL_PRICE_TIER, osmAddress (ported)
    wrangler.toml
    package.json
    tsconfig.json
    vitest.config.ts
    __tests__/
      osm-hotel-helpers.test.ts
```

### Modified (Next.js app)

```
app/api/chat/route.ts         — replace agentTools import with 3 MCP clients
lib/claude-tools.ts           — remove tool execute implementations; keep SYSTEM_PROMPT + render_ui
contexts/trip-tool-results.ts — add JSON.parse safety for MCP string results
.env.local                    — add ROUTING_MCP_URL, PLACES_MCP_URL, HOTELS_MCP_URL
```

---

## Task 1: Scaffold mcp-servers workspace

**Files:**
- Create: `mcp-servers/routing-mcp/package.json`
- Create: `mcp-servers/routing-mcp/wrangler.toml`
- Create: `mcp-servers/routing-mcp/tsconfig.json`
- Create: `mcp-servers/routing-mcp/vitest.config.ts`
- Create: `mcp-servers/places-mcp/package.json`
- Create: `mcp-servers/places-mcp/wrangler.toml`
- Create: `mcp-servers/places-mcp/tsconfig.json`
- Create: `mcp-servers/places-mcp/vitest.config.ts`
- Create: `mcp-servers/hotels-mcp/package.json`
- Create: `mcp-servers/hotels-mcp/wrangler.toml`
- Create: `mcp-servers/hotels-mcp/tsconfig.json`
- Create: `mcp-servers/hotels-mcp/vitest.config.ts`

**Interfaces:**
- Produces: Three installable Worker packages ready for `src/index.ts` in Tasks 2–4

- [ ] **Step 1: Create directory structure**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
mkdir -p mcp-servers/routing-mcp/{src,__tests__}
mkdir -p mcp-servers/places-mcp/{src,__tests__}
mkdir -p mcp-servers/hotels-mcp/{src,__tests__}
```

- [ ] **Step 2: Write routing-mcp/package.json**

```json
{
  "name": "routing-mcp",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250430.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 3: Write places-mcp/package.json and hotels-mcp/package.json**

Both are identical to routing-mcp/package.json except `"name"`: use `"places-mcp"` and `"hotels-mcp"` respectively.

- [ ] **Step 4: Write wrangler.toml for all three Workers**

`mcp-servers/routing-mcp/wrangler.toml`:
```toml
name = "road-trip-routing-mcp"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
```

`mcp-servers/places-mcp/wrangler.toml`:
```toml
name = "road-trip-places-mcp"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
```

`mcp-servers/hotels-mcp/wrangler.toml`:
```toml
name = "road-trip-hotels-mcp"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 5: Write tsconfig.json for all three Workers**

All three are identical — write each at `mcp-servers/<name>/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts", "__tests__/**/*.ts"]
}
```

- [ ] **Step 6: Write vitest.config.ts for all three Workers**

All three are identical:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
})
```

- [ ] **Step 7: Install dependencies in all three**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npm install && cd ../..
cd mcp-servers/places-mcp && npm install && cd ../..
cd mcp-servers/hotels-mcp && npm install && cd ../..
```

Expected: three `node_modules/` directories created, no errors.

- [ ] **Step 8: Write a minimal src/index.ts placeholder in each to verify wrangler can parse it**

Write `mcp-servers/routing-mcp/src/index.ts`:
```typescript
export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response('routing-mcp placeholder')
  },
}
```

Write identical placeholders (changing the string) for `places-mcp/src/index.ts` and `hotels-mcp/src/index.ts`.

- [ ] **Step 9: Verify wrangler type-checks each Worker**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npx wrangler types 2>&1 | tail -5 && cd ../..
cd mcp-servers/places-mcp && npx wrangler types 2>&1 | tail -5 && cd ../..
cd mcp-servers/hotels-mcp && npx wrangler types 2>&1 | tail -5 && cd ../..
```

Expected: no fatal errors (wrangler generates `worker-configuration.d.ts`).

- [ ] **Step 10: Commit**

```bash
git add mcp-servers/
git commit -m "chore: scaffold mcp-servers workspace (routing, places, hotels)"
```

---

## Task 2: routing-mcp Worker

**Files:**
- Create: `mcp-servers/routing-mcp/src/route-utils.ts`
- Create: `mcp-servers/routing-mcp/src/osrm-client.ts`
- Create: `mcp-servers/routing-mcp/src/__tests__/route-utils.test.ts`
- Create: `mcp-servers/routing-mcp/src/__tests__/osrm-client.test.ts`
- Modify: `mcp-servers/routing-mcp/src/index.ts`

**Interfaces:**
- Consumes: `wrangler.toml`, `package.json`, `tsconfig.json` from Task 1
- Produces:
  - `resolveCityCoords(city: string): Promise<{ lat: number; lng: number; state: string } | null>` — exported from `route-utils.ts`
  - `addDays(date: string, days: number): string` — exported from `route-utils.ts`
  - `getRoute(waypoints: Array<{ lat: number; lng: number }>): Promise<OsrmRouteResult>` — exported from `osrm-client.ts`
  - `metersToMiles(meters: number): string` — exported from `osrm-client.ts`
  - `secondsToTime(seconds: number): string` — exported from `osrm-client.ts`
  - MCP Worker at `POST /mcp` with tool `suggest_route_stops`

- [ ] **Step 1: Write the failing tests**

`mcp-servers/routing-mcp/__tests__/route-utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveCityCoords, addDays } from '../src/route-utils'

describe('resolveCityCoords', () => {
  it('resolves a hardcoded major US city instantly', async () => {
    const result = await resolveCityCoords('Chicago')
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(41.87, 1)
    expect(result!.lng).toBeCloseTo(-87.62, 1)
    expect(result!.state).toBe('IL')
  })

  it('returns null for a completely unknown city', async () => {
    // This would normally fall through to Nominatim; in tests we only verify
    // the hardcoded path returns null for unknown cities (no network call)
    const result = await resolveCityCoords('__nonexistent_city_xyz__')
    expect(result).toBeNull()
  })

  it('resolves Nashville from hardcoded table', async () => {
    const result = await resolveCityCoords('Nashville')
    expect(result).not.toBeNull()
    expect(result!.state).toBe('TN')
  })
})

describe('addDays', () => {
  it('adds days to a date string', () => {
    expect(addDays('2026-06-01', 3)).toBe('2026-06-04')
  })

  it('handles month rollover', () => {
    expect(addDays('2026-01-29', 3)).toBe('2026-02-01')
  })
})
```

`mcp-servers/routing-mcp/__tests__/osrm-client.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { metersToMiles, secondsToTime } from '../src/osrm-client'

describe('metersToMiles', () => {
  it('converts meters to miles string', () => {
    expect(metersToMiles(1609.34)).toBe('1 miles')
    expect(metersToMiles(16093.4)).toBe('10 miles')
  })
})

describe('secondsToTime', () => {
  it('formats sub-hour durations', () => {
    expect(secondsToTime(1800)).toBe('30m')
  })

  it('formats hours and minutes', () => {
    expect(secondsToTime(9300)).toBe('2h 35m')
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npm test 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../src/route-utils'`

- [ ] **Step 3: Write route-utils.ts (ported from lib/route-utils.ts)**

Copy the full `US_MAJOR_CITIES` table, `resolveCityCoords`, and `addDays` from `lib/route-utils.ts` verbatim. The Nominatim throttle logic stays intact. Remove the Next.js-specific import of `@/` aliases — use relative imports only.

`mcp-servers/routing-mcp/src/route-utils.ts`:
```typescript
interface CityInfo { lat: number; lng: number; state: string }

const US_MAJOR_CITIES: Record<string, CityInfo> = {
  'Chicago': { lat: 41.8781, lng: -87.6298, state: 'IL' },
  'Indianapolis': { lat: 39.7684, lng: -86.1581, state: 'IN' },
  'Louisville': { lat: 38.2527, lng: -85.7585, state: 'KY' },
  'Nashville': { lat: 36.1627, lng: -86.7816, state: 'TN' },
  'Atlanta': { lat: 33.7490, lng: -84.3880, state: 'GA' },
  'Miami': { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'New York': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'New York City': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'Philadelphia': { lat: 39.9526, lng: -75.1652, state: 'PA' },
  'Washington DC': { lat: 38.9072, lng: -77.0369, state: 'DC' },
  'Washington': { lat: 38.9072, lng: -77.0369, state: 'DC' },
  'Charlotte': { lat: 35.2271, lng: -80.8431, state: 'NC' },
  'Dallas': { lat: 32.7767, lng: -96.7970, state: 'TX' },
  'Houston': { lat: 29.7604, lng: -95.3698, state: 'TX' },
  'San Antonio': { lat: 29.4241, lng: -98.4936, state: 'TX' },
  'Austin': { lat: 30.2672, lng: -97.7431, state: 'TX' },
  'New Orleans': { lat: 29.9511, lng: -90.0715, state: 'LA' },
  'Memphis': { lat: 35.1495, lng: -90.0490, state: 'TN' },
  'St. Louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
  'Saint Louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
  'Kansas City': { lat: 39.0997, lng: -94.5786, state: 'MO' },
  'Denver': { lat: 39.7392, lng: -104.9903, state: 'CO' },
  'Phoenix': { lat: 33.4484, lng: -112.0740, state: 'AZ' },
  'Las Vegas': { lat: 36.1699, lng: -115.1398, state: 'NV' },
  'Los Angeles': { lat: 34.0522, lng: -118.2437, state: 'CA' },
  'San Francisco': { lat: 37.7749, lng: -122.4194, state: 'CA' },
  'Seattle': { lat: 47.6062, lng: -122.3321, state: 'WA' },
  'Portland': { lat: 45.5231, lng: -122.6765, state: 'OR' },
  'Minneapolis': { lat: 44.9778, lng: -93.2650, state: 'MN' },
  'Detroit': { lat: 42.3314, lng: -83.0458, state: 'MI' },
  'Cleveland': { lat: 41.4993, lng: -81.6944, state: 'OH' },
  'Columbus': { lat: 39.9612, lng: -82.9988, state: 'OH' },
  'Cincinnati': { lat: 39.1031, lng: -84.5120, state: 'OH' },
  'Pittsburgh': { lat: 40.4406, lng: -79.9959, state: 'PA' },
  'Baltimore': { lat: 39.2904, lng: -76.6122, state: 'MD' },
  'Boston': { lat: 42.3601, lng: -71.0589, state: 'MA' },
  'Tampa': { lat: 27.9506, lng: -82.4572, state: 'FL' },
  'Orlando': { lat: 28.5383, lng: -81.3792, state: 'FL' },
  'Jacksonville': { lat: 30.3322, lng: -81.6557, state: 'FL' },
  'Savannah': { lat: 32.0809, lng: -81.0912, state: 'GA' },
  'Richmond': { lat: 37.5407, lng: -77.4360, state: 'VA' },
  'Raleigh': { lat: 35.7796, lng: -78.6382, state: 'NC' },
  'Albuquerque': { lat: 35.0844, lng: -106.6504, state: 'NM' },
  'Oklahoma City': { lat: 35.4676, lng: -97.5164, state: 'OK' },
  'Tulsa': { lat: 36.1540, lng: -95.9928, state: 'OK' },
  'Salt Lake City': { lat: 40.7608, lng: -111.8910, state: 'UT' },
  'Boise': { lat: 43.6150, lng: -116.2023, state: 'ID' },
  'Tucson': { lat: 32.2226, lng: -110.9747, state: 'AZ' },
  'Sacramento': { lat: 38.5816, lng: -121.4944, state: 'CA' },
  'San Diego': { lat: 32.7157, lng: -117.1611, state: 'CA' },
  'Milwaukee': { lat: 43.0389, lng: -87.9065, state: 'WI' },
  'Madison': { lat: 43.0731, lng: -89.4012, state: 'WI' },
  'Grand Rapids': { lat: 42.9634, lng: -85.6681, state: 'MI' },
  'Lansing': { lat: 42.7325, lng: -84.5555, state: 'MI' },
  'Ann Arbor': { lat: 42.2808, lng: -83.7430, state: 'MI' },
  'Flint': { lat: 43.0125, lng: -83.6875, state: 'MI' },
  'Traverse City': { lat: 44.7631, lng: -85.6206, state: 'MI' },
  'Northville': { lat: 42.4312, lng: -83.4832, state: 'MI' },
  'Northville MI': { lat: 42.4312, lng: -83.4832, state: 'MI' },
  'Marquette': { lat: 46.5436, lng: -87.3954, state: 'MI' },
  'Munising': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks': { lat: 46.5594, lng: -86.5481, state: 'MI' },
  'Soo Locks': { lat: 46.5009, lng: -84.3472, state: 'MI' },
  'Mackinac Island': { lat: 45.8492, lng: -84.6190, state: 'MI' },
  'Mackinaw City': { lat: 45.7767, lng: -84.7276, state: 'MI' },
  'St. Ignace': { lat: 45.8681, lng: -84.7274, state: 'MI' },
}

const cityCache = new Map<string, CityInfo | null>()
let lastNominatimCall = 0

async function nominatimSearch(query: string): Promise<CityInfo | null> {
  const now = Date.now()
  const wait = 1100 - (now - lastNominatimCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastNominatimCall = Date.now()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'road-trip-planner/1.0' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const results = await res.json() as Array<{
    lat: string; lon: string;
    address?: { state_code?: string; state?: string; country_code?: string }
  }>
  const r = results.find(x => x.address?.country_code === 'us') ?? results[0]
  if (!r) return null
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    state: r.address?.state_code?.toUpperCase() ?? '',
  }
}

export async function resolveCityCoords(city: string): Promise<CityInfo | null> {
  const normalized = city.trim()
  if (US_MAJOR_CITIES[normalized]) return US_MAJOR_CITIES[normalized]
  if (cityCache.has(normalized)) return cityCache.get(normalized) ?? null

  // 2-pass Nominatim: with state qualifier first, without second
  const stateMatch = normalized.match(/,\s*([A-Z]{2})$/)
  let result: CityInfo | null = null
  if (stateMatch) {
    result = await nominatimSearch(`${normalized}, United States`)
  } else {
    result = await nominatimSearch(`${normalized}, United States`)
    if (!result) result = await nominatimSearch(normalized)
  }

  cityCache.set(normalized, result)
  return result
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
```

- [ ] **Step 4: Write osrm-client.ts (ported from lib/osrm-client.ts)**

`mcp-servers/routing-mcp/src/osrm-client.ts`:
```typescript
const OSRM_PRIMARY: Record<string, string> = {
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
}
const OSRM_FALLBACK = 'https://router.project-osrm.org/route/v1/driving'

interface OsrmStep {
  name: string
  ref?: string
  distance: number
  duration: number
  intersections: Array<{ classes?: string[] }>
}

export interface OsrmSegment {
  distance: number
  duration: number
  roadName?: string
  hasToll?: boolean
}

export interface OsrmRouteResult {
  geometry: [number, number][]
  segments: OsrmSegment[]
  totalDistance: number
  totalDuration: number
}

const routeCache = new Map<string, OsrmRouteResult>()
const ROUTE_CACHE_MAX = 200

function extractLegRoadInfo(steps: OsrmStep[]): { roadName: string | null; hasToll: boolean } {
  const distByRoad = new Map<string, number>()
  let hasToll = false
  for (const step of steps) {
    if (step.intersections?.some(i => i.classes?.includes('toll'))) hasToll = true
    const rawRef = step.ref?.split(';')[0]?.trim()
    const label = rawRef || step.name?.trim()
    if (!label) continue
    distByRoad.set(label, (distByRoad.get(label) ?? 0) + step.distance)
  }
  if (distByRoad.size === 0) return { roadName: null, hasToll }
  const sorted = [...distByRoad.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([road]) => formatRoadRef(road))
    .filter(Boolean)
  return { roadName: sorted.join(' · ') || null, hasToll }
}

function formatRoadRef(ref: string): string {
  return ref
    .replace(/^I\s+(\d+)/i, 'I-$1')
    .replace(/^US\s+(\d+)/i, 'US-$1')
    .replace(/^SR\s+(\d+)/i, 'SR-$1')
    .replace(/^State Route\s+(\d+)/i, 'SR-$1')
    .replace(/^Highway\s+(\d+)/i, 'Hwy $1')
    .trim()
}

export async function getRoute(
  waypoints: Array<{ lat: number; lng: number }>,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<OsrmRouteResult> {
  if (waypoints.length < 2) throw new Error('At least 2 waypoints required')
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
  const cacheKey = `${profile}:${coords}`
  const cached = routeCache.get(cacheKey)
  if (cached) return cached

  const params = 'overview=full&geometries=geojson&steps=true&annotations=distance,duration'
  const primaryUrl = `${OSRM_PRIMARY[profile] ?? OSRM_PRIMARY.driving}/${coords}?${params}`
  const fallbackUrl = `${OSRM_FALLBACK}/${coords}?${params}`

  let data: unknown
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`OSRM primary ${res.status}`)
    data = await res.json()
  } catch {
    const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`OSRM fallback ${res.status}`)
    data = await res.json()
  }

  const d = data as {
    code: string
    routes?: Array<{
      geometry: { coordinates: [number, number][] }
      distance: number
      duration: number
      legs: Array<{ distance: number; duration: number; steps: OsrmStep[] }>
    }>
  }
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error('No route from OSRM')
  const route = d.routes[0]

  const geometry: [number, number][] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng]
  )
  const segments: OsrmSegment[] = (route.legs ?? []).map(leg => {
    const { roadName, hasToll } = extractLegRoadInfo(leg.steps ?? [])
    return { distance: leg.distance, duration: leg.duration, roadName: roadName ?? undefined, hasToll: hasToll || undefined }
  })

  const result: OsrmRouteResult = { geometry, segments, totalDistance: route.distance, totalDuration: route.duration }
  routeCache.set(cacheKey, result)
  if (routeCache.size > ROUTE_CACHE_MAX) {
    const oldest = routeCache.keys().next().value
    if (oldest !== undefined) routeCache.delete(oldest)
  }
  return result
}

export function metersToMiles(meters: number): string {
  return `${Math.round(meters / 1609.34)} miles`
}

export function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npm test 2>&1 | tail -10
```

Expected: `Tests 5 passed (5)`

- [ ] **Step 6: Write src/index.ts — McpServer with suggest_route_stops tool**

`mcp-servers/routing-mcp/src/index.ts`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
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
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
```

- [ ] **Step 7: Smoke test with wrangler dev**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npx wrangler dev --port 8787 &
sleep 3

# Health check
curl -s http://localhost:8787/health
# Expected: {"status":"ok","server":"routing-mcp"}

# MCP initialize
curl -s -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | head -c 200
# Expected: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"serverInfo":{"name":"routing-mcp","version":"1.0.0"}}}

kill %1
```

- [ ] **Step 8: Commit**

```bash
git add mcp-servers/routing-mcp/
git commit -m "feat: routing-mcp Worker with suggest_route_stops tool"
```

---

## Task 3: places-mcp Worker

**Files:**
- Create: `mcp-servers/places-mcp/src/route-utils.ts`
- Create: `mcp-servers/places-mcp/src/overpass-client.ts`
- Create: `mcp-servers/places-mcp/src/osm-helpers.ts`
- Create: `mcp-servers/places-mcp/__tests__/osm-helpers.test.ts`
- Modify: `mcp-servers/places-mcp/src/index.ts`

**Interfaces:**
- Consumes: `overpassQuery` from `overpass-client.ts`, `resolveCityCoords` from `route-utils.ts`
- Produces: MCP Worker at `POST /mcp` with tools `search_attractions`, `search_restaurants`, `explore_surroundings`

- [ ] **Step 1: Write the failing tests**

`mcp-servers/places-mcp/__tests__/osm-helpers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { osmCategory, osmAddress, parseSurroundingsElements } from '../src/osm-helpers'

describe('osmCategory', () => {
  it('returns Museum for tourism=museum', () => {
    expect(osmCategory({ tourism: 'museum' })).toBe('Museum')
  })

  it('returns Park for leisure=park', () => {
    expect(osmCategory({ leisure: 'park' })).toBe('Park')
  })

  it('falls back to Attraction for unknown tags', () => {
    expect(osmCategory({})).toBe('Attraction')
  })
})

describe('osmAddress', () => {
  it('assembles address from OSM tags', () => {
    expect(osmAddress({ 'addr:housenumber': '123', 'addr:street': 'Main St', 'addr:city': 'Nashville' }, 'Nashville'))
      .toBe('123, Main St, Nashville')
  })

  it('falls back to city when no address tags', () => {
    expect(osmAddress({}, 'Chicago')).toBe('Chicago')
  })
})

describe('parseSurroundingsElements', () => {
  it('infers Kayaking category from name', () => {
    const elements = [{
      id: 1, type: 'node' as const, lat: 41.8, lon: -87.6,
      tags: { tourism: 'attraction', name: 'Chicago Kayak Tours' },
    }]
    const results = parseSurroundingsElements(elements, 'Chicago', 5)
    expect(results[0].category).toBe('Kayaking')
  })

  it('deduplicates by name', () => {
    const elements = [
      { id: 1, type: 'node' as const, lat: 41.8, lon: -87.6, tags: { tourism: 'park', name: 'Central Park' } },
      { id: 2, type: 'node' as const, lat: 41.9, lon: -87.7, tags: { tourism: 'park', name: 'Central Park' } },
    ]
    expect(parseSurroundingsElements(elements, 'Chicago', 5)).toHaveLength(1)
  })

  it('respects limit', () => {
    const elements = Array.from({ length: 10 }, (_, i) => ({
      id: i, type: 'node' as const, lat: 41.8, lon: -87.6,
      tags: { leisure: 'park', name: `Park ${i}` },
    }))
    expect(parseSurroundingsElements(elements, 'Chicago', 3)).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/places-mcp && npm test 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/osm-helpers'`

- [ ] **Step 3: Copy route-utils.ts and overpass-client.ts from routing-mcp**

Copy `mcp-servers/routing-mcp/src/route-utils.ts` → `mcp-servers/places-mcp/src/route-utils.ts` (identical).

Copy `lib/overpass-client.ts` → `mcp-servers/places-mcp/src/overpass-client.ts`. Remove the `@/` alias imports (there are none — this file has no imports).

- [ ] **Step 4: Write src/osm-helpers.ts (ported from lib/claude-tools.ts)**

`mcp-servers/places-mcp/src/osm-helpers.ts`:
```typescript
import type { OsmElement } from './overpass-client'
import { overpassQuery } from './overpass-client'
import { resolveCityCoords } from './route-utils'

export interface Attraction {
  id: string
  name: string
  category: string
  address: string
  coordinates: { lat: number; lng: number }
  description?: string
  website?: string
  rating?: number
}

const TOURISM_CATEGORY: Record<string, string> = {
  attraction: 'Attraction', viewpoint: 'Scenic Viewpoint', museum: 'Museum',
  gallery: 'Art Gallery', artwork: 'Public Art', zoo: 'Zoo', aquarium: 'Aquarium',
  theme_park: 'Theme Park', hotel: 'Hotel', motel: 'Motel', hostel: 'Hostel',
  guest_house: 'Guest House', apartment: 'Apartment',
  camp_site: 'Campground', caravan_site: 'RV Park',
}
const AMENITY_CATEGORY: Record<string, string> = {
  theatre: 'Theatre', cinema: 'Cinema', arts_centre: 'Arts Centre',
  place_of_worship: 'Place of Worship', nightclub: 'Nightclub',
}
const LEISURE_CATEGORY: Record<string, string> = {
  park: 'Park', nature_reserve: 'Nature Reserve', garden: 'Garden',
  marina: 'Marina', water_park: 'Water Park', golf_course: 'Golf Course',
}
const HISTORIC_CATEGORY: Record<string, string> = {
  monument: 'Monument', memorial: 'Memorial', castle: 'Castle',
  ruins: 'Ruins', archaeological_site: 'Archaeological Site', battlefield: 'Historic Battlefield',
}
const NATURAL_CATEGORY: Record<string, string> = {
  beach: 'Beach', peak: 'Mountain Peak', waterfall: 'Waterfall',
  hot_spring: 'Hot Spring', cave_entrance: 'Cave',
}

export function osmCategory(tags: Record<string, string>): string {
  return (
    TOURISM_CATEGORY[tags.tourism ?? ''] ??
    AMENITY_CATEGORY[tags.amenity ?? ''] ??
    LEISURE_CATEGORY[tags.leisure ?? ''] ??
    HISTORIC_CATEGORY[tags.historic ?? ''] ??
    NATURAL_CATEGORY[tags.natural ?? ''] ??
    'Attraction'
  )
}

export function osmAddress(tags: Record<string, string>, city: string): string {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] ?? city,
    tags['addr:postcode'],
  ].filter(Boolean).join(', ')
}

export async function osmAttractions(city: string, limit: number): Promise<Attraction[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 15000
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

export function parseSurroundingsElements(elements: OsmElement[], city: string, limit: number): Attraction[] {
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
      tags.natural === 'waterfall' ? 'Waterfall' :
      tags.natural === 'beach' ? 'Beach' :
      tags.natural === 'peak' ? 'Mountain Peak' :
      tags.sport === 'kayak' || tags.sport === 'kayaking' ? 'Kayaking & Canoeing' :
      tags.sport === 'climbing' ? 'Rock Climbing' :
      tags.sport === 'rafting' ? 'Rafting' :
      tags.sport === 'fishing' ? 'Fishing' :
      tags.sport === 'skiing' ? 'Skiing' :
      tags.sport ? tags.sport.charAt(0).toUpperCase() + tags.sport.slice(1) :
      tags.leisure === 'nature_reserve' ? 'Nature Reserve' :
      tags.leisure === 'marina' ? 'Marina' :
      tags.leisure === 'water_park' ? 'Water Park' :
      tags.leisure ? tags.leisure.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) :
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

export async function osmSurroundingsQuery(lat: number, lng: number, city: string, limit = 8, qlTimeout = 15): Promise<Attraction[]> {
  const r = 30000
  const ql = `[out:json][timeout:${qlTimeout}];
(
  node["leisure"~"park|nature_reserve|marina|swimming_pool|golf_course|water_park"](around:${r},${lat},${lng});
  node["sport"~"hiking|cycling|kayak|kayaking|canoe|canoeing|climbing|fishing|skiing|swimming|rafting|sailing|windsurfing|rowing"](around:${r},${lat},${lng});
  node["tourism"~"attraction|viewpoint|theme_park|zoo|aquarium"](around:${r},${lat},${lng});
  node["tourism"~"camp_site|caravan_site|boat_tour"](around:${r},${lat},${lng});
  node["amenity"~"boat_rental"](around:${r},${lat},${lng});
  node["natural"~"waterfall|beach|peak|hot_spring|cave_entrance"](around:${r},${lat},${lng});
  node["attraction"~"boat_tour|scenic_railway|zip_line|gondola_lift|chair_lift|waterfall"](around:${r},${lat},${lng});
  node["name"~"cruise|cruises|kayak|canoe|paddle|boat.?tour|raft|zip.?line|scenic.?ride",i](around:${r},${lat},${lng});
);
out ${limit * 2};`
  const elements = await overpassQuery(ql)
  return parseSurroundingsElements(elements, city, limit)
}
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/places-mcp && npm test 2>&1 | tail -10
```

Expected: `Tests 6 passed (6)`

- [ ] **Step 6: Write src/index.ts — McpServer with 3 place tools**

`mcp-servers/places-mcp/src/index.ts`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
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
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
```

- [ ] **Step 7: Smoke test with wrangler dev**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/places-mcp && npx wrangler dev --port 8788 &
sleep 3
curl -s http://localhost:8788/health
# Expected: {"status":"ok","server":"places-mcp"}
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add mcp-servers/places-mcp/
git commit -m "feat: places-mcp Worker with search_attractions, search_restaurants, explore_surroundings"
```

---

## Task 4: hotels-mcp Worker

**Files:**
- Create: `mcp-servers/hotels-mcp/src/route-utils.ts`
- Create: `mcp-servers/hotels-mcp/src/overpass-client.ts`
- Create: `mcp-servers/hotels-mcp/src/osm-hotel-helpers.ts`
- Create: `mcp-servers/hotels-mcp/__tests__/osm-hotel-helpers.test.ts`
- Modify: `mcp-servers/hotels-mcp/src/index.ts`

**Interfaces:**
- Consumes: `overpassQuery` from `overpass-client.ts`, `resolveCityCoords` from `route-utils.ts`
- Produces: MCP Worker at `POST /mcp` with tools `search_hotels`, `check_hotel_availability`, `build_booking_summary`

- [ ] **Step 1: Write the failing tests**

`mcp-servers/hotels-mcp/__tests__/osm-hotel-helpers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildBookingSummaryPayload, osmAddress } from '../src/osm-hotel-helpers'

describe('buildBookingSummaryPayload', () => {
  it('calculates nights and total price correctly', () => {
    const result = buildBookingSummaryPayload({
      hotelId: 'h1', hotelName: 'Test Hotel', offerId: 'o1',
      roomType: 'Standard', pricePerNight: 100, currency: 'USD',
      checkIn: '2026-07-01', checkOut: '2026-07-03',
      adults: 2, cancellationPolicy: 'Non-refundable', breakfastIncluded: false,
    })
    expect(result.summary.nights).toBe(2)
    expect(result.summary.totalPrice).toBe(200)
    expect(result.summary.bookingUrl).toContain('offerId=o1')
  })

  it('builds correct booking URL', () => {
    const result = buildBookingSummaryPayload({
      hotelId: 'h2', hotelName: 'Inn', offerId: 'xyz',
      roomType: 'Deluxe', pricePerNight: 150, currency: 'USD',
      checkIn: '2026-08-10', checkOut: '2026-08-12',
      adults: 1, cancellationPolicy: 'Free cancellation', breakfastIncluded: true,
    })
    expect(result.summary.bookingUrl).toContain('adults=1')
  })
})

describe('osmAddress', () => {
  it('assembles address from tags', () => {
    const result = osmAddress({ 'addr:housenumber': '10', 'addr:street': 'Oak Ave' }, 'Nashville')
    expect(result).toContain('Oak Ave')
  })

  it('falls back to city when no addr tags', () => {
    expect(osmAddress({}, 'Memphis')).toBe('Memphis')
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/hotels-mcp && npm test 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../src/osm-hotel-helpers'`

- [ ] **Step 3: Copy route-utils.ts and overpass-client.ts**

Copy `mcp-servers/routing-mcp/src/route-utils.ts` → `mcp-servers/hotels-mcp/src/route-utils.ts` (identical).
Copy `mcp-servers/places-mcp/src/overpass-client.ts` → `mcp-servers/hotels-mcp/src/overpass-client.ts` (identical).

- [ ] **Step 4: Write src/osm-hotel-helpers.ts (ported from lib/claude-tools.ts)**

`mcp-servers/hotels-mcp/src/osm-hotel-helpers.ts`:
```typescript
import { overpassQuery } from './overpass-client'
import { resolveCityCoords } from './route-utils'

export interface Hotel {
  hotelId: string
  name: string
  rating?: number
  address: string
  coordinates: { lat: number; lng: number }
  pricePerNight: number
  currency: string
  dealTag?: string
  amenities: string[]
  availableOffers: HotelOffer[]
}

export interface HotelOffer {
  offerId: string
  roomType: string
  bedType: string
  price: number
  currency: string
  cancellationPolicy: string
  breakfastIncluded: boolean
}

export interface BookingSummaryParams {
  hotelId: string
  hotelName: string
  offerId: string
  roomType: string
  pricePerNight: number
  currency: string
  checkIn: string
  checkOut: string
  adults: number
  cancellationPolicy: string
  breakfastIncluded: boolean
}

const HOTEL_PRICE_TIER: Record<string, number> = {
  hotel: 130, motel: 80, hostel: 50, guest_house: 90,
  apartment: 100, camp_site: 35, caravan_site: 45,
}
const STAR_PRICE = [0, 65, 85, 115, 170, 240]

export function osmAddress(tags: Record<string, string>, city: string): string {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] ?? city,
    tags['addr:postcode'],
  ].filter(Boolean).join(', ')
}

export async function osmHotels(city: string): Promise<Hotel[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 12000
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
    const variation = 0.9 + (el.id % 3) * 0.1
    const pricePerNight = Math.round(basePrice * variation)

    const amenities: string[] = []
    if (tags.swimming_pool === 'yes' || tags['amenity:swimming_pool']) amenities.push('Pool')
    if (tags.internet_access === 'wlan' || tags.wifi === 'yes') amenities.push('WiFi')
    if (tags.parking === 'yes' || tags['parking:fee'] === 'no') amenities.push('Parking')
    if (tags.restaurant === 'yes') amenities.push('Restaurant')
    if (tags['access:fitness'] === 'yes' || tags.gym === 'yes') amenities.push('Gym')
    if (tags.bar === 'yes') amenities.push('Bar')
    if (tags['pets:allowed'] === 'yes') amenities.push('Pet-Friendly')

    results.push({
      hotelId: `osm-${el.type}-${el.id}`,
      name,
      rating: stars,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      pricePerNight,
      currency: 'USD',
      dealTag: el.id % 5 === 0 ? 'Best Value' : undefined,
      amenities,
      availableOffers: [{
        offerId: `osm-offer-${el.id}`,
        roomType: 'Standard Room',
        bedType: 'King',
        price: pricePerNight,
        currency: 'USD',
        cancellationPolicy: 'Non-refundable',
        breakfastIncluded: false,
      }],
    })
    if (results.length >= 5) break
  }
  return results
}

export function buildBookingSummaryPayload(params: BookingSummaryParams): { summary: Record<string, unknown> } {
  const nights = Math.round(
    (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / (1000 * 60 * 60 * 24)
  )
  const totalPrice = params.pricePerNight * nights
  const bookingUrl = `https://hotels.example.com/book?offerId=${params.offerId}&adults=${params.adults}`
  return {
    summary: {
      hotelId: params.hotelId, hotelName: params.hotelName, offerId: params.offerId,
      roomType: params.roomType, checkIn: params.checkIn, checkOut: params.checkOut,
      nights, adults: params.adults, pricePerNight: params.pricePerNight,
      totalPrice, currency: params.currency, cancellationPolicy: params.cancellationPolicy,
      breakfastIncluded: params.breakfastIncluded, bookingUrl,
    },
  }
}
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/hotels-mcp && npm test 2>&1 | tail -10
```

Expected: `Tests 4 passed (4)`

- [ ] **Step 6: Write src/index.ts — McpServer with 3 hotel tools**

`mcp-servers/hotels-mcp/src/index.ts`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { osmHotels, buildBookingSummaryPayload } from './osm-hotel-helpers'

function createServer(): McpServer {
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
      return { content: [{ type: 'text' as const, text: JSON.stringify({ hotels, city, checkIn, checkOut }) }] }
    }
  )

  server.tool(
    'check_hotel_availability',
    'Check detailed availability and room options for a specific hotel.',
    {
      hotelId: z.string(),
      hotelName: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      adults: z.number().default(2),
    },
    async ({ hotelId, hotelName, checkIn, checkOut }) => {
      // OSM has no real-time availability — return estimated availability
      const payload = {
        available: true, hotelId, hotelName, checkIn, checkOut,
        offers: [{ id: `offer-${hotelId}`, roomType: 'Standard Room', bedType: 'King' }],
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
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', server: 'hotels-mcp' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const server = createServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
```

- [ ] **Step 7: Smoke test with wrangler dev**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/hotels-mcp && npx wrangler dev --port 8789 &
sleep 3
curl -s http://localhost:8789/health
# Expected: {"status":"ok","server":"hotels-mcp"}
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add mcp-servers/hotels-mcp/
git commit -m "feat: hotels-mcp Worker with search_hotels, check_hotel_availability, build_booking_summary"
```

---

## Task 5: Deploy all 3 Workers to Cloudflare

**Files:**
- No code changes — deploy existing Workers

**Interfaces:**
- Produces: Three live production URLs recorded in `.env.local`

> **Pre-requisite:** You need a free Cloudflare account. Run `npx wrangler login` once to authenticate.

- [ ] **Step 1: Log in to Cloudflare (one-time)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npx wrangler login
```

A browser tab opens. Log in with your Cloudflare account (free tier is sufficient). Returns to terminal when complete.

- [ ] **Step 2: Deploy routing-mcp**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/routing-mcp && npx wrangler deploy
```

Expected output includes:
```
✅ Successfully deployed road-trip-routing-mcp
🚀 https://road-trip-routing-mcp.<your-subdomain>.workers.dev
```

Record the URL.

- [ ] **Step 3: Deploy places-mcp**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/places-mcp && npx wrangler deploy
```

Record the URL: `https://road-trip-places-mcp.<your-subdomain>.workers.dev`

- [ ] **Step 4: Deploy hotels-mcp**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
cd mcp-servers/hotels-mcp && npx wrangler deploy
```

Record the URL: `https://road-trip-hotels-mcp.<your-subdomain>.workers.dev`

- [ ] **Step 5: Smoke test all three production Workers**

```bash
# Replace <subdomain> with your actual Cloudflare subdomain
curl -s https://road-trip-routing-mcp.<subdomain>.workers.dev/health
# Expected: {"status":"ok","server":"routing-mcp"}

curl -s https://road-trip-places-mcp.<subdomain>.workers.dev/health
# Expected: {"status":"ok","server":"places-mcp"}

curl -s https://road-trip-hotels-mcp.<subdomain>.workers.dev/health
# Expected: {"status":"ok","server":"hotels-mcp"}
```

- [ ] **Step 6: Write .env.local additions**

Append to `/home/yeteesh/__myworkarea/projects/genai/road-trip-planner/.env.local` (replace `<subdomain>` with actual value):

```bash
ROUTING_MCP_URL=https://road-trip-routing-mcp.<subdomain>.workers.dev/mcp
PLACES_MCP_URL=https://road-trip-places-mcp.<subdomain>.workers.dev/mcp
HOTELS_MCP_URL=https://road-trip-hotels-mcp.<subdomain>.workers.dev/mcp
```

- [ ] **Step 7: Commit**

```bash
git add mcp-servers/
git commit -m "chore: deploy routing-mcp, places-mcp, hotels-mcp to Cloudflare Workers"
```

---

## Task 6: Wire Next.js app to MCP servers

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `lib/claude-tools.ts`
- Modify: `contexts/trip-tool-results.ts`
- Modify: `package.json` (add `@modelcontextprotocol/sdk`)

**Interfaces:**
- Consumes: `ROUTING_MCP_URL`, `PLACES_MCP_URL`, `HOTELS_MCP_URL` env vars
- Consumes: `SYSTEM_PROMPT`, `render_ui` tool from `lib/claude-tools.ts`
- Produces: Next.js app calling MCP servers instead of inline tools; existing card rendering unchanged

**Critical detail:** When `streamText` uses MCP tools, the Vercel AI SDK serialises the MCP tool result `content[0].text` and passes it as the tool result string to the LLM. In `TripContext`, `toolInvocation.result` will be a **JSON string** for MCP tools instead of a parsed object. `extractToolResults` in `contexts/trip-tool-results.ts` must safely parse it.

- [ ] **Step 1: Install @modelcontextprotocol/sdk in the Next.js app**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm install @modelcontextprotocol/sdk@^1.12.0
```

Expected: package added to `package.json` dependencies.

- [ ] **Step 2: Update contexts/trip-tool-results.ts to handle string results**

Read `contexts/trip-tool-results.ts`. Find the `extractToolResults` function. Locate each place that reads `toolInvocation.result` and add a safe parse guard:

```typescript
// Replace every pattern like:
const result = toolInvocation.result as SomeType

// With:
function parseResult<T>(result: unknown): T {
  if (typeof result === 'string') {
    try { return JSON.parse(result) as T } catch { return result as unknown as T }
  }
  return result as T
}

const result = parseResult<SomeType>(toolInvocation.result)
```

Add the `parseResult` helper at the top of the file (below imports, before the first function). Then replace every `toolInvocation.result as X` cast with `parseResult<X>(toolInvocation.result)`. This makes the extraction safe for both inline tools (objects) and MCP tools (JSON strings).

- [ ] **Step 3: Verify tests still pass after trip-tool-results.ts change**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run 2>&1 | tail -10
```

Expected: all existing 78 tests pass.

- [ ] **Step 4: Update app/api/chat/route.ts to use MCP clients**

Replace the file content with:

```typescript
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { experimental_createMCPClient } from 'ai'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { renderUiTool, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const runtime = 'edge'
export const maxDuration = 30

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://road-trip-planner-blush.vercel.app',
    'X-Title': 'Road Trip Planner',
  },
})

const MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free'
const MAX_HISTORY_MESSAGES = 30

const USE_MCP = !!(
  process.env.ROUTING_MCP_URL &&
  process.env.PLACES_MCP_URL &&
  process.env.HOTELS_MCP_URL
)

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY is not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await req.json() as { messages: any; tripStyles?: string[] }
  const { messages, tripStyles } = body

  const trimmed: typeof messages =
    messages.length <= MAX_HISTORY_MESSAGES
      ? messages
      : [messages[0], ...messages.slice(-(MAX_HISTORY_MESSAGES - 1))]

  const today = new Date().toISOString().split('T')[0]
  const styleNote =
    tripStyles && tripStyles.length > 0 && messages.length <= 2
      ? `\n\nTrip style preferences: ${tripStyles.join(', ')}. Tailor recommendations accordingly.`
      : ''

  let tools: Record<string, unknown>

  if (USE_MCP) {
    // MCP mode — tools served from Cloudflare Workers
    const [routingClient, placesClient, hotelsClient] = await Promise.all([
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.ROUTING_MCP_URL!)),
      }),
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.PLACES_MCP_URL!)),
      }),
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.HOTELS_MCP_URL!)),
      }),
    ])

    const [routingTools, placesTools, hotelTools] = await Promise.all([
      routingClient.tools(),
      placesClient.tools(),
      hotelsClient.tools(),
    ])

    tools = { ...routingTools, ...placesTools, ...hotelTools, render_ui: renderUiTool }
  } else {
    // Fallback — inline tools (works without MCP env vars)
    const { agentTools } = await import('@/lib/claude-tools')
    tools = agentTools
  }

  const result = streamText({
    model: openrouter(MODEL),
    system: `${SYSTEM_PROMPT}${styleNote}\n\nToday's date is ${today}.`,
    messages: trimmed,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    maxSteps: 15,
    onError: ({ error }) => { console.error('[OpenRouter] streamText error:', error) },
  })

  return result.toDataStreamResponse()
}
```

- [ ] **Step 5: Update lib/claude-tools.ts — extract render_ui as named export**

Read `lib/claude-tools.ts`. The file currently exports `agentTools` (object containing all tools) and `SYSTEM_PROMPT`.

Add a named export for `render_ui` alone so `route.ts` can import just that tool:

```typescript
// Add below the agentTools export, near the bottom of the file:
export const renderUiTool = agentTools.render_ui
```

The `agentTools` object stays intact for the fallback path. No tool implementations need to be removed yet — the fallback import path keeps them working when `USE_MCP` is false.

- [ ] **Step 6: Verify the build passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` — no TypeScript errors.

- [ ] **Step 7: Smoke test locally with MCP env vars set**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run dev &
sleep 5

# Verify the app starts without error and responds to a health ping
curl -s http://localhost:3000/api/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"plan a 2 day trip from Chicago to Nashville"}]}' \
  --max-time 5 2>&1 | head -c 100

kill %1
```

Expected: streaming SSE response starts (may be partial) — no 500 error.

Full smoke test: open `npm run dev` in browser, plan a trip from Chicago to Nashville, verify:
- `RouteSummaryCard` appears in chat
- `HotelResultsCard` appears per stop
- `AttractionGridCard` appears per stop
- `RestaurantCard` appears per stop
- `SurroundingsCard` appears per stop
- Map pins and route polyline draw correctly
- `~$NNN` cost badge appears in route pill

- [ ] **Step 8: Run all tests**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run 2>&1 | tail -10
```

Expected: `78 passed (78)` (or more if new tests were added).

- [ ] **Step 9: Commit**

```bash
git add app/api/chat/route.ts lib/claude-tools.ts contexts/trip-tool-results.ts package.json package-lock.json
git commit -m "feat: wire Next.js app to MCP servers via experimental_createMCPClient"
```

- [ ] **Step 10: Add Vercel environment variables and deploy**

In Vercel dashboard → Settings → Environment Variables, add:
```
ROUTING_MCP_URL = https://road-trip-routing-mcp.<subdomain>.workers.dev/mcp
PLACES_MCP_URL  = https://road-trip-places-mcp.<subdomain>.workers.dev/mcp
HOTELS_MCP_URL  = https://road-trip-hotels-mcp.<subdomain>.workers.dev/mcp
```

Deploy:
```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npx vercel --prod --yes
npx vercel alias set <new-deployment-url> road-trip-planner-blush.vercel.app
```

Expected: production deploy succeeds, alias updated.

---

## Verification Checklist

After all tasks are complete:

```bash
# 1. All Workers healthy
curl https://road-trip-routing-mcp.<subdomain>.workers.dev/health
curl https://road-trip-places-mcp.<subdomain>.workers.dev/health
curl https://road-trip-hotels-mcp.<subdomain>.workers.dev/health

# 2. Next.js tests pass
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run

# 3. Next.js build passes
npm run build

# 4. Per-Worker tests pass
cd mcp-servers/routing-mcp && npm test && cd ../..
cd mcp-servers/places-mcp && npm test && cd ../..
cd mcp-servers/hotels-mcp && npm test && cd ../..
```

Manual smoke test: plan Chicago → Indianapolis → Louisville → Nashville, verify all 6 card types appear in chat and map renders correctly.
