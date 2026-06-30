/**
 * Pure extraction/processing functions for AI tool results from AI SDK 4.x messages.
 * No React hooks or context — only data transformation logic.
 * Imported by TripContext.tsx to keep that file under 800 lines.
 */

import type { RouteStop, Hotel, Attraction, RouteGeometry } from '@/types'
import type { BookingSummary } from '@/components/BookingReviewModal'

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
  surroundingsPatches: Array<{ city: string; surroundings: Attraction[] }>

  // build_booking_summary result
  bookingSummary?: BookingSummary

  // Whether any explore_surroundings completed (to clear loading state)
  surroundingsCompleted: boolean
}

// ─── MCP result parser ───────────────────────────────────────────────────────

/**
 * Safely parses a tool result that may be a JSON string (MCP mode) or
 * a plain object (inline mode). MCP tools serialize result content as
 * `content[0].text`, which the AI SDK passes to the LLM as a JSON string.
 */
export function parseResult<T>(result: unknown): T {
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
    const result = parseResult<Record<string, unknown>>(ti.result)
    if (ti.toolName === 'suggest_route_stops' && result?.stops) {
      batchStops = result.stops as RouteStop[]
    }
  }

  // Pass 2: extract all tool results
  for (const part of parts) {
    if (part.type !== 'tool-invocation') continue
    const ti = part.toolInvocation
    if (!ti || ti.state !== 'result') continue
    const result = parseResult<Record<string, unknown>>(ti.result)

    if (ti.toolName === 'suggest_route_stops') {
      if (result?.stops) batch.newStops = result.stops as RouteStop[]
      if (result?.routeGeometry) batch.routeGeometry = result.routeGeometry as RouteGeometry
      if (result?.totalDistance) batch.totalDistance = result.totalDistance as string
      if (result?.totalDuration) batch.totalDuration = result.totalDuration as string
      if (result?.surroundingsByCity) {
        batch.surroundingsByCityPatch = result.surroundingsByCity as Record<string, Attraction[]>
      }
    }

    if (ti.toolName === 'search_hotels' && result?.hotels && result?.city) {
      const city = result.city as string
      const matchedStop = findMatchingStop(batchStops, city)
      batch.hotelPatches.push({
        city,
        hotels: result.hotels as Hotel[],
        matchedCity: matchedStop && matchedStop.city !== city ? matchedStop.city : undefined,
      })
    }

    if (ti.toolName === 'search_attractions' && result?.attractions && result?.city) {
      const city = result.city as string
      const matchedStop = findMatchingStop(batchStops, city)
      batch.attractionPatches.push({
        city,
        attractions: result.attractions as Attraction[],
        matchedCity: matchedStop && matchedStop.city !== city ? matchedStop.city : undefined,
      })
    }

    if (ti.toolName === 'explore_surroundings') {
      batch.surroundingsCompleted = true
      if (result?.surroundings && result?.city) {
        batch.surroundingsPatches.push({
          city: result.city as string,
          surroundings: result.surroundings as Attraction[],
        })
      }
    }

    if (ti.toolName === 'build_booking_summary' && result?.summary) {
      batch.bookingSummary = result.summary as BookingSummary
    }
  }

  return batch
}
