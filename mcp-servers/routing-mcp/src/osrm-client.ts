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
