/**
 * Phase 4 — Stop Quality Scoring
 *
 * Scores candidate intermediate stops on 4 weighted factors:
 *   35% — Attraction density (POI count from existing Foursquare/OSM data)
 *   25% — Hotel quality    (availability + price tier)
 *   25% — Drive-time balance (stop's position relative to route midpoint)
 *   15% — Corridor alignment (how far off the route line the stop sits)
 *
 * Scores drive weighted sampling in NSGA-II Insert/Point mutations —
 * high-scoring stops are more likely to be chosen.
 */

export interface StopScoreInput {
  id: string     // city name (used as key throughout)
  lat: number
  lng: number
  attractionCount: number
  hotelCount: number
  avgHotelPrice: number   // 0 if no hotels
}

export type StopQualityLabel = 'excellent' | 'good' | 'fair' | 'poor'

export interface StopScore {
  id: string
  totalScore: number   // 0–100
  label: StopQualityLabel
  breakdown: {
    attractionDensity: number   // 0–100
    hotelQuality: number        // 0–100
    driveTimeBalance: number    // 0–100
    corridorAlignment: number   // 0–100
  }
}

export interface ScorerConfig {
  stops: StopScoreInput[]
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  /** OSRM route geometry as [lat, lng][] — used for corridor alignment */
  routeGeometry?: [number, number][]
}

// ─── Factor: Attraction density ───────────────────────────────────────────────

function scoreAttractionDensity(count: number): number {
  if (count === 0) return 5
  if (count <= 2)  return 30
  if (count <= 4)  return 55
  if (count <= 7)  return 72
  if (count <= 10) return 85
  return Math.min(100, 85 + (count - 10) * 1.5)
}

// ─── Factor: Hotel quality ────────────────────────────────────────────────────

function scoreHotelQuality(hotelCount: number, avgPrice: number): number {
  // Availability sub-score
  let availScore = 0
  if (hotelCount === 0)      availScore = 10
  else if (hotelCount <= 2)  availScore = 50
  else if (hotelCount <= 5)  availScore = 75
  else                       availScore = 90

  // Price-tier sub-score: midrange ($80–$180) is ideal
  let priceScore = 70  // default / unknown
  if (avgPrice > 0) {
    if (avgPrice < 50)                     priceScore = 45  // very cheap → limited options
    else if (avgPrice < 80)                priceScore = 65
    else if (avgPrice <= 180)              priceScore = 100  // sweet spot
    else if (avgPrice <= 250)              priceScore = 80
    else                                   priceScore = 55  // expensive
  }

  return Math.round(availScore * 0.65 + priceScore * 0.35)
}

// ─── Factor: Drive-time balance ───────────────────────────────────────────────
// Measures how close a stop is to the midpoint of the route (origin → destination).
// A stop at exactly 50% scores 100; deviations are penalized linearly.

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function scoreDriveTimeBalance(
  stop: { lat: number; lng: number },
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number {
  const totalDist = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng)
  if (totalDist < 1) return 80  // very short route — position doesn't matter much
  const distFromOrigin = haversineKm(origin.lat, origin.lng, stop.lat, stop.lng)
  const fraction = distFromOrigin / totalDist  // 0 = at origin, 1 = at destination

  // Ideal fraction = 0.5 (midpoint); penalize as we deviate
  const deviation = Math.abs(fraction - 0.5)  // 0 = perfect, 0.5 = at an anchor
  // Linear penalty: 0 deviation → 100, 0.4 deviation → 20, >0.45 → very low
  const score = Math.max(10, 100 - deviation * 180)
  return Math.round(score)
}

// ─── Factor: Corridor alignment ───────────────────────────────────────────────
// Measures minimum perpendicular distance from stop to the OSRM route polyline.
// Expressed as a fraction of total route length, then converted to a score.

function pointToSegmentDistKm(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return haversineKm(py, px, ay, ax)  // segment is a point
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return haversineKm(py, px, ay + t * dy, ax + t * dx)
}

function scoreCorridorAlignment(
  stop: { lat: number; lng: number },
  routeGeometry: [number, number][],   // [lat, lng][]
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number {
  if (routeGeometry.length < 2) {
    // No geometry available — assume stop is roughly on corridor
    return 75
  }

  // Total route length (approximate)
  let totalKm = 0
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    totalKm += haversineKm(routeGeometry[i][0], routeGeometry[i][1], routeGeometry[i + 1][0], routeGeometry[i + 1][1])
  }
  if (totalKm < 1) return 80

  // Minimum distance from stop to any segment
  let minDistKm = Infinity
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const d = pointToSegmentDistKm(
      stop.lng, stop.lat,
      routeGeometry[i][1], routeGeometry[i][0],
      routeGeometry[i + 1][1], routeGeometry[i + 1][0]
    )
    if (d < minDistKm) minDistKm = d
  }

  // As fraction of total route
  const fraction = minDistKm / totalKm

  // Scoring: <1% → 100, 1–3% → 90–80, 3–8% → 70–50, 8–15% → 40–20, >15% → 10
  if (fraction < 0.01) return 100
  if (fraction < 0.03) return Math.round(100 - ((fraction - 0.01) / 0.02) * 20)   // 100→80
  if (fraction < 0.08) return Math.round(80  - ((fraction - 0.03) / 0.05) * 30)   // 80→50
  if (fraction < 0.15) return Math.round(50  - ((fraction - 0.08) / 0.07) * 30)   // 50→20
  return 10

  // Suppress unused-var warnings for anchor params (used for future extensions)
  void origin; void destination
}

// ─── Label assignment ─────────────────────────────────────────────────────────

function qualityLabel(score: number): StopQualityLabel {
  if (score >= 75) return 'excellent'
  if (score >= 55) return 'good'
  if (score >= 35) return 'fair'
  return 'poor'
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const WEIGHTS = {
  attractionDensity: 0.35,
  hotelQuality:      0.25,
  driveTimeBalance:  0.25,
  corridorAlignment: 0.15,
}

export function scoreStops(config: ScorerConfig): StopScore[] {
  const { stops, origin, destination, routeGeometry } = config

  return stops.map(stop => {
    const attractionDensity = scoreAttractionDensity(stop.attractionCount)
    const hotelQuality      = scoreHotelQuality(stop.hotelCount, stop.avgHotelPrice)
    const driveTimeBalance  = scoreDriveTimeBalance(stop, origin, destination)
    const corridorAlignment = routeGeometry && routeGeometry.length >= 2
      ? scoreCorridorAlignment(stop, routeGeometry, origin, destination)
      : 75  // no geometry — neutral score

    const totalScore = Math.round(
      attractionDensity * WEIGHTS.attractionDensity +
      hotelQuality      * WEIGHTS.hotelQuality      +
      driveTimeBalance  * WEIGHTS.driveTimeBalance   +
      corridorAlignment * WEIGHTS.corridorAlignment
    )

    return {
      id: stop.id,
      totalScore,
      label: qualityLabel(totalScore),
      breakdown: { attractionDensity, hotelQuality, driveTimeBalance, corridorAlignment },
    }
  })
}

/**
 * Build a weight Map<cityId, weight> for use in NSGA-II's weighted mutation sampling.
 * Normalizes scores to a 0.1–1.0 range so even low-scoring stops have some chance.
 */
export function buildStopWeights(scores: StopScore[]): Map<string, number> {
  const weights = new Map<string, number>()
  for (const s of scores) {
    // Map 0–100 score → 0.1–1.0 weight (minimum 0.1 ensures all stops are reachable)
    weights.set(s.id, 0.1 + (s.totalScore / 100) * 0.9)
  }
  return weights
}
