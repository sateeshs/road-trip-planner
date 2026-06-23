// City coordinate lookup — used to resolve city names to lat/lng for ORS API calls.
// ORS provides real road distances and times; the haversine heuristic has been removed.

export const US_MAJOR_CITIES: Record<string, { lat: number; lng: number; state: string }> = {
  'Chicago': { lat: 41.8781, lng: -87.6298, state: 'IL' },
  'Indianapolis': { lat: 39.7684, lng: -86.1581, state: 'IN' },
  'Louisville': { lat: 38.2527, lng: -85.7585, state: 'KY' },
  'Nashville': { lat: 36.1627, lng: -86.7816, state: 'TN' },
  'Atlanta': { lat: 33.7490, lng: -84.3880, state: 'GA' },
  'Miami': { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'New York': { lat: 40.7128, lng: -74.0060, state: 'NY' },
  'Philadelphia': { lat: 39.9526, lng: -75.1652, state: 'PA' },
  'Washington DC': { lat: 38.9072, lng: -77.0369, state: 'DC' },
  'Charlotte': { lat: 35.2271, lng: -80.8431, state: 'NC' },
  'Dallas': { lat: 32.7767, lng: -96.7970, state: 'TX' },
  'Houston': { lat: 29.7604, lng: -95.3698, state: 'TX' },
  'San Antonio': { lat: 29.4241, lng: -98.4936, state: 'TX' },
  'Austin': { lat: 30.2672, lng: -97.7431, state: 'TX' },
  'New Orleans': { lat: 29.9511, lng: -90.0715, state: 'LA' },
  'Memphis': { lat: 35.1495, lng: -90.0490, state: 'TN' },
  'St. Louis': { lat: 38.6270, lng: -90.1994, state: 'MO' },
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
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Resolve a city name to coordinates.
 *  Strips optional state suffix ("Austin, TX" → "Austin"), normalises case.
 *  Returns null if city is unknown.
 */
export function cityCoords(city: string): { lat: number; lng: number; state: string } | null {
  // Strip trailing ", ST" or " ST" state suffixes the model sometimes appends
  const stripped = city.replace(/,?\s+[A-Z]{2}$/, '').trim()
  // Try exact match first, then case-insensitive
  const exact = US_MAJOR_CITIES[stripped]
  if (exact) return exact
  const lower = stripped.toLowerCase()
  const entry = Object.entries(US_MAJOR_CITIES).find(
    ([k]) => k.toLowerCase() === lower
  )
  return entry ? entry[1] : null
}
