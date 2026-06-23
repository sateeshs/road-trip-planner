export const runtime = 'edge'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') ?? '80000'
  const type = searchParams.get('type') ?? 'tourist_attraction'
  const key = process.env.GOOGLE_MAPS_API_KEY

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  if (!key) {
    return Response.json({ places: [] })
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}`

  const res = await fetch(url)
  const data = (await res.json()) as {
    results?: Array<{
      place_id: string
      name: string
      types?: string[]
      rating?: number
      vicinity?: string
      geometry: { location: { lat: number; lng: number } }
      photos?: Array<{ photo_reference: string }>
    }>
  }

  const places = (data.results ?? []).slice(0, 15).map((p) => ({
    id: p.place_id,
    name: p.name,
    category: (p.types?.[0] ?? type).replace(/_/g, ' '),
    rating: p.rating,
    address: p.vicinity,
    coordinates: { lat: p.geometry.location.lat, lng: p.geometry.location.lng },
    photoUrl: p.photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${key}`
      : undefined,
  }))

  return Response.json({ places })
}
