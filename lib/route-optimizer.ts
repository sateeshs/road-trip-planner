// Route optimization — Phase 1 upgrade
// Distance metric: OSRM actual drive times (minutes) when available, Haversine fallback
// Algorithm: nearest-neighbor greedy pass → 2-opt improvement
// Phase 2 will replace this with NSGA-II — this is the foundation.

interface Waypoint {
  lat: number
  lng: number
}

export interface StopWithId extends Waypoint {
  id: string  // unique identifier for time matrix lookup (use city name)
}

// Squared planar distance — fallback when no time matrix available
function sqDist(a: Waypoint, b: Waypoint): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2
}

// Drive time in minutes between two stops — uses matrix when available, Haversine fallback
function driveTime(
  a: StopWithId,
  b: StopWithId,
  matrix: Map<string, number> | null
): number {
  if (matrix) {
    const key = [a.id, b.id].sort().join('|')
    const t = matrix.get(key)
    if (t !== undefined) return t
  }
  // Haversine fallback (approximate minutes: 1 degree ≈ 69 miles ÷ 60 mph)
  return Math.sqrt(sqDist(a, b)) * 69
}

// Total tour time visiting `order` in sequence
function tourTime(
  order: StopWithId[],
  matrix: Map<string, number> | null,
  start?: StopWithId,
  end?: StopWithId
): number {
  if (order.length === 0) return 0
  let total = 0
  if (start) total += driveTime(start, order[0], matrix)
  for (let i = 0; i < order.length - 1; i++) {
    total += driveTime(order[i], order[i + 1], matrix)
  }
  if (end) total += driveTime(order[order.length - 1], end, matrix)
  return total
}

// Greedy nearest-neighbor ordering using drive times
function nearestNeighborOrder<T extends StopWithId>(
  valid: T[],
  matrix: Map<string, number> | null,
  start?: StopWithId
): T[] {
  const visited = new Set<number>()
  const result: T[] = []
  let current: StopWithId

  if (start) {
    current = start
  } else {
    current = valid[0]
    visited.add(0)
    result.push(valid[0])
  }

  while (result.length < valid.length) {
    let nearestIdx = -1
    let minTime = Infinity
    for (let i = 0; i < valid.length; i++) {
      if (visited.has(i)) continue
      const t = driveTime(current, valid[i], matrix)
      if (t < minTime) { minTime = t; nearestIdx = i }
    }
    if (nearestIdx === -1) break
    visited.add(nearestIdx)
    current = valid[nearestIdx]
    result.push(valid[nearestIdx])
  }
  return result
}

// 2-opt: repeatedly reverse sub-segments to remove crossings
function twoOptImprove<T extends StopWithId>(
  order: T[],
  matrix: Map<string, number> | null,
  start?: StopWithId,
  end?: StopWithId
): T[] {
  if (order.length < 3) return order
  let best = order
  let bestTime = tourTime(best, matrix, start, end)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        const t = tourTime(candidate, matrix, start, end)
        if (t < bestTime - 1e-9) {
          best = candidate
          bestTime = t
          improved = true
        }
      }
    }
  }
  return best
}

/**
 * Reorders `places` to minimize total drive time.
 *
 * @param places - intermediate stops to reorder (origin/destination are anchors)
 * @param anchors - fixed start and/or end points
 * @param timeMatrix - OSRM pairwise drive-time matrix (minutes). Falls back to
 *                     Haversine if null or missing pairs.
 *
 * Phase 1: nearest-neighbor + 2-opt with real drive times.
 * Phase 2 will replace with NSGA-II for multi-objective Pareto optimization.
 */
export function optimizeRoute<T extends StopWithId>(
  places: T[],
  anchors: { start?: StopWithId; end?: StopWithId } = {},
  timeMatrix: Map<string, number> | null = null
): T[] {
  const { start, end } = anchors
  const valid = places.filter(p => p.lat && p.lng)
  if (valid.length <= 1) return places

  const order = twoOptImprove(
    nearestNeighborOrder(valid, timeMatrix, start),
    timeMatrix,
    start,
    end
  )

  // Round trip: orient loop to begin at stop nearest the anchor
  if (start && end && start.lat === end.lat && start.lng === end.lng && order.length > 1) {
    const distFirst = driveTime(start, order[0], timeMatrix)
    const distLast = driveTime(start, order[order.length - 1], timeMatrix)
    if (distLast < distFirst) order.reverse()
  }

  return order
}
