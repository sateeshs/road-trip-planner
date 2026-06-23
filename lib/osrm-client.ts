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

export interface OsrmSegment {
  distance: number   // meters
  duration: number   // seconds
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

/**
 * Fetch a multi-stop driving route via OSRM.
 * Returns real road geometry + per-segment distance/duration.
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

  const primaryUrl = `${OSRM_PRIMARY[profile] ?? OSRM_PRIMARY.driving}/${coords}?overview=full&geometries=geojson&annotations=distance,duration`
  const fallbackUrl = `${OSRM_FALLBACK}/${coords}?overview=full&geometries=geojson&annotations=distance,duration`

  let data: unknown
  try {
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(7_000) })
    if (!res.ok) throw new Error(`OSRM primary ${res.status}`)
    data = await res.json()
  } catch {
    // Primary timed out or failed — fall back to OSRM demo server
    const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(7_000) })
    if (!res.ok) throw new Error(`OSRM fallback ${res.status}`)
    data = await res.json()
  }

  const d = data as {
    code: string
    routes?: Array<{
      geometry: { coordinates: [number, number][] }
      distance: number
      duration: number
      legs: Array<{ distance: number; duration: number }>
    }>
  }
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error('No route found from OSRM')

  const route = d.routes[0]

  // Flip [lng, lat] → [lat, lng] for Leaflet (ported from TREK's coordinate mapping)
  const geometry: [number, number][] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng]
  )

  const segments: OsrmSegment[] = (route.legs ?? []).map(
    (leg: { distance: number; duration: number }) => ({
      distance: leg.distance,
      duration: leg.duration,
    })
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
