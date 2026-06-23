# Road Trip Planner — Project Context for Claude

## What This App Is
AI-powered US road trip planner. User types a trip (e.g. "2 day road trip from Northville MI to Pictured Rocks") and the AI plans stops, draws the route on a map, finds hotels and attractions, and supports hotel booking.

Live: https://road-trip-planner-blush.vercel.app

## Tech Stack
- **Framework**: Next.js 15.5 (App Router), TypeScript, Tailwind CSS v4
- **AI**: Vercel AI SDK (`ai`, `@ai-sdk/openai`) → OpenRouter → `openai/gpt-oss-120b:free`
- **Map**: Google Maps JS API via `@react-google-maps/api` + `@googlemaps/markerclusterer`
- **Routing**: OSRM public servers (free, no API key) — `lib/osrm-client.ts`
- **Geocoding**: Nominatim (OpenStreetMap, free) + hardcoded table for ~80 major cities — `lib/route-utils.ts`
- **Places/Attractions**: Foursquare Places API v3 — `lib/foursquare-client.ts`
- **Hotels**: Amadeus for Developers — `lib/amadeus-client.ts`
- **Deployment**: Vercel (Hobby plan)

## Key Architecture

### Data Flow
```
User chat → POST /api/chat (Edge runtime) → streamText() with tools → streaming SSE
→ useEffect on messages in app/page.tsx → setStops/setAttractions/setHotels
→ props to GoogleMapView → markers + route drawn on map
```

### AI Tools (lib/claude-tools.ts)
- `suggest_route_stops` — resolves city coords via `resolveCityCoords()`, calls OSRM, returns stops + route geometry
- `search_attractions` — calls Foursquare for landmarks/museums/parks
- `search_hotels` — calls Amadeus for hotel offers with pricing
- `explore_surroundings` — calls Foursquare for outdoor activities (kayaking, hiking, camping, etc.)
- `check_hotel_availability` — Amadeus detailed availability
- `build_booking_summary` — builds booking review data before redirect

### Map Component
- `components/GoogleMapView.tsx` — main map (replaces old LeafletMap)
- `components/MapView.tsx` — thin wrapper with error boundary + `dynamic(() => import('./GoogleMapView'), { ssr: false })`
- `hooks/useProactivePlaces.ts` — auto-fetches gas stations/restaurants/attractions near route midpoint when ≥2 stops are set

### State (app/page.tsx)
All state is client-side only (no database):
- `stops: RouteStop[]` — ordered list from origin to destination
- `routeGeometry: RouteGeometry | null` — `[lat, lng][]` array from OSRM
- `hotels: Hotel[]`, `attractions: Attraction[]`, `surroundings: Attraction[]`
- `confirmedReservations: ConfirmedReservation[]` — bookings confirmed in session
- Tool results are extracted from message parts in a `useEffect` watching `messages`

## Environment Variables

### Required
```
OPENROUTER_API_KEY=sk-or-v1-...      # AI model via OpenRouter
```

### Optional (features degrade gracefully without these)
```
FOURSQUARE_API_KEY=...               # Attractions/surroundings search
AMADEUS_CLIENT_ID=...                # Hotel search
AMADEUS_CLIENT_SECRET=...            # Hotel search
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...  # Google Maps tiles + Places API (browser)
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...   # Required for AdvancedMarkerElement
GOOGLE_MAPS_API_KEY=...              # Google Places Nearby Search (server-side)
OPENROUTER_MODEL=...                 # Default: openai/gpt-oss-120b:free
NEXT_PUBLIC_APP_URL=...              # App URL for OpenRouter HTTP-Referer header
```

## Deployment
```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run build
npx vercel --prod --yes
# Then manually alias (vercel --prod doesn't always update the custom alias):
npx vercel alias set <new-deployment-url> road-trip-planner-blush.vercel.app
```

Node v22.13.1 is required. System node is v12 — always use `~/.nvm/versions/node/v22.13.1/bin/` prefix.

## City Geocoding
`lib/route-utils.ts` has three tiers:
1. Hardcoded table of ~80 US cities (instant, no network)
2. In-memory cache from previous Nominatim calls
3. Nominatim geocoding fallback (3s timeout)

When adding a new city the AI keeps failing on, add it to `US_MAJOR_CITIES` in `route-utils.ts`.

"Pictured Rocks" → mapped to Munising, MI (hardcoded, because Nominatim finds a Nevada location first).

## Common Issues & Fixes
- **Map not rendering**: Leaflet CSS was not in main bundle (dynamic import chunks don't include CSS). Fixed by moving CSS imports to `globals.css`. Google Maps doesn't have this issue.
- **Vercel timeout**: Hobby plan = 10s serverless limit. `/api/chat` uses `export const runtime = 'edge'` for 30s limit.
- **Wrong city geocoded**: Nominatim finds unexpected location (e.g. "Pictured Rocks" → Nevada). Fix: add correct coords to `US_MAJOR_CITIES` hardcoded table.
- **Alias not updated after deploy**: `vercel --prod` doesn't always update `road-trip-planner-blush.vercel.app`. Always run `vercel alias set <url> road-trip-planner-blush.vercel.app` manually.

## File Structure
```
app/
  page.tsx              — main page, all state management
  layout.tsx            — root layout
  globals.css           — global CSS (includes Leaflet CSS if still using Leaflet)
  api/
    chat/route.ts       — AI streaming endpoint (Edge runtime)
    places/route.ts     — Google Places proxy (Edge runtime)
components/
  GoogleMapView.tsx     — Google Maps implementation
  MapView.tsx           — dynamic import wrapper + error boundary
  ChatPanel.tsx         — chat UI with react-markdown
  StopBottomSheet.tsx   — hotel/attraction details for selected stop
  FloatingRouteSummary.tsx — top pill showing route + distance
  ItineraryPanel.tsx    — confirmed bookings panel
  BookingReviewModal.tsx — hotel booking confirmation modal
  MapSuggestions.tsx    — quick-start suggestion chips
  shared/Spinner.tsx    — loading spinner
hooks/
  useProactivePlaces.ts — auto-fetch POIs near route midpoint
lib/
  claude-tools.ts       — AI tool definitions + SYSTEM_PROMPT
  route-utils.ts        — city geocoding (hardcoded table + Nominatim)
  osrm-client.ts        — OSRM routing client (free, no API key)
  foursquare-client.ts  — Foursquare Places API client
  amadeus-client.ts     — Amadeus hotel search client
types/
  index.ts              — RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry, ConfirmedReservation
```
