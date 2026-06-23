// Foursquare Places API — 100K requests/month free
// Sign up at https://foursquare.com/developers/

const FSQ_BASE = 'https://api.foursquare.com/v3'

/** Core attraction categories */
export const ATTRACTION_CATEGORIES = {
  landmarks: '16000',
  museums: '10027',
  parks: '16032',
  restaurants: '13000',
  entertainment: '10000',
  shopping: '17000',
}

/**
 * Surroundings / outdoor activity categories.
 * Each key maps to a Foursquare category ID (or comma-joined list for multi-category searches).
 */
export const SURROUNDINGS_CATEGORIES = {
  // Outdoor activities
  camping:       '16026',          // Campgrounds
  kayaking:      '18008',          // Kayak / Canoe
  hiking:        '16032,16017',    // Parks + Trails
  cycling:       '18001',          // Bike Trails / Rentals
  atv_rides:     '18002',          // Off-road / ATV
  horseback:     '18011',          // Horseback riding
  rock_climbing: '18010',          // Climbing areas
  fishing:       '18005',          // Fishing spots
  swimming:      '18006,16028',    // Swimming holes + Lakes
  skiing:        '18009',          // Ski resorts / slopes
  // Water activities
  rafting:       '18008,18014',    // Rafting / River activities
  boating:       '18004',          // Boat rentals / marinas
  // Scenic
  scenic_views:  '16017',          // Lookouts / scenic viewpoints
  nature_reserve:'16032',          // Nature reserves / wildlife areas
  waterfalls:    '16032,16017',    // Parks with waterfalls
} as const

export type SurroundingsCategory = keyof typeof SURROUNDINGS_CATEGORIES

/** All available user-selectable surroundings categories with display labels and icons */
export const SURROUNDINGS_OPTIONS: Array<{
  key: SurroundingsCategory
  label: string
  emoji: string
  description: string
}> = [
  { key: 'camping',       label: 'Camping',         emoji: '⛺', description: 'Campgrounds & RV parks' },
  { key: 'kayaking',      label: 'Kayaking',         emoji: '🚣', description: 'Kayak & canoe rentals' },
  { key: 'hiking',        label: 'Hiking',           emoji: '🥾', description: 'Trails & parks' },
  { key: 'cycling',       label: 'Cycling',          emoji: '🚴', description: 'Bike trails & rentals' },
  { key: 'atv_rides',     label: 'ATV / Off-Road',   emoji: '🏍️', description: 'Off-road & ATV adventures' },
  { key: 'horseback',     label: 'Horseback',        emoji: '🐴', description: 'Horseback riding' },
  { key: 'rock_climbing', label: 'Rock Climbing',    emoji: '🧗', description: 'Climbing areas & gyms' },
  { key: 'fishing',       label: 'Fishing',          emoji: '🎣', description: 'Fishing spots & charters' },
  { key: 'swimming',      label: 'Swimming',         emoji: '🏊', description: 'Swimming holes & lakes' },
  { key: 'rafting',       label: 'Rafting',          emoji: '🌊', description: 'River rafting & tubing' },
  { key: 'boating',       label: 'Boating',          emoji: '⛵', description: 'Boat rentals & marinas' },
  { key: 'scenic_views',  label: 'Scenic Views',     emoji: '🏔️', description: 'Lookouts & viewpoints' },
  { key: 'skiing',        label: 'Skiing',           emoji: '⛷️', description: 'Ski resorts & slopes' },
  { key: 'waterfalls',    label: 'Waterfalls',       emoji: '💦', description: 'Waterfall hikes & parks' },
]

export interface FoursquarePlace {
  fsq_id: string
  name: string
  categories: Array<{ id: number; name: string; icon: { prefix: string; suffix: string } }>
  location: { formatted_address: string; locality: string; region: string }
  geocodes: { main: { latitude: number; longitude: number } }
  rating?: number
  description?: string
  website?: string
  photos?: Array<{ prefix: string; suffix: string; width: number; height: number }>
}

async function fsqFetch(url: URL): Promise<FoursquarePlace[]> {
  url.searchParams.set('fields', 'fsq_id,name,categories,location,geocodes,rating,description,website')
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: process.env.FOURSQUARE_API_KEY!,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Foursquare search failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.results || []
}

/** Search general attractions (landmarks, museums, etc.) near a city */
export async function searchAttractions(
  city: string,
  state: string,
  categories: string[] = ['16000', '10027', '16032'],
  limit = 6
): Promise<FoursquarePlace[]> {
  const url = new URL(`${FSQ_BASE}/places/search`)
  url.searchParams.set('query', 'attractions things to do')
  url.searchParams.set('near', `${city}, ${state}`)
  url.searchParams.set('categories', categories.join(','))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('sort', 'RATING')
  return fsqFetch(url)
}

/**
 * Search outdoor/surroundings activities near a city stop.
 * Accepts one or more SurroundingsCategory keys.
 */
export async function searchSurroundings(
  city: string,
  state: string,
  activityKeys: SurroundingsCategory[],
  limit = 8
): Promise<FoursquarePlace[]> {
  // Collect all FSQ category IDs for the requested activity types
  const catIds = activityKeys
    .flatMap(k => SURROUNDINGS_CATEGORIES[k].split(','))
    .filter((v, i, arr) => arr.indexOf(v) === i)   // deduplicate

  // Build a descriptive search query from activity names for better relevance
  const queryTerms = activityKeys.map(k =>
    SURROUNDINGS_OPTIONS.find(o => o.key === k)?.label ?? k
  ).join(' ')

  const url = new URL(`${FSQ_BASE}/places/search`)
  url.searchParams.set('query', queryTerms)
  url.searchParams.set('near', `${city}, ${state}`)
  url.searchParams.set('categories', catIds.join(','))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('sort', 'RATING')
  url.searchParams.set('radius', '50000')  // 50km radius for outdoor activities
  return fsqFetch(url)
}
