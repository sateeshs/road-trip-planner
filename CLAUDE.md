# Road Trip Planner — Project Context for Claude

## What This App Is
AI-powered US road trip planner. User types a trip (e.g. "2 day road trip from Northville MI to Pictured Rocks") and the AI plans stops, draws the route on a map, finds hotels and attractions, supports hotel booking, and shows outdoor activities including kayaking, cruises, boat tours, zip lines, and scenic rides.

Live: https://road-trip-planner-blush.vercel.app

---

## Tech Stack
- **Framework**: Next.js 15.5 (App Router), TypeScript, Tailwind CSS v4
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/openai`) → OpenRouter → `openai/gpt-oss-120b:free`
- **Map**: Leaflet via `react-leaflet` + `react-leaflet-cluster` — `components/LeafletMap.tsx`
- **Routing**: OSRM public servers (free, no API key) — `lib/osrm-client.ts`
- **Geocoding**: Nominatim (OpenStreetMap, free, 2-pass retry) + hardcoded table (~100 US cities/landmarks) — `lib/route-utils.ts`
- **Places/Attractions**: Foursquare Places API v3 (optional) → OSM/Overpass fallback — `lib/foursquare-client.ts`
- **Hotels**: Amadeus for Developers (optional) → OSM/Overpass fallback — `lib/amadeus-client.ts`
- **Deployment**: Vercel (Hobby plan, Edge runtime)

---

## Key Architecture

### Data Flow
```
User chat → POST /api/chat (Edge runtime, 30s limit)
  → streamText() with tools → streaming SSE
  → useEffect on messages in app/page.tsx
  → setStops / setHotelsByCity / setAttractionsByCity
  → props to MapView → LeafletMap → markers + route drawn
```

### AI Tools (`lib/claude-tools.ts`)

| Tool | Description |
|------|-------------|
| `suggest_route_stops` | Resolves city coords via `resolveCityCoords()`, calls OSRM, returns stops + route geometry + highway names + toll flags |
| `search_attractions` | Foursquare (key required) or OSM/Overpass fallback for landmarks/museums/parks |
| `search_hotels` | Amadeus (key required) or OSM/Overpass fallback with star-based pricing |
| `explore_surroundings` | Foursquare or OSM fallback for outdoor activities. Called for EVERY stop. |
| `check_hotel_availability` | Amadeus detailed availability check |
| `build_booking_summary` | Builds booking review data before hotel redirect |

**Tool call order enforced in SYSTEM_PROMPT:**
`suggest_route_stops` → `search_attractions` (all stops) → `search_hotels` (all stops) → `explore_surroundings` (all stops)

### AI Tool — `explore_surroundings` Activity Categories
```
camping, kayaking, hiking, cycling, atv_rides, horseback, rock_climbing,
fishing, swimming, rafting, boating, cruise, boat_tour, zip_line,
scenic_ride, scenic_views, skiing, waterfalls
```
Geography hints in SYSTEM_PROMPT:
- Great Lakes / rivers / harbors → `cruise`, `boat_tour`, `kayaking`
- Mountains / resorts → `hiking`, `zip_line`, `scenic_ride`, `skiing`
- National parks / lakeshore → `hiking`, `kayaking`, `camping`, `waterfalls`
- Desert / rural → `atv_rides`, `horseback`, `camping`

### Map Component (`components/LeafletMap.tsx`)
- CartoDB Voyager tile layer (streets + place names, no API key)
- **Route**: Two-layer animated polyline (casing + core, Apple Maps style), ported from TREK
- **Interactive segments**: Click any route segment → popup shows drive time, distance, highway name ("Via I-65 S · US-31 N"), toll warning if applicable
- **Stop markers**: 🚗 origin, 🏁 destination, numbered intermediates; pulsing ring on selected stop
- **Provisional stop**: Pulsing 📍 "Adding…" marker shown while AI processes a map right-click
- **Right-click**: `contextmenu` event → reverse geocode → context menu → "Add as stop + Explore"
- **Hotel markers**: Green H squares, clustered via `react-leaflet-cluster`
- **Confirmed reservation markers**: Gold/green checkmark overlay above hotel marker
- **Attraction markers**: Amber circles
- **Surroundings markers**: Teal circles
- **Proactive POI markers**: Gray (gas), orange (food), violet (attractions), sky-blue (restrooms), green (campgrounds)
- **Hover tooltips**: Fixed-position div with name, category, extra info (ported from TREK TooltipOverlay)

### State (`app/page.tsx`)
All state is client-side only (no database):
```typescript
stops: RouteStop[]                          // ordered origin → destination
routeGeometry: RouteGeometry | null         // [lat, lng][] from OSRM
hotelsByCity: Record<string, Hotel[]>       // keyed by city name
attractionsByCity: Record<string, Attraction[]>  // keyed by city name
surroundings: Attraction[]                  // for currently selected stop
confirmedReservations: ConfirmedReservation[]
```
Tool results are extracted from AI SDK message parts in a `useEffect` watching `messages`.

### Proactive POIs (`hooks/useProactivePlaces.ts`)
Auto-triggered when ≥2 stops set. Fetches from Overpass API (single mirror) near route midpoint:
- Gas stations (`amenity=fuel`)
- Restaurants (`amenity=restaurant|cafe|fast_food`)
- Attractions (`tourism=attraction|museum|viewpoint|theme_park`)
- Restrooms (`highway=rest_area`) — highway pull-off rest stops
- Campgrounds (`tourism=camp_site|caravan_site`)

---

## Geocoding (`lib/route-utils.ts`)

### Three-tier resolution
1. **Hardcoded table** (~100 entries) — instant, no network. Covers major US cities + common road trip landmarks (Pictured Rocks, Soo Locks, Tahquamenon Falls, national parks, etc.)
2. **In-memory cache** — results from previous Nominatim calls survive for the process lifetime
3. **Nominatim 2-pass** — robust geocoding with retry

### Nominatim 2-pass strategy (permanent fix, ported from TREK pattern)
```
Pass 1: "Soo Locks, Michigan, United States"  (with state for precision)
Pass 2: "Soo Locks, United States"            (without state if pass 1 empty)
```
- `limit=5`, `addressdetails=1` (structured address, not regex)
- `pickBestResult()` prefers results matching expected state code
- Timeout: 5s per call
- **Throttle: 1.1s minimum between Nominatim requests** (ported from TREK atlasService.ts) to avoid rate-limiting under concurrent users

### Why this approach (vs TREK)
TREK also uses Nominatim for forward geocoding — it has no special bundled dataset for place names. TREK's bundled `admin0/admin1.geojson.gz` files are only for **reverse geocoding** (lat/lng → country/region for atlas map). Our 2-pass retry is actually more robust than TREK (TREK has no retry logic).

### When to add a city to the hardcoded table
Only add to `US_MAJOR_CITIES` in `route-utils.ts` if:
- Nominatim consistently returns the wrong location for it
- It's a very common road trip destination the AI must never fail on
- Example: "Pictured Rocks" → Nominatim used to find a Nevada location; hardcoded to Munising, MI

---

## OSRM Routing (`lib/osrm-client.ts`)

### Highway & Toll Detection
OSRM is queried with `steps=true`, which returns per-leg step data:
- `step.ref` — road reference (e.g. "I 65;US 31") — preferred over name for display
- `step.name` — road name (e.g. "Interstate 65 North")
- `step.intersections[].classes` — includes `"toll"` if the step passes a toll plaza

`extractLegRoadInfo(steps)` aggregates distance per road, picks top 2 by distance, formats to "I-65 S · US-31 N". `hasToll` is set if any step has `classes: ["toll"]`.

### Per-stop fields
Each `RouteStop` carries:
- `driveTimeFromPrevious` — e.g. "2h 35m"
- `driveDistanceFromPrevious` — e.g. "145 miles"
- `roadName` — dominant highway(s) on the leg, e.g. "I-65 S · US-31 N"
- `hasToll` — true if leg passes through a toll road

### Route cache
Module-level `Map<cacheKey, OsrmRouteResult>`, max 200 entries FIFO.

### Servers
- **Primary**: `routing.openstreetmap.de` (FOSSGIS) — per-profile (driving/walking/cycling)
- **Fallback**: `router.project-osrm.org` (OSRM demo, car-only)

---

## OSM/Overpass Free Fallback (`lib/claude-tools.ts`)

Used when Foursquare/Amadeus keys are not set.

### Mirror racing (ported from TREK `mapsService.ts`)
```typescript
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
// Promise.any() — first mirror to respond wins; others aborted
// 12s AbortController timeout per mirror
// Checks data.remark for HTTP-200 timeout signals
```

### POI cache
5-min TTL, 500-entry FIFO in-memory `Map` keyed by Overpass QL string.

### OSM Attractions query
Fast grouped tilde queries on `node` only (22 separate `nwr` filters were too slow for Edge 30s limit):
```
node["tourism"~"attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park"]
node["historic"~"monument|memorial|castle|ruins|archaeological_site"]
node["amenity"~"theatre|cinema|arts_centre"]
node["leisure"~"park|nature_reserve|garden"]
node["natural"~"beach|peak|waterfall"]
```

### OSM Hotels query
Single `nwr["tourism"~"hotel|motel|hostel|guest_house"]` — uses `nwr` to catch hotel buildings (ways). Star-based price estimation (`STAR_PRICE = [0, 65, 85, 115, 170, 240]`). 11-field amenity extraction.

### OSM Surroundings query
Radius 30km, timeout 15s:
```
node["leisure"~"park|nature_reserve|marina|swimming_pool|golf_course|water_park"]
node["sport"~"hiking|cycling|kayak|kayaking|canoe|canoeing|climbing|fishing|..."]
node["tourism"~"attraction|viewpoint|theme_park|zoo|aquarium"]
node["tourism"~"camp_site|caravan_site|boat_tour"]
node["amenity"~"boat_rental"]
node["natural"~"waterfall|beach|peak|hot_spring|cave_entrance"]
node["attraction"~"boat_tour|scenic_railway|zip_line|gondola_lift|..."]
```
Category inference from `tourism=attraction` name keywords: cruise/boat tour companies, kayak operators, zip lines, etc.

---

## Features

### Remove Stop
Click any intermediate stop marker → StopBottomSheet opens → red "Remove stop" trash button in header.
- Only shown for intermediate stops (not origin or destination, requires ≥3 stops total)
- Immediately removes from `stops[]`, clears `hotelsByCity[city]` and `attractionsByCity[city]`
- AI recalculates route with updated stop list

### Right-Click Map → Add Stop
Right-click (contextmenu) on map → reverse geocode via Nominatim → context menu popup.
- Provisional stop (pulsing 📍) inserted before final destination while AI processes
- AI calls: `suggest_route_stops` → `search_attractions` → `search_hotels` → `explore_surroundings`

### Highway / Toll Display
Click any blue route line segment → popup card shows:
- From / To cities
- Drive time + distance
- "Via I-65 S · US-31 N" blue badge (if highway data available)
- "⚠️ Toll road" amber badge (if toll detected)
Also shown in stop marker hover tooltip.

### Proactive POIs
Auto-fetched (no AI call) when ≥2 stops are set:
- ⛽ Gas stations (gray dots)
- 🍽️ Restaurants (orange dots)
- 🎯 Attractions (violet dots)
- 🚻 Highway rest areas / restrooms (sky-blue dots)
- ⛺ Campgrounds (green dots)

---

## Environment Variables

### Required
```
OPENROUTER_API_KEY=sk-or-v1-...
```

### Optional (graceful degradation without these)
```
FOURSQUARE_API_KEY=...               # Attractions/surroundings (falls back to OSM)
AMADEUS_CLIENT_ID=...                # Hotel search (falls back to OSM)
AMADEUS_CLIENT_SECRET=...            # Hotel search (falls back to OSM)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...  # Not currently used (map is Leaflet)
OPENROUTER_MODEL=...                 # Default: openai/gpt-oss-120b:free
NEXT_PUBLIC_APP_URL=...              # OpenRouter HTTP-Referer header
```

---

## Deployment
```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run build
npx vercel --prod --yes
# vercel --prod doesn't always update the custom alias — always run this:
npx vercel alias set <new-deployment-url> road-trip-planner-blush.vercel.app
```

Node v22.13.1 required. System node is v12 — always prefix with `~/.nvm/versions/node/v22.13.1/bin/`.

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Attractions/hotels not showing | AI calling `explore_surroundings` before `search_attractions`/`search_hotels` | SYSTEM_PROMPT enforces strict tool call order |
| Wrong city geocoded | Nominatim finds unexpected location | Add correct coords to `US_MAJOR_CITIES` in `route-utils.ts` |
| Landmark not found (e.g. "Soo Locks") | Nominatim fails with state qualifier | 2-pass retry now handles this; add to hardcoded table only if retry also fails |
| Edge function timeout | Too many slow Overpass queries in one response | Keep `explore_surroundings` after other tools; use `node` not `nwr` in fast queries |
| Vercel alias not updated | `vercel --prod` doesn't auto-alias | Always run `vercel alias set` manually after deploy |
| Overpass mirror down | Single mirror unreliable | Mirror racing via `Promise.any()` across 4 mirrors |

---

## File Structure
```
app/
  page.tsx                  — main page, all client state management
  layout.tsx                — root layout
  globals.css               — global CSS + Leaflet CSS imports
  api/
    chat/route.ts           — AI streaming endpoint (Edge runtime, 30s)
    places/route.ts         — Google Places proxy (unused, Edge runtime)
components/
  LeafletMap.tsx            — main interactive map (Leaflet + react-leaflet)
  MapView.tsx               — dynamic import wrapper + MapErrorBoundary
  ChatPanel.tsx             — chat UI with react-markdown
  StopBottomSheet.tsx       — hotel/attraction/surroundings sheet for selected stop
  FloatingRouteSummary.tsx  — top pill: route, distance, booking count
  ItineraryPanel.tsx        — confirmed bookings side panel
  BookingReviewModal.tsx    — hotel booking confirmation modal
  MapSuggestions.tsx        — quick-start suggestion chips (shown when no messages)
  MapControlsPill.tsx       — zoom controls overlay
  shared/Spinner.tsx        — loading spinner
hooks/
  useProactivePlaces.ts     — auto-fetch gas/food/restrooms/campgrounds near route midpoint
lib/
  claude-tools.ts           — all AI tool definitions + SYSTEM_PROMPT + Overpass client
  route-utils.ts            — city geocoding: hardcoded table + 2-pass Nominatim
  osrm-client.ts            — OSRM routing + highway/toll extraction from steps
  foursquare-client.ts      — Foursquare Places API v3 client + category definitions
  amadeus-client.ts         — Amadeus hotel search client
types/
  index.ts                  — RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry,
                              ConfirmedReservation, ChatMessage
```

---

## Git Workflow
- **`master`** — production branch, deployed to `road-trip-planner-blush.vercel.app`
- **`feature/enhancements`** — active development branch; open PRs against `master`
- Always commit to `feature/enhancements`, then create a PR to merge into `master`
