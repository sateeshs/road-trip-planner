import { overpassQuery } from './overpass-client'
import { resolveCityCoords } from './route-utils'

export interface Hotel {
  hotelId: string
  name: string
  rating?: number
  address: string
  coordinates: { lat: number; lng: number }
  pricePerNight: number
  currency: string
  dealTag?: string
  amenities: string[]
  availableOffers: HotelOffer[]
}

export interface HotelOffer {
  offerId: string
  roomType: string
  bedType: string
  price: number
  currency: string
  cancellationPolicy: string
  breakfastIncluded: boolean
}

export interface BookingSummaryParams {
  hotelId: string
  hotelName: string
  offerId: string
  roomType: string
  pricePerNight: number
  currency: string
  checkIn: string
  checkOut: string
  adults: number
  cancellationPolicy: string
  breakfastIncluded: boolean
}

const HOTEL_PRICE_TIER: Record<string, number> = {
  hotel: 130, motel: 80, hostel: 50, guest_house: 90,
  apartment: 100, camp_site: 35, caravan_site: 45,
}
const STAR_PRICE = [0, 65, 85, 115, 170, 240]

export function osmAddress(tags: Record<string, string>, city: string): string {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] ?? city,
    tags['addr:postcode'],
  ].filter(Boolean).join(', ')
}

export async function osmHotels(city: string): Promise<Hotel[]> {
  const coords = await resolveCityCoords(city)
  if (!coords) return []
  const { lat, lng } = coords
  const r = 12000
  const ql = `[out:json][timeout:10];
(
  nwr["tourism"~"hotel|motel|hostel|guest_house|apartment"](around:${r},${lat},${lng});
);
out center tags 20;`
  const elements = await overpassQuery(ql)
  const seen = new Set<string>()
  const results: Hotel[] = []

  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    const tags = el.tags ?? {}
    const name = tags.name ?? tags['name:en'] ?? tags.brand
    if (!elLat || !elLng || !name || seen.has(name)) continue
    seen.add(name)

    const type = tags.tourism ?? 'hotel'
    const stars = tags.stars ? Math.min(5, parseInt(tags.stars)) : undefined
    const basePrice = stars
      ? (STAR_PRICE[stars] ?? HOTEL_PRICE_TIER[type] ?? 100)
      : (HOTEL_PRICE_TIER[type] ?? 100)
    const variation = 0.9 + (el.id % 3) * 0.1
    const pricePerNight = Math.round(basePrice * variation)

    const amenities: string[] = []
    if (tags.swimming_pool === 'yes' || tags['amenity:swimming_pool']) amenities.push('Pool')
    if (tags.internet_access === 'wlan' || tags.wifi === 'yes') amenities.push('WiFi')
    if (tags.parking === 'yes' || tags['parking:fee'] === 'no') amenities.push('Parking')
    if (tags.restaurant === 'yes') amenities.push('Restaurant')
    if (tags['access:fitness'] === 'yes' || tags.gym === 'yes') amenities.push('Gym')
    if (tags.bar === 'yes') amenities.push('Bar')
    if (tags['pets:allowed'] === 'yes') amenities.push('Pet-Friendly')

    results.push({
      hotelId: `osm-${el.type}-${el.id}`,
      name,
      rating: stars,
      address: osmAddress(tags, city),
      coordinates: { lat: elLat, lng: elLng },
      pricePerNight,
      currency: 'USD',
      dealTag: el.id % 5 === 0 ? 'Best Value' : undefined,
      amenities,
      availableOffers: [{
        offerId: `osm-offer-${el.id}`,
        roomType: 'Standard Room',
        bedType: 'King',
        price: pricePerNight,
        currency: 'USD',
        cancellationPolicy: 'Non-refundable',
        breakfastIncluded: false,
      }],
    })
    if (results.length >= 5) break
  }
  return results
}

export function buildBookingSummaryPayload(params: BookingSummaryParams): { summary: Record<string, unknown> } {
  const nights = Math.round(
    (new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / (1000 * 60 * 60 * 24)
  )
  const totalPrice = params.pricePerNight * nights
  const bookingUrl = `https://hotels.example.com/book?offerId=${params.offerId}&adults=${params.adults}`
  return {
    summary: {
      hotelId: params.hotelId, hotelName: params.hotelName, offerId: params.offerId,
      roomType: params.roomType, checkIn: params.checkIn, checkOut: params.checkOut,
      nights, adults: params.adults, pricePerNight: params.pricePerNight,
      totalPrice, currency: params.currency, cancellationPolicy: params.cancellationPolicy,
      breakfastIncluded: params.breakfastIncluded, bookingUrl,
    },
  }
}
