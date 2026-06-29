# Plan: Google Maps Platform Integration + Clustering + Auto-Route + Timeout Fix

## Context
The road trip planner currently uses Leaflet + CartoDB tiles. The map isn't rendering (CSS not bundled — fixed in last deploy). The user wants:
1. **Google Maps** tiles and Google Places API for rich POI data
2. **Proactive places** on map (gas stations, restaurants, attractions) without AI chat
3. **Cluster ALL markers** (currently only hotels cluster; attractions/surroundings don't)
4. **Routes auto-draw** when stops are set (currently only after AI chat fully completes)
5. **Fix API timeout** (Vercel Hobby = 10s serverless limit; chat route times out)

> **Status**: Deferred — app currently uses Leaflet (CartoDB tiles, no API key required). Google Maps integration would require a paid API key. All features except Google tiles have been implemented with Leaflet.

---

## Step 1 — Fix API Timeout (1 line, deploy first)

**File:** `app/api/chat/route.ts`

Add before `maxDuration`:
```typescript
export const runtime = 'edge'
```
Edge functions on Vercel Hobby plan have 30s timeout vs 10s for serverless. All dependencies (`fetch`, Vercel AI SDK `streamText`) are Edge-compatible.

---

## Step 2 — Install Packages

```bash
npm install @react-google-maps/api @googlemaps/markerclusterer
npm install -D @types/google.maps
```

Remove from `next.config.ts`:
- `transpilePackages` entries for `react-leaflet`, `@react-leaflet/core`, `react-leaflet-cluster` (no longer needed)

---

## Step 3 — Google Cloud Setup (required before coding)

The user must:
1. Enable in Google Cloud Console: **Maps JavaScript API**, **Places API**, **Directions API**
2. Create a **Map ID** (required for `AdvancedMarkerElement`) in Google Maps Platform → Map Management
3. Create API key with HTTP referrer restriction (e.g. `*.vercel.app/*`)

**Env vars to add** (`.env.local` + Vercel dashboard):
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<key>     # browser — map tiles, JS API
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<map-id>   # browser — required for AdvancedMarkerElement
GOOGLE_MAPS_API_KEY=<same-key>            # server — Places Nearby Search API calls
```

---

## Step 4 — Server-Side Places Proxy

**New file:** `app/api/places/route.ts`

```typescript
export const runtime = 'edge'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') ?? '80000'
  const type = searchParams.get('type') ?? 'tourist_attraction'
  const key = process.env.GOOGLE_MAPS_API_KEY

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}`
  const res = await fetch(url)
  const data = await res.json()

  const places = (data.results ?? []).slice(0, 15).map((p: any) => ({
    id: p.place_id,
    name: p.name,
    category: (p.types?.[0] ?? type).replace(/_/g, ' '),
    rating: p.rating,
    address: p.vicinity,
    coordinates: { lat: p.geometry.location.lat, lng: p.geometry.location.lng },
    photoUrl: p.photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${key}`
      : undefined,
  }))

  return Response.json({ places })
}
```

---

## Step 5 — Proactive Places Hook

**New file:** `hooks/useProactivePlaces.ts`

- Watches `stops` array; fires when ≥2 stops are set
- 800ms debounce (stops stream in rapidly during AI tool calls)
- Fetches gas stations + restaurants + tourist attractions near the route midpoint
- Uses `AbortController` to cancel in-flight requests when stops change
- Returns `{ gasStations, restaurants, attractions }` each typed as `Attraction[]`
- Renders proactive POIs in separate clusterer layers (visually distinct from AI-suggested ones)

```typescript
export interface ProactivePOIs {
  gasStations: Attraction[]
  restaurants: Attraction[]
  attractions: Attraction[]
}

export function useProactivePlaces(stops: RouteStop[]): ProactivePOIs
```

---

## Step 6 — New `GoogleMapView` Component

**New file:** `components/GoogleMapView.tsx`

Replaces `components/LeafletMap.tsx`. Accepts the **same props** as `LeafletMapProps` + optional `proactivePOIs?: ProactivePOIs`.

### Key implementation notes

**API loading** (stable library reference at module scope — prevents reload):
```typescript
const LIBRARIES: ('marker' | 'places')[] = ['marker', 'places']
// In component:
const { isLoaded } = useJsApiLoader({
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  libraries: LIBRARIES,
  mapIds: [process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!],
})
```

**Map instance ref:**
```typescript
const mapRef = useRef<google.maps.Map | null>(null)
const onMapLoad = useCallback((map: google.maps.Map) => {
  mapRef.current = map
  initClusterers(map)
}, [])
```

**Clusterers** (one per type, initialized in `onMapLoad`):
- `hotels` — green, "H"
- `attractions` — amber, "★"  
- `surroundings` — teal, "🌿"
- `gasStations` — gray, "⛽"
- `restaurants` — orange, "🍽️"

**Critical gotcha:** Pass markers to clusterers **without** a `map` property — the clusterer manages map assignment. Setting `marker.map` before adding to clusterer causes duplicates.

**Stop markers** — NOT clustered (always visible). Use `AdvancedMarkerElement` with HTML content matching current color scheme (green origin, red destination, blue intermediate).

**Route drawing** — triggered by `useEffect` on `[routeGeometry, stops]`:
- If `routeGeometry` present: draw two-layer polyline (casing `#0a5cc2` 9px + core `#0a84ff` 5px), animate opacity 0→1 over 400ms via `requestAnimationFrame`
- If no geometry but ≥2 stops: draw dashed fallback line using `icons` array with `strokeOpacity: 1` dashes
- **This auto-draws as soon as stops are set, not waiting for chat to finish**

**Bounds fitting:**
```typescript
map.fitBounds(bounds, { top: 60, bottom: 60, left: 340, right: 60 })
// left: 340 leaves room for the chat panel
```

**InfoWindow** for hotel/attraction hover tooltips — one shared `google.maps.InfoWindow` instance reused across all markers.

**Interactive route segments** — port `segmentGeometries()` logic verbatim from `LeafletMap.tsx` (pure JS, no Leaflet dependency). Attach click listener via `polyline.addListener('click', handler)`.

**Confirmed reservation markers** — `zIndex: 2000`, not clustered (always visible).

**Map options:**
```typescript
{
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  zoomControl: false,          // custom controls replace this
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',   // single-finger pan (mobile-friendly)
}
```

---

## Step 7 — Map Controls Component

**New file:** `components/GoogleMapControls.tsx`

Replace `MapControlsPill.tsx` (uses react-leaflet's `useMap()` hook, incompatible with Google Maps).

Props: `{ map: google.maps.Map | null }`. Render as absolute-positioned overlay inside `GoogleMapView`. Same visual style (frosted glass capsule pill).

---

## Step 8 — Update `MapView.tsx`

Three changes:
1. Dynamic import: `./LeafletMap` → `./GoogleMapView`  
2. Add `proactivePOIs?: ProactivePOIs` to `MapViewProps`
3. Pass through to the imported component

The `MapErrorBoundary` class stays.

---

## Step 9 — Update `app/page.tsx`

Two additions:
```typescript
// 1. Add hook call (after existing state declarations)
const proactivePois = useProactivePlaces(stops)

// 2. Add prop to MapView JSX
<MapView ... proactivePOIs={proactivePois} />
```

---

## Step 10 — Cleanup

After confirming Google Maps works:
- Delete `components/LeafletMap.tsx`
- Delete `components/MapControlsPill.tsx`
- Delete `components/MapLocationButton.tsx`
- Remove leaflet packages: `npm uninstall leaflet react-leaflet react-leaflet-cluster leaflet.markercluster @types/leaflet`
- Remove leaflet CSS imports from `app/globals.css`

---

## Files Changed

| File | Action |
|------|--------|
| `app/api/chat/route.ts` | Add `export const runtime = 'edge'` |
| `app/api/places/route.ts` | **New** — Google Places proxy |
| `hooks/useProactivePlaces.ts` | **New** — proactive POI hook |
| `components/GoogleMapView.tsx` | **New** — replaces LeafletMap.tsx |
| `components/GoogleMapControls.tsx` | **New** — replaces MapControlsPill.tsx |
| `components/MapView.tsx` | Update import + props |
| `app/page.tsx` | Add hook call + prop |
| `next.config.ts` | Remove leaflet transpilePackages |
| `app/globals.css` | Remove leaflet CSS imports (cleanup) |
| `components/LeafletMap.tsx` | **Delete** |
| `components/MapControlsPill.tsx` | **Delete** |
| `components/MapLocationButton.tsx` | **Delete** |

## Reuse from Existing Code

- `segmentGeometries()` logic — port verbatim from `LeafletMap.tsx` (pure JS)
- `createStopIcon()` visual design — port HTML/CSS into `createStopMarkerElement()` for DOM element creation
- `Attraction`, `Hotel`, `RouteStop`, `RouteGeometry`, `ConfirmedReservation` types — unchanged
- AI chat flow in `page.tsx` — unchanged
- All tool definitions in `lib/claude-tools.ts` — unchanged
- OSRM routing in `lib/osrm-client.ts` — unchanged (avoid Google Directions API billing)
- Foursquare client — unchanged (used by AI chat tools)

---

## Verification

1. **Timeout fix**: Chat with trip query. Response completes in <30s without `Vercel Runtime Timeout Error` in logs (`npx vercel logs`)
2. **Map renders**: Open app — Google Maps tiles visible with streets, POI labels
3. **Proactive places**: With 2+ stops set, map shows gas station markers (gray), restaurant markers (orange), attraction markers (amber) automatically
4. **Clustering**: Zoom out with many hotels shown → markers cluster into numbered circles. Same for attractions/surroundings
5. **Route auto-draws**: AI sets stops → dashed line appears immediately before OSRM geometry arrives → replaced with animated solid route when geometry arrives
6. **Google Maps look**: Map tiles match Google Maps style (not CartoDB)
