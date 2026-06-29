# Plan: Route Optimization Upgrade — Phases 1–8

## Goal
Replace nearest-neighbor + 2-opt + Haversine with a research-grade multi-objective system.
**All Phases 1–8 are complete and deployed to production.**

## Research Sources
| Source | Key Contribution |
|--------|----------------|
| Olson — Pure Michigan TSP | NSGA-II > 2-opt, actual road times, backtracking penalty |
| Olson — Budget Road Trip | Multi-objective Pareto, stop quality selection, budget + time constraints |
| Brixius — OR Paper | Integer programming for small stop counts |
| Olson — Pareto Notebook (GitHub) | NSGA-II: 4 mutation ops, variable-length individuals, pairwise matrix |
| FlowingData | Corridor opportunistic stops: POIs within 5mi of route |

---

## Algorithm Design (as implemented)

### NSGA-II — 3-objective, variable-length individuals
- Runs **synchronously on main thread** (not a Web Worker — fast enough for ≤10 stops, ~50–100ms)
- Population: **120** individuals, **200** generations (9+ stops: 200 pop / 400 gen)
- Pairwise OSRM time matrix built once via `/table/v1/` before optimizer starts

### Fitness tuple
```
fitness = (
  attractionScore,       // MAXIMIZE — sum of attraction counts at included stops
  driveMinutes,          // MINIMIZE — OSRM actual road time
  estimatedCostUsd       // MINIMIZE — gas + hotel + activities ($25/saved activity)
)
```

### 4 Mutation Operators (Phase 4 weighted sampling)
| Operator | Action |
|----------|--------|
| Insert   | Add unvisited stop from pool (weighted by quality score) |
| Delete   | Remove a random stop |
| Point    | Replace a stop with another from pool (weighted) |
| Swap     | Exchange two positions in the individual |

---

## Implementation Status

### ✅ Phase 1 — OSRM Pairwise Time Matrix
**Files:** `lib/osrm-client.ts` (`getTimeMatrix()`, `timeMatrixKey()`), `lib/route-optimizer.ts`
- Single `/table/v1/` HTTP call returns all N² pairwise drive times
- Symmetric map: `[A,B].sort().join('|')` → minutes
- Haversine fallback when matrix missing/fails

### ✅ Phase 2+3 — NSGA-II + Pareto Route Options Card
**Files:** `lib/route-optimizer.ts` (full rewrite), `components/RouteOptionsCard.tsx` (new)
- `runNSGAII(config: NSGAIIConfig): ParetoRoute[]` — returns 3 representative routes
- Fast non-dominated sort + crowding distance selection
- **RouteOptionsCard**: glass-morphism overlay, Fast/Balanced/Complete cards
- **Knee point** (balanced): max perpendicular distance from fast→complete line in 2D objective space
- User selects variant → OSRM recalculates that stop order directly (bypasses AI)

### ✅ Phase 4 — Stop Quality Scorer
**File:** `lib/stop-scorer.ts` (new)
- 4-factor scoring (0–100 per factor):
  - Attraction density 35% — POI count from Foursquare/OSM
  - Hotel quality 25% — availability (count) × 65% + price tier × 35% (midrange $80–$180 = best)
  - Drive-time balance 25% — fraction of route (0.5 = midpoint = 100pts)
  - Corridor alignment 15% — point-to-polyline distance against OSRM geometry
- `buildStopWeights()` → 0.1–1.0 weights for NSGA-II Insert/Point mutations
- Quality badges (Excellent/Good/Fair/Poor) shown per stop in RouteOptionsCard

### ✅ Phase 5 — All Stop Counts Supported
**Files:** `components/FloatingRouteSummary.tsx`, `contexts/TripContext.tsx`
- Button visible at stops ≥ 2 (was ≥ 3)
- Label + behavior by intermediate count:
  | Intermediates | Button | Behavior |
  |--------------|--------|----------|
  | 0 | "Suggest Stops" | LLM picks best 1–3 corridor stops |
  | 1 | "Evaluate Stop" | Phase 4 score → contextual AI message (confirm if ≥55, suggest alt if <55) |
  | 2–8 | "Optimize" | NSGA-II pop=120/gen=200 + Pareto card |
  | 9+ | "Optimize" | NSGA-II pop=200/gen=400 + Pareto card |

### ✅ Phase 6 — Budget as Cost Objective
**Files:** `contexts/TripContext.tsx`, `components/RouteOptionsCard.tsx`, `lib/route-optimizer.ts`
- Cost = gas (MPG=30, $3.50/gal default) + hotels (per stop) + activities ($25 × saved count per city)
- `NSGAIIConfig` gains: `activitiesByCity`, `mpg`, `gasPricePerGallon`
- **Budget auto-detection**: regex scans last user message for budget keywords + `$XXX` amounts
- `userBudget` state in TripContext, exposed via context
- RouteOptionsCard: budget input row (pre-filled from detection), over-budget routes grayed out
  with "Over budget" banner + "+$X over" red label + disabled Select button

### ✅ Phase 7 — Corridor Opportunistic Stops
**Files:** `hooks/useCorridorStops.ts` (new), `components/CorridorStopsPanel.tsx` (new)
- Samples OSRM geometry every 25 miles (up to 10 points)
- 4-mirror Overpass race per point, tourism/historic/natural POIs within 8 miles
- Point-to-polyline distance filter: skips POIs >8mi from route
- Deduplicates by normalized name, filters out existing stop cities
- Sorts by route position (chips appear in travel order), cap 8 total
- Route-fraction-based `nearStopCity` labelling (haversine was wrong for curved routes like Northville→Soo Locks→Pictured Rocks)
- **CorridorStopsPanel**: horizontal scrollable chip bar below FloatingRouteSummary
  - Shows: emoji + name + category + "Near [City]" + distance off route
  - Click chip → amber diamond pin on map (toggle); click again to remove
  - [+] sends AI message to add stop + recalculate itinerary
  - ✓ Added state per chip; × to dismiss panel for session

### ✅ Phase 8 — System Prompt Enhancements
**File:** `lib/claude-tools.ts` (SYSTEM_PROMPT)
ROUTE QUALITY RULES added:
- Daily drive balance (flag >5h legs, >4h with children)
- No backtracking rule
- Detour worth-it check (state extra time before recommending)
- Toll awareness (mention proactively, offer toll-free alternate)
- User intent preservation (NEVER remove explicitly named stops)
- Seasonal conditions (mountain passes, foliage, hurricanes, desert heat)
- Round trip detection (trigger on "loop", "exploring", "scenic drive", same origin/dest)
- Budget awareness (match hotel tier to stated budget)

---

## ⏳ Round Trip Feature — NOT YET IMPLEMENTED
**Why**: Deferred — NSGA-II already handles round trips by treating origin = destination anchor.
**What's needed when ready**:
- "🔄 Round Trip" toggle in FloatingRouteSummary
- "Plan a round trip loop" chip in MapSuggestions
- `handleOptimizeRoute`: when round trip active, append origin as final stop to NSGA-II candidate
- Map: dashed return arc from destination back to origin

---

## Files Created / Modified

| File | Status | Purpose |
|------|--------|---------|
| `lib/osrm-client.ts` | Modified | `getTimeMatrix()`, `timeMatrixKey()` |
| `lib/route-optimizer.ts` | Rewritten | NSGA-II + `ParetoRoute` + `NSGAIIConfig` |
| `lib/stop-scorer.ts` | **New** | 4-factor stop quality scoring |
| `lib/claude-tools.ts` | Modified | Phase 8 ROUTE QUALITY RULES in SYSTEM_PROMPT |
| `components/RouteOptionsCard.tsx` | **New** | Pareto comparison overlay (Fast/Balanced/Complete) |
| `components/CorridorStopsPanel.tsx` | **New** | "On Your Way" horizontal chip bar |
| `hooks/useCorridorStops.ts` | **New** | Corridor Overpass scan + dedup |
| `contexts/TripContext.tsx` | Modified | Budget state, stopScores, handleOptimizeRoute branching, activitiesByCity |
| `components/FloatingRouteSummary.tsx` | Modified | Adaptive button label, threshold → stops ≥ 2 |

**Not created** (decided against):
- `workers/optimizer.worker.ts` — NSGA-II is fast enough on main thread for ≤10 stops
- `hooks/useProactivePlaces.ts` extension — corridor stops got their own dedicated hook instead

## Deployment
- Branch: `master`
- Production: https://road-trip-planner-blush.vercel.app
