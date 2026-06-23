/**
 * City coordinate resolution.
 * 1. Checks a hardcoded fast cache of major US cities (instant, no network).
 * 2. Falls back to Nominatim (OpenStreetMap geocoding) for any city not in the cache.
 *    Nominatim is free, requires no API key — same philosophy as OSRM routing.
 */

interface CityInfo { lat: number; lng: number; state: string }

// Fast lookup for the most common road-trip cities — avoids a network round-trip
const US_MAJOR_CITIES: Record<string, CityInfo> = {
  'Chicago': { lat: 41.8781, lng: -87.6298, state: 'IL' },
  'Indianapolis': { lat: 39.7684, lng: -86.1581, state: 'IN' },
  'Louisville': { lat: 38.2527, lng: -85.7585, state: 'KY' },
  'Nashville': { lat: 36.1627, lng: -86.7816, state: 'TN' },
  'Atlanta': { lat: 33.7490, lng: -84.3880, state: 'GA' },
  'Miami': { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'New York': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'New York City': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'Philadelphia': { lat: 39.9526, lng: -75.1652, state: 'PA' },
  'Washington DC': { lat: 38.9072, lng: -77.0369, state: 'DC' },
  'Washington': { lat: 38.9072, lng: -77.0369, state: 'DC' },
  'Charlotte': { lat: 35.2271, lng: -80.8431, state: 'NC' },
  'Dallas': { lat: 32.7767, lng: -96.7970, state: 'TX' },
  'Houston': { lat: 29.7604, lng: -95.3698, state: 'TX' },
  'San Antonio': { lat: 29.4241, lng: -98.4936, state: 'TX' },
  'Austin': { lat: 30.2672, lng: -97.7431, state: 'TX' },
  'New Orleans': { lat: 29.9511, lng: -90.0715, state: 'LA' },
  'Memphis': { lat: 35.1495, lng: -90.0490, state: 'TN' },
  'St. Louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
  'Saint Louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
  'Kansas City': { lat: 39.0997, lng: -94.5786, state: 'MO' },
  'Denver': { lat: 39.7392, lng: -104.9903, state: 'CO' },
  'Phoenix': { lat: 33.4484, lng: -112.0740, state: 'AZ' },
  'Las Vegas': { lat: 36.1699, lng: -115.1398, state: 'NV' },
  'Los Angeles': { lat: 34.0522, lng: -118.2437, state: 'CA' },
  'San Francisco': { lat: 37.7749, lng: -122.4194, state: 'CA' },
  'Seattle': { lat: 47.6062, lng: -122.3321, state: 'WA' },
  'Portland': { lat: 45.5231, lng: -122.6765, state: 'OR' },
  'Minneapolis': { lat: 44.9778, lng: -93.2650, state: 'MN' },
  'Detroit': { lat: 42.3314, lng: -83.0458, state: 'MI' },
  'Cleveland': { lat: 41.4993, lng: -81.6944, state: 'OH' },
  'Columbus': { lat: 39.9612, lng: -82.9988, state: 'OH' },
  'Cincinnati': { lat: 39.1031, lng: -84.5120, state: 'OH' },
  'Pittsburgh': { lat: 40.4406, lng: -79.9959, state: 'PA' },
  'Baltimore': { lat: 39.2904, lng: -76.6122, state: 'MD' },
  'Boston': { lat: 42.3601, lng: -71.0589, state: 'MA' },
  'Tampa': { lat: 27.9506, lng: -82.4572, state: 'FL' },
  'Orlando': { lat: 28.5383, lng: -81.3792, state: 'FL' },
  'Jacksonville': { lat: 30.3322, lng: -81.6557, state: 'FL' },
  'Savannah': { lat: 32.0809, lng: -81.0912, state: 'GA' },
  'Richmond': { lat: 37.5407, lng: -77.4360, state: 'VA' },
  'Raleigh': { lat: 35.7796, lng: -78.6382, state: 'NC' },
  'Albuquerque': { lat: 35.0844, lng: -106.6504, state: 'NM' },
  'Oklahoma City': { lat: 35.4676, lng: -97.5164, state: 'OK' },
  'Tulsa': { lat: 36.1540, lng: -95.9928, state: 'OK' },
  'Little Rock': { lat: 34.7465, lng: -92.2896, state: 'AR' },
  'Jackson': { lat: 32.2988, lng: -90.1848, state: 'MS' },
  'Birmingham': { lat: 33.5186, lng: -86.8104, state: 'AL' },
  'Knoxville': { lat: 35.9606, lng: -83.9207, state: 'TN' },
  'Chattanooga': { lat: 35.0456, lng: -85.3097, state: 'TN' },
  'Lexington': { lat: 38.0406, lng: -84.5037, state: 'KY' },
  'Salt Lake City': { lat: 40.7608, lng: -111.8910, state: 'UT' },
  'Boise': { lat: 43.6150, lng: -116.2023, state: 'ID' },
  'Tucson': { lat: 32.2226, lng: -110.9747, state: 'AZ' },
  'Sacramento': { lat: 38.5816, lng: -121.4944, state: 'CA' },
  'San Diego': { lat: 32.7157, lng: -117.1611, state: 'CA' },
  'Anchorage': { lat: 61.2181, lng: -149.9003, state: 'AK' },
  'Honolulu': { lat: 21.3069, lng: -157.8583, state: 'HI' },
  'Milwaukee': { lat: 43.0389, lng: -87.9065, state: 'WI' },
  'Madison': { lat: 43.0731, lng: -89.4012, state: 'WI' },
  'Grand Rapids': { lat: 42.9634, lng: -85.6681, state: 'MI' },
  'Lansing': { lat: 42.7325, lng: -84.5555, state: 'MI' },
  'Ann Arbor': { lat: 42.2808, lng: -83.7430, state: 'MI' },
  'Flint': { lat: 43.0125, lng: -83.6875, state: 'MI' },
  'Traverse City': { lat: 44.7631, lng: -85.6206, state: 'MI' },
  'Marquette': { lat: 46.5436, lng: -87.3954, state: 'MI' },
  'Munising': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks National Lakeshore': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks Cruises': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks National Park': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Mackinac City': { lat: 45.7775, lng: -84.7275, state: 'MI' },
  'Mackinaw City': { lat: 45.7775, lng: -84.7275, state: 'MI' },
  'Sault Ste. Marie': { lat: 46.4953, lng: -84.3453, state: 'MI' },
  'Petoskey': { lat: 45.3737, lng: -84.9553, state: 'MI' },
  'Cadillac': { lat: 44.2520, lng: -85.4011, state: 'MI' },
  'Bay City': { lat: 43.5945, lng: -83.8888, state: 'MI' },
  'Saginaw': { lat: 43.4195, lng: -83.9508, state: 'MI' },
  'Kalamazoo': { lat: 42.2917, lng: -85.5872, state: 'MI' },
  'Holland': { lat: 42.7875, lng: -86.1089, state: 'MI' },
  'Midland': { lat: 43.6156, lng: -84.2472, state: 'MI' },
  'Iron Mountain': { lat: 45.8200, lng: -88.0662, state: 'MI' },
  'Escanaba': { lat: 45.7450, lng: -87.0645, state: 'MI' },
  'Newberry': { lat: 46.3543, lng: -85.5080, state: 'MI' },
  'Paradise': { lat: 46.6345, lng: -85.0162, state: 'MI' },
  'Tahquamenon Falls': { lat: 46.5996, lng: -85.2407, state: 'MI' },
}

// Module-level geocoding cache — avoids re-fetching the same city
const geocodeCache = new Map<string, CityInfo>()

// US state abbreviation → full name (for building precise Nominatim queries)
const STATE_CODE_TO_NAME: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire',
  'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina',
  'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
  'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee',
  'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
  'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
}

/** Strip state suffix ("Austin, TX" → "Austin") and normalize. Returns [name, stateCode]. */
function normalize(city: string): string {
  return city.replace(/,?\s+[A-Z]{2}$/, '').trim()
}

/** Extract state abbreviation from city string if present ("Northville, MI" → "MI") */
function extractState(city: string): string | null {
  const m = city.match(/,?\s+([A-Z]{2})$/)
  return m ? m[1] : null
}

/** Look up in hardcoded table (case-insensitive). */
function fromTable(name: string): CityInfo | null {
  const exact = US_MAJOR_CITIES[name]
  if (exact) return exact
  const lower = name.toLowerCase()
  const entry = Object.entries(US_MAJOR_CITIES).find(([k]) => k.toLowerCase() === lower)
  return entry ? entry[1] : null
}

/**
 * Resolve a city name to coordinates.
 * Tries the hardcoded table first, then Nominatim geocoding.
 * Returns null only if both fail.
 */
export async function resolveCityCoords(city: string): Promise<CityInfo | null> {
  const stateCode = extractState(city)
  const name = normalize(city)

  // 1. Fast hardcoded lookup
  const tableHit = fromTable(name)
  if (tableHit) return tableHit

  // 2. In-memory cache from previous Nominatim calls
  const cacheKey = (stateCode ? `${name},${stateCode}` : name).toLowerCase()
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!

  // 3. Nominatim geocoding — include state in query when available to avoid wrong-state matches
  try {
    const queryStr = stateCode
      ? `${name}, ${STATE_CODE_TO_NAME[stateCode] ?? stateCode}, United States`
      : `${name}, United States`
    const q = encodeURIComponent(queryStr)
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=us`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'road-trip-planner/1.0 (road-trip-planner-blush.vercel.app)' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json() as Array<{
      lat: string; lon: string; display_name: string; address?: { state?: string; state_code?: string }
    }>
    if (!data.length) return null

    const hit = data[0]
    // Extract state abbreviation from display_name or address
    const stateMatch = hit.display_name.match(/,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(?:\d{5},\s*)?United States/)
    const resolvedState = stateCode ?? STATE_NAME_TO_CODE[stateMatch?.[1] ?? ''] ?? '??'

    const info: CityInfo = {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      state: resolvedState,
    }
    geocodeCache.set(cacheKey, info)
    return info
  } catch {
    return null
  }
}

/** Synchronous lookup — hardcoded table only (for backwards compat) */
export function cityCoords(city: string): CityInfo | null {
  return fromTable(normalize(city))
}

// US state name → abbreviation map for Nominatim display_name parsing
const STATE_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
  'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
