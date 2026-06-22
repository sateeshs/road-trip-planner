export interface TripPlan {
  origin: string
  destination: string
  startDate: string
  endDate: string
  travelers: { adults: number; children: number }
  interests?: string[]
}

export interface RouteStop {
  city: string
  state: string
  coordinates: { lat: number; lng: number }
  driveTimeFromPrevious?: string   // e.g. "2h 30m"
  driveDistanceFromPrevious?: string // e.g. "145 miles"
  stayNights: number
  checkIn: string   // ISO date
  checkOut: string  // ISO date
}

export interface Attraction {
  id: string
  name: string
  category: string
  rating?: number
  address: string
  coordinates: { lat: number; lng: number }
  description?: string
  photoUrl?: string
  website?: string
}

export interface Hotel {
  hotelId: string
  name: string
  rating?: number        // 1-5
  starRating?: number    // official stars
  address: string
  coordinates: { lat: number; lng: number }
  pricePerNight?: number
  currency?: string
  dealTag?: string       // e.g. "15% off", "Free breakfast"
  amenities?: string[]
  photoUrl?: string
  availableOffers?: HotelOffer[]
}

export interface HotelOffer {
  offerId: string
  roomType: string
  bedType: string
  price: number
  currency: string
  cancellationPolicy: string
  breakfastIncluded: boolean
  bookingUrl?: string
}

export interface BookingRequest {
  hotel: Hotel
  offer: HotelOffer
  stop: RouteStop
  guests: { firstName: string; lastName: string; email: string }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    stops?: RouteStop[]
    attractions?: Attraction[]
    hotels?: Hotel[]
    bookingRequest?: BookingRequest
  }
}
