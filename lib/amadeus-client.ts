// Amadeus for Developers API client
// Sign up at https://developers.amadeus.com/ for free sandbox access (10K calls/month)

const AMADEUS_BASE = 'https://test.api.amadeus.com' // Use https://api.amadeus.com for production

interface AmadeusToken {
  access_token: string
  expires_at: number
}

let cachedToken: AmadeusToken | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token
  }
  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID!,
      client_secret: process.env.AMADEUS_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error(`Amadeus auth failed: ${res.statusText}`)
  const data = await res.json()
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.access_token
}

async function amadeusGet(path: string, params: Record<string, string> = {}) {
  const token = await getAccessToken()
  const url = new URL(`${AMADEUS_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Amadeus ${path} failed: ${err}`)
  }
  return res.json()
}

export async function searchHotelsByCity(cityCode: string) {
  // cityCode is IATA city code, e.g. "CHI" for Chicago
  const data = await amadeusGet('/v1/reference-data/locations/hotels/by-city', {
    cityCode,
    radius: '5',
    radiusUnit: 'KM',
    hotelSource: 'ALL',
  })
  return (data.data || []).slice(0, 10)
}

export async function getHotelOffers(hotelIds: string[], checkIn: string, checkOut: string, adults: number) {
  const data = await amadeusGet('/v2/shopping/hotel-offers', {
    hotelIds: hotelIds.slice(0, 5).join(','),
    checkInDate: checkIn,
    checkOutDate: checkOut,
    adults: String(adults),
    currency: 'USD',
    bestRateOnly: 'true',
  })
  return data.data || []
}

// Map city name to IATA city code for Amadeus
export const CITY_TO_IATA: Record<string, string> = {
  'Chicago': 'CHI',
  'Indianapolis': 'IND',
  'Louisville': 'SDF',
  'Nashville': 'BNA',
  'Atlanta': 'ATL',
  'Miami': 'MIA',
  'New York': 'NYC',
  'Philadelphia': 'PHL',
  'Washington DC': 'WAS',
  'Charlotte': 'CLT',
  'Dallas': 'DFW',
  'Houston': 'HOU',
  'San Antonio': 'SAT',
  'Austin': 'AUS',
  'New Orleans': 'MSY',
  'Memphis': 'MEM',
  'St. Louis': 'STL',
  'Kansas City': 'MKC',
  'Denver': 'DEN',
  'Phoenix': 'PHX',
  'Las Vegas': 'LAS',
  'Los Angeles': 'LAX',
  'San Francisco': 'SFO',
  'Seattle': 'SEA',
  'Portland': 'PDX',
}
