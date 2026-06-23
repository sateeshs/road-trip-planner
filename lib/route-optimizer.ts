// Route optimization — ported from TREK's RouteCalculator.ts
// Algorithm: nearest-neighbor greedy pass → 2-opt improvement
// Both phases are O(n²) which is fine for ≤ ~15 road trip stops.
// Runs entirely client-side, no API calls, no API key needed.

interface Waypoint {
  lat: number
  lng: number
}

// Squared planar distance — sufficient for relative comparisons (cheaper than haversine)
function sqDist(a: Waypoint, b: Waypoint): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2
}

// Total tour length visiting `order` in sequence, pinned to optional fixed anchors
function tourLength(order: Waypoint[], start?: Waypoint, end?: Waypoint): number {
  if (order.length === 0) return 0
  let total = 0
  if (start) total += Math.sqrt(sqDist(start, order[0]))
  for (let i = 0; i < order.length - 1; i++) total += Math.sqrt(sqDist(order[i], order[i + 1]))
  if (end) total += Math.sqrt(sqDist(order[order.length - 1], end))
  return total
}

// Greedy nearest-neighbor ordering, seeded from the start anchor when provided
function nearestNeighborOrder<T extends Waypoint>(valid: T[], start?: Waypoint): T[] {
  const visited = new Set<number>()
  const result: T[] = []
  let current: Waypoint
  if (start) {
    current = start
  } else {
    current = valid[0]
    visited.add(0)
    result.push(valid[0])
  }
  while (result.length < valid.length) {
    let nearestIdx = -1
    let minDist = Infinity
    for (let i = 0; i < valid.length; i++) {
      if (visited.has(i)) continue
      const d = sqDist(valid[i], current)
      if (d < minDist) { minDist = d; nearestIdx = i }
    }
    if (nearestIdx === -1) break
    visited.add(nearestIdx)
    current = valid[nearestIdx]
    result.push(valid[nearestIdx])
  }
  return result
}

// 2-opt: repeatedly reverse sub-segments to remove path crossings left by nearest-neighbor
function twoOptImprove<T extends Waypoint>(order: T[], start?: Waypoint, end?: Waypoint): T[] {
  if (order.length < 3) return order
  let best = order
  let bestLen = tourLength(best, start, end)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        const len = tourLength(candidate, start, end)
        if (len < bestLen - 1e-12) {
          best = candidate
          bestLen = len
          improved = true
        }
      }
    }
  }
  return best
}

/**
 * Reorders `places` to minimize total travel distance.
 *
 * For a road trip: pass origin as `start` and destination as `end` to keep
 * them fixed — only the intermediate stops are reordered.
 *
 * Ported from TREK RouteCalculator.ts `optimizeRoute()`.
 */
export function optimizeRoute<T extends Waypoint>(
  places: T[],
  anchors: { start?: Waypoint; end?: Waypoint } = {}
): T[] {
  const { start, end } = anchors
  const valid = places.filter(p => p.lat && p.lng)
  if (valid.length <= 1) return places
  if (valid.length === 2 && !start && !end) return places

  const order = twoOptImprove(nearestNeighborOrder(valid, start), start, end)

  // For a round trip (start === end), orient the loop to begin at the stop
  // nearest the anchor — reads as "leave origin, hit closest stop first, …"
  if (start && end && start.lat === end.lat && start.lng === end.lng && order.length > 1) {
    if (sqDist(order[order.length - 1], start) < sqDist(order[0], start)) order.reverse()
  }

  return order
}
