// Approximate driving times between major US cities using straight-line distance heuristic.
// In production these would come from a routing API.

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
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function estimateDriveTime(fromCity: string, toCity: string): { time: string; miles: string } {
  const from = US_MAJOR_CITIES[fromCity]
  const to = US_MAJOR_CITIES[toCity]
  if (!from || !to) return { time: 'Unknown', miles: 'Unknown' }
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng)
  const miles = Math.round(km * 0.621371)
  // Road distance is ~20% longer than straight-line; average highway speed ~65mph
  const roadMiles = Math.round(miles * 1.2)
  const hours = roadMiles / 65
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return { time: `${h}h ${m}m`, miles: `${roadMiles} miles` }
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
