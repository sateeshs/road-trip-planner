// OpenRouteService API client
// Sign up at https://openrouteservice.org/dev/#/signup — free tier: 2,000 req/day
// Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/geojson/post

const ORS_BASE = 'https://api.openrouteservice.org'
const APP_NAME = process.env.ORS_APP_NAME ?? 'road-trip-planner'
const APP_VERSION = '1.0'

export interface ORSSegment {
  distance: number  // meters
  duration: number  // seconds
}

export interface ORSRouteResult {
  /** Full road geometry as [lat, lng] pairs (already flipped from GeoJSON [lng, lat]) */
  geometry: [number, number][]
  /** Per-leg info — one entry per stop-to-stop segment */
  segments: ORSSegment[]
  /** Total trip distance in meters */
  totalDistance: number
  /** Total trip duration in seconds */
  totalDuration: number
}

/**
 * Get a driving route through multiple waypoints via OpenRouteService.
 * @param waypoints Array of {lat, lng} in stop order
 */
export async function getRoute(
  waypoints: Array<{ lat: number; lng: number }>
): Promise<ORSRouteResult> {
  if (waypoints.length < 2) throw new Error('At least 2 waypoints required')

  // ORS expects [longitude, latitude] order (GeoJSON convention)
  const coordinates = waypoints.map(w => [w.lng, w.lat])

  const res = await fetch(`${ORS_BASE}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    headers: {
      Authorization: process.env.OPENROUTESERVICE_API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
      // ORS logs requests by User-Agent — visible in your ORS dashboard under API usage
      'User-Agent': `${APP_NAME}/${APP_VERSION}`,
      // ORS-specific header for app attribution (shown in their developer portal logs)
      'X-Application-Name': APP_NAME,
    },
    body: JSON.stringify({ coordinates }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouteService error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) throw new Error('No route returned from OpenRouteService')

  const props = feature.properties
  const segments: ORSSegment[] = (props.segments || []).map((s: { distance: number; duration: number }) => ({
    distance: s.distance,
    duration: s.duration,
  }))

  // Flip [lng, lat] → [lat, lng] for Leaflet
  const geometry: [number, number][] = (feature.geometry.coordinates as [number, number][]).map(
    ([lng, lat]) => [lat, lng]
  )

  const summary = props.summary || {}
  return {
    geometry,
    segments,
    totalDistance: summary.distance || 0,
    totalDuration: summary.duration || 0,
  }
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
