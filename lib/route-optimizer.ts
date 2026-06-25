// Route optimization — Phase 2: NSGA-II multi-objective optimizer
// Objectives: maximize attraction score, minimize drive time, minimize cost
// Falls back to nearest-neighbor + 2-opt when candidate pool is too small.

interface Waypoint {
  lat: number
  lng: number
}

export interface StopWithId extends Waypoint {
  id: string  // unique identifier for time matrix lookup (use city name)
}

// ─── Pareto / NSGA-II types ────────────────────────────────────────────────

export interface ParetoRoute {
  label: 'fast' | 'balanced' | 'complete'
  intermediates: StopWithId[]   // ordered intermediate stops in this route variant
  driveMinutes: number
  attractionScore: number       // sum of attraction counts at included stops
  estimatedCostUsd: number      // gas + hotels
}

export interface NSGAIIConfig {
  candidatePool: StopWithId[]           // all optional intermediate stops
  origin: StopWithId
  destination: StopWithId
  timeMatrix: Map<string, number> | null
  attractionCounts: Map<string, number> // city id → number of attractions
  hotelPriceByCity: Map<string, number> // city id → avg nightly rate (fallback $120)
  stayNightsByCity: Map<string, number> // city id → number of nights
  /** Phase 4: weighted sampling for Insert/Point mutations. city id → 0.1–1.0 */
  stopWeights?: Map<string, number>
  populationSize?: number               // default 120
  generations?: number                  // default 200
}

// ─── Distance helpers ──────────────────────────────────────────────────────

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
  if (order.length === 0) {
    if (start && end) return driveTime(start, end, matrix)
    return 0
  }
  let total = 0
  if (start) total += driveTime(start, order[0], matrix)
  for (let i = 0; i < order.length - 1; i++) {
    total += driveTime(order[i], order[i + 1], matrix)
  }
  if (end) total += driveTime(order[order.length - 1], end, matrix)
  return total
}

// ─── Nearest-neighbor + 2-opt (Phase 1, kept for fallback) ────────────────

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

// ─── NSGA-II implementation ────────────────────────────────────────────────

// Individual: ordered list of stop IDs (subset of candidatePool)
type Individual = string[]

// Fitness tuple: [attractionScore, driveMinutes, costUsd]
// attractionScore is MAXIMIZED (higher is better)
// driveMinutes and costUsd are MINIMIZED (lower is better)
type Fitness = [number, number, number]

interface RankedIndividual {
  individual: Individual
  fitness: Fitness
  rank: number
  crowdingDistance: number
}

function computeFitness(
  individual: Individual,
  config: NSGAIIConfig,
  idToStop: Map<string, StopWithId>
): Fitness {
  const stops = individual.map(id => idToStop.get(id)).filter((s): s is StopWithId => s !== undefined)

  const attractionScore = individual.reduce((sum, id) => sum + (config.attractionCounts.get(id) ?? 0), 0)

  const driveMinutes = tourTime(stops, config.timeMatrix, config.origin, config.destination)

  // Gas cost: (minutes / 60 hours) × (55 miles/hr) / 30 mpg × $3.50/gal
  const gasCost = (driveMinutes / 60) * 55 / 30 * 3.50
  // Hotel cost: sum of nights × price per city
  const hotelCost = individual.reduce((sum, id) => {
    const nights = config.stayNightsByCity.get(id) ?? 1
    const price = config.hotelPriceByCity.get(id) ?? 120
    return sum + nights * price
  }, 0)
  const costUsd = gasCost + hotelCost

  return [attractionScore, driveMinutes, costUsd]
}

// A dominates B if:
//   - attractionScore(A) >= attractionScore(B)  AND
//   - driveMinutes(A) <= driveMinutes(B)         AND
//   - costUsd(A) <= costUsd(B)
//   - at least one is strictly better
function dominates(a: Fitness, b: Fitness): boolean {
  const [aAttr, aDrive, aCost] = a
  const [bAttr, bDrive, bCost] = b
  // A is no worse in all objectives
  const noWorse = aAttr >= bAttr && aDrive <= bDrive && aCost <= bCost
  // A is strictly better in at least one
  const strictlyBetter = aAttr > bAttr || aDrive < bDrive || aCost < bCost
  return noWorse && strictlyBetter
}

// Fast non-dominated sort — O(M × N²)
function fastNonDominatedSort(population: RankedIndividual[]): void {
  const n = population.length
  const dominationCount = new Array<number>(n).fill(0)
  const dominated: number[][] = Array.from({ length: n }, () => [])
  const fronts: number[][] = [[]]

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (dominates(population[i].fitness, population[j].fitness)) {
        dominated[i].push(j)
      } else if (dominates(population[j].fitness, population[i].fitness)) {
        dominationCount[i]++
      }
    }
    if (dominationCount[i] === 0) {
      population[i].rank = 0
      fronts[0].push(i)
    }
  }

  let frontIdx = 0
  while (fronts[frontIdx].length > 0) {
    const nextFront: number[] = []
    for (const i of fronts[frontIdx]) {
      for (const j of dominated[i]) {
        dominationCount[j]--
        if (dominationCount[j] === 0) {
          population[j].rank = frontIdx + 1
          nextFront.push(j)
        }
      }
    }
    frontIdx++
    fronts.push(nextFront)
  }
}

// Crowding distance assignment within a front
function assignCrowdingDistance(front: RankedIndividual[]): void {
  const m = front.length
  if (m === 0) return
  if (m <= 2) {
    front.forEach(ind => { ind.crowdingDistance = Infinity })
    return
  }

  // Reset distances
  front.forEach(ind => { ind.crowdingDistance = 0 })

  // For each objective: sort, set boundary = Infinity, assign normalized range
  const objectives: Array<(f: Fitness) => number> = [
    f => f[0],  // attractionScore (maximize)
    f => f[1],  // driveMinutes (minimize)
    f => f[2],  // costUsd (minimize)
  ]

  for (const objFn of objectives) {
    const sorted = [...front].sort((a, b) => objFn(a.fitness) - objFn(b.fitness))
    sorted[0].crowdingDistance = Infinity
    sorted[m - 1].crowdingDistance = Infinity

    const minVal = objFn(sorted[0].fitness)
    const maxVal = objFn(sorted[m - 1].fitness)
    const range = maxVal - minVal

    if (range === 0) continue

    for (let i = 1; i < m - 1; i++) {
      sorted[i].crowdingDistance += (objFn(sorted[i + 1].fitness) - objFn(sorted[i - 1].fitness)) / range
    }
  }
}

// Tournament selection: compare by (rank ASC, crowdingDistance DESC)
function tournamentSelect(population: RankedIndividual[]): RankedIndividual {
  const i = Math.floor(Math.random() * population.length)
  const j = Math.floor(Math.random() * population.length)
  const a = population[i]
  const b = population[j]
  if (a.rank < b.rank) return a
  if (b.rank < a.rank) return b
  return a.crowdingDistance >= b.crowdingDistance ? a : b
}

// Weighted random pick from a list of ids using Phase-4 stop weights.
// Falls back to uniform random when no weights are provided.
function weightedPick(candidates: string[], weights: Map<string, number> | undefined): string {
  if (!weights || candidates.length === 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  const ws = candidates.map(id => weights.get(id) ?? 0.5)
  const total = ws.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= ws[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// Mutation operators
function mutate(
  individual: Individual,
  pool: string[],
  weights: Map<string, number> | undefined
): Individual {
  const op = Math.floor(Math.random() * 4)
  const ind = [...individual]

  if (op === 0) {
    // Insert: pick a stop from pool NOT in individual, insert at random position
    const outside = pool.filter(id => !ind.includes(id))
    if (outside.length === 0) return ind
    const toInsert = weightedPick(outside, weights)
    const pos = Math.floor(Math.random() * (ind.length + 1))
    ind.splice(pos, 0, toInsert)
    return ind
  }

  if (op === 1) {
    // Delete: remove a random stop (skip if would become empty)
    if (ind.length === 0) return ind
    const pos = Math.floor(Math.random() * ind.length)
    ind.splice(pos, 1)
    return ind
  }

  if (op === 2) {
    // Point: replace a random stop with one NOT already in individual
    if (ind.length === 0) return ind
    const outside = pool.filter(id => !ind.includes(id))
    if (outside.length === 0) return ind
    const replacement = weightedPick(outside, weights)
    const pos = Math.floor(Math.random() * ind.length)
    ind[pos] = replacement
    return ind
  }

  // op === 3: Swap two stops at random positions
  if (ind.length < 2) return ind
  const i = Math.floor(Math.random() * ind.length)
  let j = Math.floor(Math.random() * ind.length)
  while (j === i) j = Math.floor(Math.random() * ind.length)
  ;[ind[i], ind[j]] = [ind[j], ind[i]]
  return ind
}

// Initialize one individual: random-length subset of pool, randomly ordered
function randomIndividual(pool: string[]): Individual {
  const length = 1 + Math.floor(Math.random() * pool.length)
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, length)
}

/**
 * Run NSGA-II multi-objective optimization.
 * Returns 3 representative Pareto routes: fast, balanced, complete.
 * Falls back to nearest-neighbor + 2-opt for small candidate pools.
 */
export function runNSGAII(config: NSGAIIConfig): ParetoRoute[] {
  const {
    candidatePool,
    origin,
    destination,
    timeMatrix,
    populationSize = 120,
    generations = 200,
  } = config

  // Build a fast lookup from id → StopWithId
  const idToStop = new Map<string, StopWithId>()
  idToStop.set(origin.id, origin)
  idToStop.set(destination.id, destination)
  for (const s of candidatePool) idToStop.set(s.id, s)

  const poolIds = candidatePool.map(s => s.id)

  // Fallback: too few candidates for meaningful NSGA-II
  if (candidatePool.length < 2) {
    const stops = candidatePool.filter(s => s.lat && s.lng)
    const optimized = twoOptImprove(
      nearestNeighborOrder(stops, timeMatrix, origin),
      timeMatrix,
      origin,
      destination
    )
    const fitness = computeFitness(optimized.map(s => s.id), config, idToStop)
    return [{
      label: 'balanced',
      intermediates: optimized,
      attractionScore: fitness[0],
      driveMinutes: fitness[1],
      estimatedCostUsd: fitness[2],
    }]
  }

  // ── Initialize population ──
  let population: RankedIndividual[] = Array.from({ length: populationSize }, () => {
    const individual = randomIndividual(poolIds)
    return {
      individual,
      fitness: computeFitness(individual, config, idToStop),
      rank: 0,
      crowdingDistance: 0,
    }
  })

  // ── Main NSGA-II loop ──
  for (let gen = 0; gen < generations; gen++) {
    // Non-dominated sort and crowding distance on current population
    fastNonDominatedSort(population)
    // Group by rank to assign crowding distance per front
    const frontMap = new Map<number, RankedIndividual[]>()
    for (const ind of population) {
      const f = frontMap.get(ind.rank) ?? []
      f.push(ind)
      frontMap.set(ind.rank, f)
    }
    for (const front of frontMap.values()) {
      assignCrowdingDistance(front)
    }

    // Generate offspring via tournament selection + mutation
    const offspring: RankedIndividual[] = Array.from({ length: populationSize }, () => {
      const parent = tournamentSelect(population)
      const childInd = mutate(parent.individual, poolIds, config.stopWeights)
      return {
        individual: childInd,
        fitness: computeFitness(childInd, config, idToStop),
        rank: 0,
        crowdingDistance: 0,
      }
    })

    // Combined population
    const combined = [...population, ...offspring]

    // Sort combined
    fastNonDominatedSort(combined)
    const combinedFrontMap = new Map<number, RankedIndividual[]>()
    for (const ind of combined) {
      const f = combinedFrontMap.get(ind.rank) ?? []
      f.push(ind)
      combinedFrontMap.set(ind.rank, f)
    }
    for (const front of combinedFrontMap.values()) {
      assignCrowdingDistance(front)
    }

    // Select new population: fill by front rank, break ties by crowding distance
    const newPop: RankedIndividual[] = []
    const maxRank = Math.max(...combined.map(i => i.rank))
    for (let r = 0; r <= maxRank && newPop.length < populationSize; r++) {
      const front = combinedFrontMap.get(r) ?? []
      if (newPop.length + front.length <= populationSize) {
        newPop.push(...front)
      } else {
        // Sort by crowding distance descending, take as many as we need
        const sorted = [...front].sort((a, b) => b.crowdingDistance - a.crowdingDistance)
        newPop.push(...sorted.slice(0, populationSize - newPop.length))
      }
    }

    population = newPop
  }

  // ── Extract Pareto front (rank 0) ──
  fastNonDominatedSort(population)
  const paretoFront = population.filter(ind => ind.rank === 0)

  if (paretoFront.length === 0) {
    // Shouldn't happen, but use entire population as fallback
    paretoFront.push(...population)
  }

  // ── Pick 3 representative routes ──

  // complete: highest attractionScore
  const complete = [...paretoFront].sort((a, b) => b.fitness[0] - a.fitness[0])[0]

  // fast: lowest driveMinutes
  const fast = [...paretoFront].sort((a, b) => a.fitness[1] - b.fitness[1])[0]

  // balanced: "knee" point — max perpendicular distance from line between fast and complete
  // in normalized (driveMinutes, attractionScore) space
  const minDrive = fast.fitness[1]
  const maxDrive = complete.fitness[1]
  const minAttr = fast.fitness[0]
  const maxAttr = complete.fitness[0]
  const drivRange = maxDrive - minDrive || 1
  const attrRange = maxAttr - minAttr || 1

  // Normalized coordinates of fast (0,0) and complete (1,1) in (drive, attr) space
  // Perpendicular distance from point (nx, ny) to line from (0,0) to (1,1):
  // d = |ny - nx| / sqrt(2)
  let balanced = complete  // fallback if all on the same point
  let maxPerp = -Infinity
  for (const ind of paretoFront) {
    const nx = (ind.fitness[1] - minDrive) / drivRange   // normalized drive
    const ny = (ind.fitness[0] - minAttr) / attrRange    // normalized attr
    const perp = Math.abs(ny - nx) / Math.SQRT2
    if (perp > maxPerp) {
      maxPerp = perp
      balanced = ind
    }
  }

  const toStops = (ind: RankedIndividual): StopWithId[] =>
    ind.individual.map(id => idToStop.get(id)).filter((s): s is StopWithId => s !== undefined)

  return [
    {
      label: 'fast',
      intermediates: toStops(fast),
      driveMinutes: fast.fitness[1],
      attractionScore: fast.fitness[0],
      estimatedCostUsd: fast.fitness[2],
    },
    {
      label: 'balanced',
      intermediates: toStops(balanced),
      driveMinutes: balanced.fitness[1],
      attractionScore: balanced.fitness[0],
      estimatedCostUsd: balanced.fitness[2],
    },
    {
      label: 'complete',
      intermediates: toStops(complete),
      driveMinutes: complete.fitness[1],
      attractionScore: complete.fitness[0],
      estimatedCostUsd: complete.fitness[2],
    },
  ]
}

/**
 * Reorders `places` to minimize total drive time.
 * Kept for backward compatibility — use runNSGAII() for multi-objective optimization.
 *
 * @param places - intermediate stops to reorder (origin/destination are anchors)
 * @param anchors - fixed start and/or end points
 * @param timeMatrix - OSRM pairwise drive-time matrix (minutes). Falls back to
 *                     Haversine if null or missing pairs.
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
