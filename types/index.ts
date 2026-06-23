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
  driveTimeFromPrevious?: string    // e.g. "2h 35m" — from ORS real road data
  driveDistanceFromPrevious?: string // e.g. "145 miles" — from ORS real road data
  roadName?: string                  // e.g. "I-65 S · US-31 N" — dominant highway on leg
  hasToll?: boolean                  // true if leg passes through a toll road
  stayNights: number
  checkIn: string   // ISO date
  checkOut: string  // ISO date
  isProvisional?: boolean           // true while AI is processing a map-click stop
}

/** Full driving route geometry from ORS — [lat, lng] pairs ready for Leaflet */
export type RouteGeometry = [number, number][]

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

/**
 * A confirmed (or pending) hotel reservation — ported from TREK's Reservation model.
 * Stored client-side after user confirms in the BookingReviewModal.
 */
export interface ConfirmedReservation {
  id: string                  // offerId — unique per booking
  type: 'hotel'               // extendable later for flights, car rentals
  status: 'pending' | 'confirmed'
  hotelId: string
  hotelName: string
  stopCity: string
  stopState: string
  stopCoordinates: { lat: number; lng: number }
  checkIn: string             // ISO date
  checkOut: string            // ISO date
  nights: number
  roomType: string
  pricePerNight: number
  totalPrice: number
  currency: string
  cancellationPolicy: string
  breakfastIncluded: boolean
  bookingUrl: string
  confirmedAt: string         // ISO datetime
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
