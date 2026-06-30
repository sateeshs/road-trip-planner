/**
 * Overpass API client for OpenStreetMap data.
 * Races 4 public mirrors via Promise.any() — first to respond wins.
 * Pattern ported from TREK's mapsService.ts overpassFetch().
 */

// ─── Mirrors ────────────────────────────────────────────────────────────────

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OsmElement {
  id: number
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ─── POI cache (5-min TTL, 500-entry FIFO cap, ported from TREK) ────────────

const POI_CACHE = new Map<string, { at: number; elements: OsmElement[] }>()
const POI_CACHE_TTL_MS = 5 * 60 * 1000
export const POI_CACHE_MAX = 500

// ─── Core query function ─────────────────────────────────────────────────────

export async function overpassQuery(ql: string): Promise<OsmElement[]> {
  // Cache check
  const cached = POI_CACHE.get(ql)
  if (cached) {
    if (Date.now() - cached.at < POI_CACHE_TTL_MS) return cached.elements
    POI_CACHE.delete(ql)
  }

  const body = `data=${encodeURIComponent(ql)}`
  const controllers: AbortController[] = []

  const attempt = async (url: string): Promise<OsmElement[]> => {
    const ctrl = new AbortController()
    controllers.push(ctrl)
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url}`)
      const data = await res.json() as { elements?: OsmElement[]; remark?: string }
      // Overpass signals timeout via 'remark' even on HTTP 200
      if (data.remark) throw new Error(`Overpass remark @ ${url}`)
      if (!Array.isArray(data.elements)) throw new Error(`Non-OSM body @ ${url}`)
      return data.elements
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    const elements = await Promise.any(OVERPASS_MIRRORS.map(attempt))
    // Store in cache
    if (POI_CACHE.size >= POI_CACHE_MAX) {
      const oldest = POI_CACHE.keys().next().value
      if (oldest !== undefined) POI_CACHE.delete(oldest)
    }
    POI_CACHE.set(ql, { at: Date.now(), elements })
    return elements
  } catch {
    return []
  } finally {
    // Cancel all losing / in-flight requests
    for (const ctrl of controllers) { try { ctrl.abort() } catch { /* noop */ } }
  }
}
