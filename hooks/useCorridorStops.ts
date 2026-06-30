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
  nearStopCity: string       // nearest named trip stop (city name for display)
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
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

async function overpassRace(ql: string, signal: AbortSignal): Promise<OverpassEl[]> {
  const controllers = MIRRORS.map(() => new AbortController())
  // Abort all mirrors when the outer signal fires
  signal.addEventListener('abort', () => controllers.forEach(c => c.abort()), { once: true })

  const requests = MIRRORS.map((url, i) => {
    // 30s hard timeout per mirror (server-side Overpass timeout is 25s, so this is a safety net)
    const timer = setTimeout(() => controllers[i].abort(), 30_000)
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(ql)}`,
      signal: controllers[i].signal,
    })
      .then(r => r.ok ? r.json() as Promise<{ elements?: OverpassEl[]; remark?: string }> : Promise.reject())
      .then(d => {
        clearTimeout(timer)
        if (d.remark) return Promise.reject(new Error('Overpass timeout'))
        // Cancel the other mirrors
        controllers.forEach((c, j) => j !== i && c.abort())
        return d.elements ?? []
      })
      .catch(e => { clearTimeout(timer); return Promise.reject(e) })
  })

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

/**
 * Returns what fraction (0–1) along the route polyline a lat/lng point is closest to.
 * Used to compare a corridor POI's route position against each stop's route position,
 * which is far more reliable than haversine distance on routes that curve significantly
 * (e.g. Northville → Soo Locks → Pictured Rocks arcs through central Michigan).
 */
function routeFractionOf(lat: number, lng: number, geometry: RouteGeometry): number {
  let totalKm = 0
  const segKms: number[] = []
  for (let i = 1; i < geometry.length; i++) {
    const km = haversineKm(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1])
    segKms.push(km)
    totalKm += km
  }
  if (totalKm === 0) return 0

  let bestFrac = 0
  let minDist = Infinity
  let accumulated = 0
  for (let i = 1; i < geometry.length; i++) {
    const [alat, alng] = geometry[i - 1]
    const [blat, blng] = geometry[i]
    const dx = blng - alng, dy = blat - alat
    const lenSq = dx * dx + dy * dy
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((lng - alng) * dx + (lat - alat) * dy) / lenSq)) : 0
    const dist = haversineKm(lat, lng, alat + t * dy, alng + t * dx)
    if (dist < minDist) {
      minDist = dist
      bestFrac = (accumulated + t * segKms[i - 1]) / totalKm
    }
    accumulated += segKms[i - 1]
  }
  return bestFrac
}

/**
 * Returns the stop city whose route-fraction position is closest to the given fraction.
 * Precompute stopFractions once per route to avoid redundant geometry walks.
 */
function nearestStopByFraction(poiFraction: number, stops: RouteStop[], stopFractions: number[]): string {
  let best = stops[0]
  let bestDiff = Infinity
  for (let i = 0; i < stops.length; i++) {
    const diff = Math.abs(stopFractions[i] - poiFraction)
    if (diff < bestDiff) { bestDiff = diff; best = stops[i] }
  }
  return best.city
}

// ─── Category → emoji mapping ────────────────────────────────────────────────

function categoryEmoji(tags: Record<string, string>): { category: string; emoji: string } {
  const t = tags.tourism, h = tags.historic, n = tags.natural, l = tags.leisure
  const sport = tags.sport, amenity = tags.amenity, attraction = tags.attraction
  const name = (tags.name ?? '').toLowerCase()

  // Name-based inference for water/activity businesses (highest priority)
  if (/cruise|cruises/.test(name))              return { category: 'Cruise', emoji: '🚢' }
  if (/kayak|canoe|paddle/.test(name))          return { category: 'Kayaking', emoji: '🚣' }
  if (/boat.?tour|boat.?rental/.test(name))     return { category: 'Boat Tour', emoji: '🛥️' }
  if (/raft/.test(name))                        return { category: 'Rafting', emoji: '🌊' }
  if (/zip.?line/.test(name))                   return { category: 'Zip Line', emoji: '🪂' }

  // Explicit OSM tag matches
  if (t === 'boat_tour')          return { category: 'Boat Tour', emoji: '🛥️' }
  if (t === 'camp_site')          return { category: 'Campground', emoji: '⛺' }
  if (amenity === 'boat_rental')  return { category: 'Boat Rental', emoji: '🛥️' }
  if (attraction === 'boat_tour') return { category: 'Boat Tour', emoji: '🛥️' }
  if (attraction === 'zip_line')  return { category: 'Zip Line', emoji: '🪂' }
  if (attraction === 'scenic_railway') return { category: 'Scenic Train', emoji: '🚂' }
  if (attraction === 'gondola_lift' || attraction === 'chair_lift') return { category: 'Gondola', emoji: '🚡' }

  // Sport tags
  if (sport === 'kayak' || sport === 'kayaking') return { category: 'Kayaking', emoji: '🚣' }
  if (sport === 'canoe' || sport === 'canoeing') return { category: 'Canoeing', emoji: '🚣' }
  if (sport === 'rafting')        return { category: 'Rafting', emoji: '🌊' }
  if (sport === 'sailing')        return { category: 'Sailing', emoji: '⛵' }
  if (sport === 'rowing')         return { category: 'Rowing', emoji: '🚣' }

  // Leisure
  if (l === 'marina')             return { category: 'Marina', emoji: '⚓' }
  if (l === 'water_park')         return { category: 'Water Park', emoji: '💦' }
  if (l === 'nature_reserve')     return { category: 'Nature Reserve', emoji: '🌳' }
  if (l === 'park')               return { category: 'Park', emoji: '🌳' }

  // Tourism
  if (t === 'museum')             return { category: 'Museum', emoji: '🏛️' }
  if (t === 'viewpoint')          return { category: 'Viewpoint', emoji: '🔭' }
  if (t === 'theme_park')         return { category: 'Theme Park', emoji: '🎡' }
  if (t === 'zoo')                return { category: 'Zoo', emoji: '🦒' }
  if (t === 'aquarium')           return { category: 'Aquarium', emoji: '🐠' }
  if (t === 'attraction')         return { category: 'Attraction', emoji: '🗺️' }

  // Historic
  if (h === 'monument' || h === 'memorial') return { category: 'Monument', emoji: '🗿' }
  if (h === 'castle')             return { category: 'Castle', emoji: '🏰' }
  if (h)                          return { category: 'Historic Site', emoji: '🏺' }

  // Natural
  if (n === 'peak')               return { category: 'Mountain', emoji: '🏔️' }
  if (n === 'waterfall')          return { category: 'Waterfall', emoji: '💧' }
  if (n === 'beach')              return { category: 'Beach', emoji: '🏖️' }
  if (n === 'cave_entrance')      return { category: 'Cave', emoji: '🕳️' }
  if (n === 'hot_spring')         return { category: 'Hot Spring', emoji: '♨️' }
  if (n)                          return { category: 'Natural Site', emoji: '🌿' }

  return { category: 'Point of Interest', emoji: '📍' }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const SAMPLE_EVERY_MILES  = 25
const MAX_SAMPLE_POINTS   = 10
const QUERY_RADIUS_M      = 14000  // ~8.7 miles — for route sample points
const PER_STOP_RADIUS_M   = 20000  // ~12.5 miles — wider net for each named stop
const MAX_PER_POINT       = 8
const MAX_TOTAL           = 20     // increased to accommodate per-stop results

// nwr for tourism/historic/natural/leisure (museums, ruins, parks are often mapped as ways/relations).
// node-only for sport/amenity/attraction (these are almost always nodes, and node queries are 10x faster).
// Timeout 25s — nwr queries are slower than node-only; 15s was causing all mirrors to time out.
const POI_QUERY = (radius: number, lat: number, lng: number, limit: number) => `[out:json][timeout:25];
(
  nwr["tourism"~"attraction|museum|viewpoint|theme_park|zoo|aquarium"]["name"](around:${radius},${lat},${lng});
  nwr["historic"~"monument|memorial|castle|ruins|archaeological_site"]["name"](around:${radius},${lat},${lng});
  nwr["natural"~"peak|waterfall|beach|hot_spring|cave_entrance"]["name"](around:${radius},${lat},${lng});
  nwr["leisure"~"nature_reserve|marina|water_park"]["name"](around:${radius},${lat},${lng});
  nwr["tourism"~"boat_tour|camp_site"]["name"](around:${radius},${lat},${lng});
  node["amenity"~"boat_rental"]["name"](around:${radius},${lat},${lng});
  node["sport"~"kayak|kayaking|canoe|canoeing|sailing|rafting|rowing"]["name"](around:${radius},${lat},${lng});
  node["attraction"~"boat_tour|scenic_railway|zip_line|gondola_lift|chair_lift"]["name"](around:${radius},${lat},${lng});
);
out center ${limit};`

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
        // Existing stop city names for dedup
        const existingCities = new Set(stops.map(s => s.city.toLowerCase()))

        // Precompute each stop's fraction along the route once
        const stopFractions = stops.map(s =>
          routeFractionOf(s.coordinates.lat, s.coordinates.lng, routeGeometry)
        )

        // ── Per-stop queries ────────────────────────────────────────────────
        // Query around EVERY named stop directly. This guarantees coverage for
        // each stop regardless of how geometry sample points fall.
        const perStopBatches = await Promise.all(
          stops.map(stop =>
            overpassRace(POI_QUERY(PER_STOP_RADIUS_M, stop.coordinates.lat, stop.coordinates.lng, MAX_PER_POINT), controller.signal)
          )
        )

        // ── Route geometry sample queries ───────────────────────────────────
        // Sample points every ~25 miles to catch POIs between stops.
        const samplePoints = sampleRoutePoints(routeGeometry, SAMPLE_EVERY_MILES, MAX_SAMPLE_POINTS)
        const sampleBatches = samplePoints.length > 0
          ? await Promise.all(
              samplePoints.map(p =>
                overpassRace(POI_QUERY(QUERY_RADIUS_M, p.lat, p.lng, MAX_PER_POINT), controller.signal)
              )
            )
          : []

        if (controller.signal.aborted) return

        const seen = new Set<string>()
        const candidates: CorridorStop[] = []

        function addElement(el: OverpassEl, hintFraction?: number, hintCity?: string) {
          const lat = el.lat ?? el.center?.lat
          const lon = el.lon ?? el.center?.lon
          if (!lat || !lon) return
          const tags = el.tags ?? {}
          const name = tags.name ?? tags['name:en']
          if (!name || name.length < 3) return

          const nameKey = name.toLowerCase().replace(/[^a-z0-9]/g, '')
          if (seen.has(nameKey)) return

          const isExisting = existingCities.has(name.toLowerCase()) ||
            [...existingCities].some(city =>
              nameKey.includes(city.replace(/[^a-z0-9]/g, '')) ||
              city.replace(/[^a-z0-9]/g, '').includes(nameKey)
            )
          if (isExisting) return

          seen.add(nameKey)

          const geo = routeGeometry!
          const distKm = distToRoute(lat, lon, geo)
          const distMiles = distKm / KM_PER_MILE
          // Per-stop results: allow up to 12.5 miles; corridor samples: 8 miles
          const maxDist = hintCity ? 12.5 : 8
          if (distMiles > maxDist) return

          const fraction = hintFraction ?? routeFractionOf(lat, lon, geo)
          const { category, emoji } = categoryEmoji(tags)

          candidates.push({
            id: `corridor-${el.type}-${el.id}`,
            name,
            category,
            emoji,
            lat,
            lng: lon,
            distanceMiles: Math.round(distMiles * 10) / 10,
            routeFraction: fraction,
            nearStopCity: hintCity ?? nearestStopByFraction(fraction, stops, stopFractions),
          })
        }

        // Add per-stop results first — they are most reliable
        perStopBatches.forEach((elements, stopIdx) => {
          const stop = stops[stopIdx]
          const fraction = stopFractions[stopIdx]
          for (const el of elements) addElement(el, fraction, stop.city)
        })

        // Add corridor sample results (fills in between-stop gaps)
        sampleBatches.forEach((elements, batchIdx) => {
          const fraction = samplePoints[batchIdx].fraction
          for (const el of elements) addElement(el, fraction)
        })

        // Sort by route position, cap at MAX_TOTAL
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
