interface CityInfo { lat: number; lng: number; state: string }

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
  'Salt Lake City': { lat: 40.7608, lng: -111.8910, state: 'UT' },
  'Boise': { lat: 43.6150, lng: -116.2023, state: 'ID' },
  'Tucson': { lat: 32.2226, lng: -110.9747, state: 'AZ' },
  'Sacramento': { lat: 38.5816, lng: -121.4944, state: 'CA' },
  'San Diego': { lat: 32.7157, lng: -117.1611, state: 'CA' },
  'Milwaukee': { lat: 43.0389, lng: -87.9065, state: 'WI' },
  'Madison': { lat: 43.0731, lng: -89.4012, state: 'WI' },
  'Grand Rapids': { lat: 42.9634, lng: -85.6681, state: 'MI' },
  'Lansing': { lat: 42.7325, lng: -84.5555, state: 'MI' },
  'Ann Arbor': { lat: 42.2808, lng: -83.7430, state: 'MI' },
  'Flint': { lat: 43.0125, lng: -83.6875, state: 'MI' },
  'Traverse City': { lat: 44.7631, lng: -85.6206, state: 'MI' },
  'Northville': { lat: 42.4312, lng: -83.4832, state: 'MI' },
  'Northville MI': { lat: 42.4312, lng: -83.4832, state: 'MI' },
  'Marquette': { lat: 46.5436, lng: -87.3954, state: 'MI' },
  'Munising': { lat: 46.4110, lng: -86.6490, state: 'MI' },
  'Pictured Rocks': { lat: 46.5594, lng: -86.5481, state: 'MI' },
  'Soo Locks': { lat: 46.5009, lng: -84.3472, state: 'MI' },
  'Mackinac Island': { lat: 45.8492, lng: -84.6190, state: 'MI' },
  'Mackinaw City': { lat: 45.7767, lng: -84.7276, state: 'MI' },
  'St. Ignace': { lat: 45.8681, lng: -84.7274, state: 'MI' },
}

const cityCache = new Map<string, CityInfo | null>()
let lastNominatimCall = 0

async function nominatimSearch(query: string): Promise<CityInfo | null> {
  const now = Date.now()
  const wait = 1100 - (now - lastNominatimCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastNominatimCall = Date.now()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'road-trip-planner/1.0' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const results = await res.json() as Array<{
    lat: string; lon: string;
    address?: { state_code?: string; state?: string; country_code?: string }
  }>
  const r = results.find(x => x.address?.country_code === 'us') ?? results[0]
  if (!r) return null
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    state: r.address?.state_code?.toUpperCase() ?? '',
  }
}

export async function resolveCityCoords(city: string): Promise<CityInfo | null> {
  const normalized = city.trim()
  if (US_MAJOR_CITIES[normalized]) return US_MAJOR_CITIES[normalized]
  if (cityCache.has(normalized)) return cityCache.get(normalized) ?? null

  // 2-pass Nominatim: with state qualifier first, without second
  const stateMatch = normalized.match(/,\s*([A-Z]{2})$/)
  let result: CityInfo | null = null
  if (stateMatch) {
    result = await nominatimSearch(`${normalized}, United States`)
  } else {
    result = await nominatimSearch(`${normalized}, United States`)
    if (!result) result = await nominatimSearch(normalized)
  }

  cityCache.set(normalized, result)
  return result
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
