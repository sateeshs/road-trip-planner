// Foursquare Places API — 100K requests/month free
// Sign up at https://foursquare.com/developers/

const FSQ_BASE = 'https://api.foursquare.com/v3'

export const ATTRACTION_CATEGORIES = {
  landmarks: '16000',
  museums: '10027',
  parks: '16032',
  restaurants: '13000',
  entertainment: '10000',
  shopping: '17000',
}

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

export async function searchAttractions(
  city: string,
  state: string,
  categories: string[] = ['16000', '10027', '16032'],
  limit = 6
): Promise<FoursquarePlace[]> {
  const query = `${city}, ${state}`
  const url = new URL(`${FSQ_BASE}/places/search`)
  url.searchParams.set('query', 'attractions things to do')
  url.searchParams.set('near', query)
  url.searchParams.set('categories', categories.join(','))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('sort', 'RATING')
  url.searchParams.set('fields', 'fsq_id,name,categories,location,geocodes,rating,description,website')

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: process.env.FOURSQUARE_API_KEY!,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Foursquare search failed: ${res.statusText}`)
  const data = await res.json()
  return data.results || []
}
