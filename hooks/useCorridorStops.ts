'use client'
/**
 * Phase 7 — Corridor Opportunistic Stops
 *
 * After route geometry is set, samples points every ~25 miles along the polyline,
 * queries Overpass for notable POIs within 8 miles of each sample, deduplicates,
 * and surfaces the top results as "On Your Way" suggestions.
 */

import { useState, useEffect, useRef } from 'react'
import type { RouteGeometry, RouteStop } from '@/types'

export interface CorridorStop {
  id: string
  name: string
  category: string
  emoji: string
  lat: number
  lng: number
  distanceMiles: number      // perpendicular distance from route line
  routeFraction: number      // 0–1: where along route this stop sits (for ordering)
}

// ─── Overpass mirrors (client-side) ─────────────────────────────────────────

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface OverpassEl {
  id: number; type: string
  lat?: number; lon?: number
  tags?: Record<string, string>
}

async function overpassRace(ql: string, signal: AbortSignal): Promise<OverpassEl[]> {
  const controllers = MIRRORS.map(() => new AbortController())
  // Abort all mirrors when the outer signal fires
  signal.addEventListener('abort', () => controllers.forEach(c => c.abort()), { once: true })

  const requests = MIRRORS.map((url, i) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(ql)}`,
      signal: controllers[i].signal,
    })
      .then(r => r.ok ? r.json() as Promise<{ elements?: OverpassEl[] }> : Promise.reject())
      .then(d => {
        // Cancel the other mirrors
        controllers.forEach((c, j) => j !== i && c.abort())
        return d.elements ?? []
      })
  )

  try {
    return await Promise.any(requests)
  } catch {
    return []
  }
}

// ─── Haversine + geometry helpers ────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const KM_PER_MILE = 1.60934

/** Sample up to `max` points spaced ~`targetMiles` apart along a [lat,lng][] polyline. */
function sampleRoutePoints(
  geometry: RouteGeometry,
  targetMiles: number,
  max: number
): Array<{ lat: number; lng: number; fraction: number }> {
  const targetKm = targetMiles * KM_PER_MILE
  const points: Array<{ lat: number; lng: number; fraction: number }> = []

  // Total route length
  let totalKm = 0
  for (let i = 1; i < geometry.length; i++) {
    totalKm += haversineKm(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1])
  }
  if (totalKm < 1) return []

  // Walk segments, emit a sample at each targetKm interval starting at targetKm/2
  let accumulated = 0
  let nextSample = targetKm / 2

  for (let i = 1; i < geometry.length && points.length < max; i++) {
    const [lat1, lng1] = geometry[i - 1]
    const [lat2, lng2] = geometry[i]
    const segKm = haversineKm(lat1, lng1, lat2, lng2)
    if (segKm === 0) continue

    while (accumulated + segKm >= nextSample && points.length < max) {
      const t = (nextSample - accumulated) / segKm
      points.push({
        lat: lat1 + t * (lat2 - lat1),
        lng: lng1 + t * (lng2 - lng1),
        fraction: (accumulated + t * segKm) / totalKm,
      })
      nextSample += targetKm
    }
    accumulated += segKm
  }
  return points
}

/** Minimum point-to-polyline distance in km. */
function distToRoute(lat: number, lng: number, geometry: RouteGeometry): number {
  let minKm = Infinity
  for (let i = 1; i < geometry.length; i++) {
    const [alat, alng] = geometry[i - 1]
    const [blat, blng] = geometry[i]
    const dx = blng - alng, dy = blat - alat
    const lenSq = dx * dx + dy * dy
    let t = 0
    if (lenSq > 0) t = Math.max(0, Math.min(1, ((lng - alng) * dx + (lat - alat) * dy) / lenSq))
    const km = haversineKm(lat, lng, alat + t * dy, alng + t * dx)
    if (km < minKm) minKm = km
  }
  return minKm
}

// ─── Category → emoji mapping ────────────────────────────────────────────────

function categoryEmoji(tags: Record<string, string>): { category: string; emoji: string } {
  const t = tags.tourism, h = tags.historic, n = tags.natural, l = tags.leisure
  if (t === 'museum')             return { category: 'Museum', emoji: '🏛️' }
  if (t === 'viewpoint')          return { category: 'Viewpoint', emoji: '🔭' }
  if (t === 'theme_park')         return { category: 'Theme Park', emoji: '🎡' }
  if (t === 'zoo')                return { category: 'Zoo', emoji: '🦒' }
  if (t === 'aquarium')           return { category: 'Aquarium', emoji: '🐠' }
  if (t === 'attraction')         return { category: 'Attraction', emoji: '🗺️' }
  if (h === 'monument' || h === 'memorial') return { category: 'Monument', emoji: '🗿' }
  if (h === 'castle')             return { category: 'Castle', emoji: '🏰' }
  if (h)                          return { category: 'Historic Site', emoji: '🏺' }
  if (n === 'peak')               return { category: 'Mountain', emoji: '🏔️' }
  if (n === 'waterfall')          return { category: 'Waterfall', emoji: '💧' }
  if (n === 'beach')              return { category: 'Beach', emoji: '🏖️' }
  if (n === 'cave_entrance')      return { category: 'Cave', emoji: '🕳️' }
  if (n === 'hot_spring')         return { category: 'Hot Spring', emoji: '♨️' }
  if (n)                          return { category: 'Natural Site', emoji: '🌿' }
  if (l === 'nature_reserve')     return { category: 'Nature Reserve', emoji: '🌳' }
  if (l === 'park')               return { category: 'Park', emoji: '🌳' }
  return { category: 'Point of Interest', emoji: '📍' }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const SAMPLE_EVERY_MILES = 25
const MAX_SAMPLE_POINTS  = 10
const QUERY_RADIUS_M     = 14000  // ~8.7 miles
const MAX_PER_POINT      = 5
const MAX_TOTAL          = 8

export function useCorridorStops(
  routeGeometry: RouteGeometry | null,
  stops: RouteStop[]
): CorridorStop[] {
  const [corridorStops, setCorridorStops] = useState<CorridorStop[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Key off geometry length + stop cities so we re-run when route changes
  const geoKey = routeGeometry ? `${routeGeometry.length}` : ''
  const stopsKey = stops.map(s => s.city).join(',')

  useEffect(() => {
    if (!routeGeometry || routeGeometry.length < 2 || stops.length < 2) {
      setCorridorStops([])
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const samplePoints = sampleRoutePoints(routeGeometry, SAMPLE_EVERY_MILES, MAX_SAMPLE_POINTS)
        if (samplePoints.length === 0) return

        // Existing stop city names for dedup
        const existingCities = new Set(stops.map(s => s.city.toLowerCase()))

        // Query each sample point in parallel
        const ql = (lat: number, lng: number) => `[out:json][timeout:12];
(
  node["tourism"~"attraction|museum|viewpoint|theme_park|zoo|aquarium"]["name"](around:${QUERY_RADIUS_M},${lat},${lng});
  node["historic"~"monument|memorial|castle|ruins|archaeological_site"]["name"](around:${QUERY_RADIUS_M},${lat},${lng});
  node["natural"~"peak|waterfall|beach|hot_spring|cave_entrance"]["name"](around:${QUERY_RADIUS_M},${lat},${lng});
  node["leisure"~"nature_reserve|park"]["name"]["leisure"!="park"](around:${QUERY_RADIUS_M},${lat},${lng});
);
out ${MAX_PER_POINT};`

        const batches = await Promise.all(
          samplePoints.map(p => overpassRace(ql(p.lat, p.lng), controller.signal))
        )

        if (controller.signal.aborted) return

        // Flatten, dedup by name, filter out existing stops and unnamed/short names
        const seen = new Set<string>()
        const candidates: CorridorStop[] = []

        batches.forEach((elements, batchIdx) => {
          const sampleFraction = samplePoints[batchIdx].fraction

          for (const el of elements) {
            if (!el.lat || !el.lon) continue
            const tags = el.tags ?? {}
            const name = tags.name ?? tags['name:en']
            if (!name || name.length < 3) continue

            const nameKey = name.toLowerCase().replace(/[^a-z0-9]/g, '')
            if (seen.has(nameKey)) continue

            // Skip if matches an existing stop city
            const isExisting = existingCities.has(name.toLowerCase()) ||
              [...existingCities].some(city => nameKey.includes(city.replace(/[^a-z0-9]/g, '')) || city.replace(/[^a-z0-9]/g, '').includes(nameKey))
            if (isExisting) continue

            seen.add(nameKey)

            const distKm = distToRoute(el.lat, el.lon, routeGeometry)
            const distMiles = distKm / KM_PER_MILE

            // Only include POIs within 8 miles of the route
            if (distMiles > 8) continue

            const { category, emoji } = categoryEmoji(tags)

            candidates.push({
              id: `corridor-${el.type}-${el.id}`,
              name,
              category,
              emoji,
              lat: el.lat,
              lng: el.lon,
              distanceMiles: Math.round(distMiles * 10) / 10,
              routeFraction: sampleFraction,
            })
          }
        })

        // Sort by route position (so chips appear in travel order), cap at MAX_TOTAL
        const sorted = candidates
          .sort((a, b) => a.routeFraction - b.routeFraction)
          .slice(0, MAX_TOTAL)

        setCorridorStops(sorted)
      } catch {
        // Silently ignore — corridor stops are non-critical
      }
    }, 1500) // wait for route to stabilize before querying

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey, stopsKey])

  return corridorStops
}
