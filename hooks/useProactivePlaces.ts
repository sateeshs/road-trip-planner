'use client'
import { useState, useEffect, useRef } from 'react'
import type { RouteStop, Attraction } from '@/types'

export interface ProactivePOIs {
  gasStations: Attraction[]
  restaurants: Attraction[]
  attractions: Attraction[]
  restrooms: Attraction[]
  campgrounds: Attraction[]
  tollBooths: Attraction[]
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const MIDPOINT_RADIUS = 60000 // 60km — for gas/food/restrooms/campgrounds along the route
const PER_STOP_RADIUS = 35000 // 35km — for attractions near each individual stop
const MAX_RESULTS = 12

// Overpass QL query — fetches nodes+ways for a given OSM filter
function buildQuery(lat: number, lng: number, filter: string, radius: number): string {
  return `[out:json][timeout:12];
(
  node${filter}(around:${radius},${lat},${lng});
  way${filter}(around:${radius},${lat},${lng});
);
out center ${MAX_RESULTS};`
}

interface OverpassElement {
  id: number
  type: 'node' | 'way'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function toAttractions(elements: OverpassElement[], category: string): Attraction[] {
  const result: Attraction[] = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (!lat || !lon) continue
    const tags = el.tags ?? {}
    result.push({
      id: `osm-${el.type}-${el.id}`,
      name: tags.name ?? tags['name:en'] ?? category,
      category,
      address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
        .filter(Boolean).join(' ') || tags.description || '',
      coordinates: { lat, lng: lon },
      website: tags.website ?? tags.url,
    })
  }
  return result
}

async function fetchOverpass(lat: number, lng: number, filter: string, category: string, radius: number, signal: AbortSignal): Promise<Attraction[]> {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildQuery(lat, lng, filter, radius))}`,
      signal,
    })
    if (!res.ok) return []
    const data = await res.json() as { elements?: OverpassElement[] }
    return toAttractions(data.elements ?? [], category)
  } catch {
    return []
  }
}

// Geometric centroid of all stops — more representative than the middle-index stop
// for long routes spanning large distances (e.g. Northville → Soo Locks → Munising)
function getCentroid(stops: RouteStop[]): { lat: number; lng: number } {
  const lat = stops.reduce((sum, s) => sum + s.coordinates.lat, 0) / stops.length
  const lng = stops.reduce((sum, s) => sum + s.coordinates.lng, 0) / stops.length
  return { lat, lng }
}

// Fetch attractions from EACH stop individually and merge, deduped by id.
// The midpoint approach misses stops far from the center on long routes.
async function fetchAttractionsAllStops(stops: RouteStop[], filter: string, category: string, signal: AbortSignal): Promise<Attraction[]> {
  const perStop = await Promise.all(
    stops.map(s =>
      fetchOverpass(s.coordinates.lat, s.coordinates.lng, filter, category, PER_STOP_RADIUS, signal)
    )
  )
  const seen = new Set<string>()
  const merged: Attraction[] = []
  for (const list of perStop) {
    for (const a of list) {
      if (!seen.has(a.id)) { seen.add(a.id); merged.push(a) }
    }
  }
  return merged.slice(0, MAX_RESULTS * stops.length)
}

const EMPTY: ProactivePOIs = { gasStations: [], restaurants: [], attractions: [], restrooms: [], campgrounds: [], tollBooths: [] }

export function useProactivePlaces(stops: RouteStop[]): ProactivePOIs {
  const [pois, setPois] = useState<ProactivePOIs>(EMPTY)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (stops.length < 2) {
      setPois(EMPTY)
      return
    }

    // Debounce — stops stream in quickly during AI tool calls
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const { lat, lng } = getCentroid(stops)

      const [gasStations, restaurants, restrooms, campgrounds, tollBooths, attractions] = await Promise.all([
        // Gas/food/restrooms/campgrounds/tolls: centroid query covers the route corridor
        fetchOverpass(lat, lng, '["amenity"="fuel"]', 'Gas Station', MIDPOINT_RADIUS, controller.signal),
        fetchOverpass(lat, lng, '["amenity"~"restaurant|cafe|fast_food"]', 'Restaurant', MIDPOINT_RADIUS, controller.signal),
        fetchOverpass(lat, lng, '["highway"="rest_area"]', 'Rest Area / Restroom', MIDPOINT_RADIUS, controller.signal),
        fetchOverpass(lat, lng, '["tourism"~"camp_site|caravan_site"]', 'Campground', MIDPOINT_RADIUS, controller.signal),
        fetchOverpass(lat, lng, '["barrier"="toll_booth"]', 'Toll Booth', MIDPOINT_RADIUS, controller.signal),
        // Attractions: per-stop queries so every city (including distant ones like Munising) is covered
        fetchAttractionsAllStops(stops, '["tourism"~"attraction|museum|viewpoint|theme_park"]', 'Attraction', controller.signal),
      ])

      if (!controller.signal.aborted) {
        setPois({ gasStations, restaurants, attractions, restrooms, campgrounds, tollBooths })
      }
    }, 800)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [stops])

  return pois
}
