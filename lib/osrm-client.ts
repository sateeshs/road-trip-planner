/**
 * OSRM routing client — ported from TREK's RouteCalculator.ts.
 * Uses the public OSRM demo servers (no API key required).
 *
 * Primary:  routing.openstreetmap.de (FOSSGIS) — real per-profile routing
 * Fallback: router.project-osrm.org  (OSRM demo, car-only)
 */

// FOSSGIS OSRM instances — one per profile, matching road/foot/cycle networks
const OSRM_PRIMARY: Record<string, string> = {
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
}
const OSRM_FALLBACK = 'https://router.project-osrm.org/route/v1/driving'

// ─── OSRM step type (from steps=true response) ──────────────────────────────

interface OsrmStep {
  name: string          // road name, e.g. "I-65 North"
  ref?: string          // road ref, e.g. "I 65;US 31" (semicolon-separated)
  distance: number      // meters on this step
  duration: number
  intersections: Array<{
    classes?: string[]  // e.g. ["toll", "motorway", "restricted"]
  }>
}

export interface OsrmSegment {
  distance: number      // meters
  duration: number      // seconds
  roadName?: string     // dominant highway/road name, e.g. "I-65 S · US-31 N"
  hasToll?: boolean     // true if any step on this leg passes through a toll
}

export interface OsrmRouteResult {
  /** Full road geometry as [lat, lng] pairs (already flipped from GeoJSON [lng, lat]) */
  geometry: [number, number][]
  /** Per-leg segment info — one entry per consecutive stop pair */
  segments: OsrmSegment[]
  /** Total trip distance in meters */
  totalDistance: number
  /** Total trip duration in seconds */
  totalDuration: number
}

// Module-level route cache keyed by waypoint signature — mirrors TREK's routeCache
const routeCache = new Map<string, OsrmRouteResult>()
const ROUTE_CACHE_MAX = 200

// ─── Road name extraction from OSRM steps ───────────────────────────────────

/**
 * Given a leg's steps, returns the top 1-2 dominant roads by distance covered
 * and whether the leg passes through any toll.
 * Prefers `ref` (e.g. "I 65") over `name` (e.g. "Interstate 65 North") for brevity.
 */
function extractLegRoadInfo(steps: OsrmStep[]): { roadName: string | null; hasToll: boolean } {
  const distByRoad = new Map<string, number>()
  let hasToll = false

  for (const step of steps) {
    // Toll detection via intersection classes (OSM-derived)
    if (step.intersections?.some(i => i.classes?.includes('toll'))) {
      hasToll = true
    }

    // Prefer ref (short form), fall back to name
    const rawRef = step.ref?.split(';')[0]?.trim()
    const label = rawRef || step.name?.trim()
    if (!label) continue

    distByRoad.set(label, (distByRoad.get(label) ?? 0) + step.distance)
  }

  if (distByRoad.size === 0) return { roadName: null, hasToll }

  // Sort by distance descending, keep top 2 major roads
  const sorted = [...distByRoad.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([road]) => formatRoadRef(road))
    .filter(Boolean)

  return { roadName: sorted.join(' · ') || null, hasToll }
}

/** Normalise road ref to display form: "I 65" → "I-65", "US 31" → "US-31" */
function formatRoadRef(ref: string): string {
  return ref
    .replace(/^I\s+(\d+)/i, 'I-$1')
    .replace(/^US\s+(\d+)/i, 'US-$1')
    .replace(/^SR\s+(\d+)/i, 'SR-$1')
    .replace(/^State Route\s+(\d+)/i, 'SR-$1')
    .replace(/^Highway\s+(\d+)/i, 'Hwy $1')
    .trim()
}

// ─── Main route fetch ────────────────────────────────────────────────────────

/**
 * Fetch a multi-stop driving route via OSRM.
 * Returns real road geometry + per-segment distance/duration/roadName/hasToll.
 * Tries the FOSSGIS primary server first, falls back to the OSRM demo.
 */
export async function getRoute(
  waypoints: Array<{ lat: number; lng: number }>,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<OsrmRouteResult> {
  if (waypoints.length < 2) throw new Error('At least 2 waypoints required')

  // OSRM expects [lng, lat] — ported from TREK's coord mapping
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
  const cacheKey = `${profile}:${coords}`
  const cached = routeCache.get(cacheKey)
  if (cached) return cached

  // steps=true → road names + toll class per intersection
  const params = 'overview=full&geometries=geojson&steps=true&annotations=distance,duration'
  const primaryUrl = `${OSRM_PRIMARY[profile] ?? OSRM_PRIMARY.driving}/${coords}?${params}`
  const fallbackUrl = `${OSRM_FALLBACK}/${coords}?${params}`

  let data: unknown
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`OSRM primary ${res.status}`)
    data = await res.json()
  } catch {
    // Primary timed out or failed — fall back to OSRM demo server
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
      legs: Array<{
        distance: number
        duration: number
        steps: OsrmStep[]
      }>
    }>
  }
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error('No route found from OSRM')

  const route = d.routes[0]

  // Flip [lng, lat] → [lat, lng] for Leaflet (ported from TREK's coordinate mapping)
  const geometry: [number, number][] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng]
  )

  const segments: OsrmSegment[] = (route.legs ?? []).map(
    (leg: { distance: number; duration: number; steps: OsrmStep[] }) => {
      const { roadName, hasToll } = extractLegRoadInfo(leg.steps ?? [])
      return {
        distance: leg.distance,
        duration: leg.duration,
        roadName: roadName ?? undefined,
        hasToll: hasToll || undefined,
      }
    }
  )

  const result: OsrmRouteResult = {
    geometry,
    segments,
    totalDistance: route.distance,
    totalDuration: route.duration,
  }

  routeCache.set(cacheKey, result)
  if (routeCache.size > ROUTE_CACHE_MAX) {
    const oldest = routeCache.keys().next().value
    if (oldest !== undefined) routeCache.delete(oldest)
  }

  return result
}

/** Format meters → "123 miles" */
export function metersToMiles(meters: number): string {
  return `${Math.round(meters / 1609.34)} miles`
}

/** Format seconds → "2h 35m" */
export function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

/**
 * Fetches a pairwise drive-time matrix (in minutes) for all combinations of waypoints
 * using OSRM's /table/v1/ endpoint — single HTTP call for N² pairs.
 *
 * Returns a Map keyed by sorted city pair: "[A|B]" → minutes
 * The key is symmetric: getTimeMatrix().get(key(A,B)) === getTimeMatrix().get(key(B,A))
 */
export function timeMatrixKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export async function getTimeMatrix(
  stops: Array<{ id: string; lat: number; lng: number }>
): Promise<Map<string, number>> {
  const matrix = new Map<string, number>()
  if (stops.length < 2) return matrix

  const coords = stops.map(s => `${s.lng},${s.lat}`).join(';')

  // Try primary OSRM Table endpoint, fall back to demo server
  const primaryUrl = `https://routing.openstreetmap.de/routed-car/table/v1/driving/${coords}?annotations=duration`
  const fallbackUrl = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`

  let durations: number[][] | null = null

  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(8_000) })
    if (res.ok) {
      const data = await res.json() as { code: string; durations?: number[][] }
      if (data.code === 'Ok' && data.durations) durations = data.durations
    }
  } catch { /* try fallback */ }

  if (!durations) {
    try {
      const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8_000) })
      if (res.ok) {
        const data = await res.json() as { code: string; durations?: number[][] }
        if (data.code === 'Ok' && data.durations) durations = data.durations
      }
    } catch { /* return empty matrix — caller falls back to Haversine */ }
  }

  if (!durations) return matrix

  // durations[i][j] = seconds from stop i to stop j
  // We store symmetric pairs: key(i,j) → average of both directions (in minutes)
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const seconds = (durations[i][j] + durations[j][i]) / 2
      const minutes = seconds / 60
      matrix.set(timeMatrixKey(stops[i].id, stops[j].id), minutes)
    }
  }

  return matrix
}
