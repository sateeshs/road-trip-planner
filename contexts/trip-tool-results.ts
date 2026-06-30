/**
 * Pure extraction/processing functions for AI tool results from AI SDK 4.x messages.
 * No React hooks or context — only data transformation logic.
 * Imported by TripContext.tsx to keep that file under 800 lines.
 */

import type { RouteStop, Hotel, Attraction, RouteGeometry } from '@/types'
import type { BookingSummary } from '@/components/BookingReviewModal'
import {
  parseSuggestRouteStops,
  parseSearchAttractions,
  parseSearchHotels,
  parseSearchSurroundings,
  parseSearchRestaurants,
} from '@/lib/tool-result-schemas'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolInvocationPart = {
  type: string
  toolInvocation?: {
    toolName: string
    state: string
    result?: unknown
  }
}

export interface ToolResultBatch {
  // suggest_route_stops results
  newStops?: RouteStop[]
  routeGeometry?: RouteGeometry
  totalDistance?: string
  totalDuration?: string
  surroundingsByCityPatch?: Record<string, Attraction[]>

  // search_hotels results: map of city → hotels (may include alias for matched stop)
  hotelPatches: Array<{ city: string; hotels: Hotel[]; matchedCity?: string }>

  // search_attractions results: map of city → attractions
  attractionPatches: Array<{ city: string; attractions: Attraction[]; matchedCity?: string }>

  // explore_surroundings results
  surroundingsPatches: Array<{ city: string; surroundings: Attraction[]; matchedCity?: string }>

  // search_restaurants results
  restaurantPatches: Array<{ city: string; restaurants: Attraction[]; matchedCity?: string }>

  // build_booking_summary result
  bookingSummary?: BookingSummary

  // Whether any explore_surroundings completed (to clear loading state)
  surroundingsCompleted: boolean
}

// ─── MCP result parser ───────────────────────────────────────────────────────

/**
 * Safely parses a tool result that may be:
 * - An MCP envelope: { content: [{ type: 'text', text: '{"hotels":[...]}' }] }
 * - A plain JSON string (some SDK versions serialize result as string)
 * - A plain object (inline tool mode)
 *
 * MCP tools via experimental_createMCPClient return the raw MCP content
 * envelope as toolInvocation.result. We unwrap it here so all downstream
 * code can access result.hotels, result.stops, etc. directly.
 */
export function parseResult<T>(result: unknown): T {
  // Handle MCP envelope: { content: [{ type: 'text', text: '<json>' }] }
  if (
    result !== null &&
    typeof result === 'object' &&
    'content' in result &&
    Array.isArray((result as { content: unknown[] }).content)
  ) {
    const content = (result as { content: Array<{ type: string; text?: string }> }).content
    const textItem = content.find(c => c.type === 'text' && typeof c.text === 'string')
    if (textItem?.text) {
      try { return JSON.parse(textItem.text) as T } catch { /* fall through to string check */ }
    }
  }
  // Handle plain JSON string
  if (typeof result === 'string') {
    try { return JSON.parse(result) as T } catch { return result as unknown as T }
  }
  return result as T
}

// ─── City fuzzy matching ─────────────────────────────────────────────────────

/**
 * Finds the stop whose city name best matches the AI-provided city string.
 * The AI often uses a nearby city name instead of the exact stop name
 * (e.g. "Munising" for a "Pictured Rocks" stop, or "Sault Ste. Marie" for "Soo Locks").
 * Matching logic: exact → prefix → word overlap.
 */
export function findMatchingStop(stops: RouteStop[], aiCity: string): RouteStop | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const key = norm(aiCity)
  // 1. Exact match
  const exact = stops.find(s => norm(s.city) === key)
  if (exact) return exact
  // 2. One contains the other
  const contains = stops.find(s => key.includes(norm(s.city)) || norm(s.city).includes(key))
  if (contains) return contains
  // 3. Any word overlap
  const aiWords = key.split(/\s+/).filter(w => w.length > 2)
  return stops.find(s => aiWords.some(w => norm(s.city).includes(w)))
}

// ─── Tool result extraction ──────────────────────────────────────────────────

/**
 * Extracts all actionable tool results from the parts of a single AI message.
 * Returns a ToolResultBatch that the caller can apply to React state.
 *
 * All tool results are validated through Zod schemas before being applied
 * to state — invalid shapes log a warning and use safe empty defaults instead
 * of crashing the UI or putting corrupt data into the map.
 *
 * Pass `currentStops` so city-name fuzzy matching works even before
 * React state has committed the new stops from suggest_route_stops.
 */
export function extractToolResults(
  parts: ToolInvocationPart[],
  currentStops: RouteStop[],
): ToolResultBatch {
  const batch: ToolResultBatch = {
    hotelPatches: [],
    attractionPatches: [],
    surroundingsPatches: [],
    restaurantPatches: [],
    surroundingsCompleted: false,
  }

  // Pass 1: collect new stops from suggest_route_stops so subsequent tools
  // (search_attractions, search_hotels) can do city-name fuzzy matching
  // without relying on React state that may not have committed yet.
  let batchStops: RouteStop[] = currentStops
  for (const part of parts) {
    if (part.type !== 'tool-invocation') continue
    const ti = part.toolInvocation
    if (!ti || ti.state !== 'result') continue
    if (ti.toolName === 'suggest_route_stops') {
      const parsed = parseSuggestRouteStops(parseResult(ti.result))
      if (parsed.stops && parsed.stops.length > 0) batchStops = parsed.stops as RouteStop[]
    }
  }

  // Pass 2: extract all tool results with Zod validation
  for (const part of parts) {
    if (part.type !== 'tool-invocation') continue
    const ti = part.toolInvocation
    if (!ti || ti.state !== 'result') continue
    const raw = parseResult(ti.result)

    if (ti.toolName === 'suggest_route_stops') {
      const parsed = parseSuggestRouteStops(raw)
      if (parsed.stops && parsed.stops.length > 0) batch.newStops = parsed.stops as RouteStop[]
      if (parsed.routeGeometry) batch.routeGeometry = parsed.routeGeometry as RouteGeometry
      if (parsed.totalDistance) batch.totalDistance = parsed.totalDistance
      if (parsed.totalDuration) batch.totalDuration = parsed.totalDuration
    }

    if (ti.toolName === 'search_hotels') {
      const parsed = parseSearchHotels(raw)
      if (parsed.city) {
        const matchedStop = findMatchingStop(batchStops, parsed.city)
        batch.hotelPatches.push({
          city: parsed.city,
          hotels: parsed.hotels as Hotel[],
          matchedCity: matchedStop && matchedStop.city !== parsed.city ? matchedStop.city : undefined,
        })
      }
    }

    if (ti.toolName === 'search_attractions') {
      const parsed = parseSearchAttractions(raw)
      if (parsed.city) {
        const matchedStop = findMatchingStop(batchStops, parsed.city)
        batch.attractionPatches.push({
          city: parsed.city,
          attractions: parsed.attractions as Attraction[],
          matchedCity: matchedStop && matchedStop.city !== parsed.city ? matchedStop.city : undefined,
        })
      }
    }

    if (ti.toolName === 'explore_surroundings') {
      batch.surroundingsCompleted = true
      const parsed = parseSearchSurroundings(raw)
      if (parsed.city) {
        const matchedStop = findMatchingStop(batchStops, parsed.city)
        batch.surroundingsPatches.push({
          city: parsed.city,
          surroundings: parsed.surroundings as Attraction[],
          matchedCity: matchedStop && matchedStop.city !== parsed.city ? matchedStop.city : undefined,
        })
      }
    }

    if (ti.toolName === 'search_restaurants') {
      const parsed = parseSearchRestaurants(raw)
      if (parsed.city) {
        const matchedStop = findMatchingStop(batchStops, parsed.city)
        batch.restaurantPatches.push({
          city: parsed.city,
          restaurants: parsed.restaurants as Attraction[],
          matchedCity: matchedStop && matchedStop.city !== parsed.city ? matchedStop.city : undefined,
        })
      }
    }

    if (ti.toolName === 'build_booking_summary') {
      const r = raw as Record<string, unknown>
      if (r?.summary) batch.bookingSummary = r.summary as BookingSummary
    }
  }

  return batch
}
