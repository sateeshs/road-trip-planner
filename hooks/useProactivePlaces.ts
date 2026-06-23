'use client'
import { useState, useEffect, useRef } from 'react'
import type { RouteStop, Attraction } from '@/types'

export interface ProactivePOIs {
  gasStations: Attraction[]
  restaurants: Attraction[]
  attractions: Attraction[]
  restrooms: Attraction[]
  campgrounds: Attraction[]
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const RADIUS = 60000 // 60km around midpoint
const MAX_RESULTS = 12

// Overpass QL query — fetches nodes+ways for a given OSM filter
function buildQuery(lat: number, lng: number, filter: string): string {
  return `[out:json][timeout:12];
(
  node${filter}(around:${RADIUS},${lat},${lng});
  way${filter}(around:${RADIUS},${lat},${lng});
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

async function fetchOverpass(lat: number, lng: number, filter: string, category: string, signal: AbortSignal): Promise<Attraction[]> {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildQuery(lat, lng, filter))}`,
      signal,
    })
    if (!res.ok) return []
    const data = await res.json() as { elements?: OverpassElement[] }
    return toAttractions(data.elements ?? [], category)
  } catch {
    return []
  }
}

function getMidpoint(stops: RouteStop[]): { lat: number; lng: number } {
  const mid = Math.floor(stops.length / 2)
  return { lat: stops[mid].coordinates.lat, lng: stops[mid].coordinates.lng }
}

const EMPTY: ProactivePOIs = { gasStations: [], restaurants: [], attractions: [], restrooms: [], campgrounds: [] }

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

      const { lat, lng } = getMidpoint(stops)

      const [gasStations, restaurants, attractions, restrooms, campgrounds] = await Promise.all([
        fetchOverpass(lat, lng, '["amenity"="fuel"]', 'Gas Station', controller.signal),
        fetchOverpass(lat, lng, '["amenity"~"restaurant|cafe|fast_food"]', 'Restaurant', controller.signal),
        fetchOverpass(lat, lng, '["tourism"~"attraction|museum|viewpoint|theme_park"]', 'Attraction', controller.signal),
        fetchOverpass(lat, lng, '["highway"="rest_area"]', 'Rest Area / Restroom', controller.signal),
        fetchOverpass(lat, lng, '["tourism"~"camp_site|caravan_site"]', 'Campground', controller.signal),
      ])

      if (!controller.signal.aborted) {
        setPois({ gasStations, restaurants, attractions, restrooms, campgrounds })
      }
    }, 800)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [stops])

  return pois
}
