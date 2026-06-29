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

/**
 * A user-saved activity from the attractions or surroundings list.
 * Inspired by TREK's "place pool" concept, adapted for client-side-only storage.
 */
export interface PlanActivity {
  id: string                            // attraction/surroundings id
  name: string
  category: string
  emoji?: string                        // pre-computed emoji for the category
  city: string                          // which stop city it belongs to
  state: string
  checkIn: string                       // stop check-in date (for display)
  checkOut: string                      // stop check-out date (for display)
  coordinates: { lat: number; lng: number }
  address?: string
  website?: string
  notes?: string                        // user-added note
  type: 'attraction' | 'outdoor'        // which tab it came from
  savedAt: string                       // ISO datetime
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

// ─── AI SDK tool-invocation part types ─────────────────────────────────────

export interface ToolInvocationPart {
  type: 'tool-invocation'
  toolInvocation: {
    toolName: string
    toolCallId: string
    state: 'call' | 'partial-call' | 'result'
    result?: unknown
    args?: unknown
  }
}

// Return shapes from each AI tool — used by chat-ui card components

export interface SuggestRouteStopsResult {
  stops: RouteStop[]
  routeGeometry: RouteGeometry | null
  totalDistance: string | null
  totalDuration: string | null
  message: string
}

export interface SearchAttractionsResult {
  attractions: Attraction[]
  city: string
}

export interface SearchHotelsResult {
  hotels: Hotel[]
  city: string
  checkIn: string
  checkOut: string
}

export interface SearchSurroundingsResult {
  surroundings: Attraction[]
  city: string
  activities: string[]
}

export interface SearchRestaurantsResult {
  restaurants: Attraction[]
  city: string
}

export interface RenderUiResult {
  component: 'route_summary' | 'hotel_comparison' | 'day_plan' | 'booking_confirmed' | 'trip_stats'
  title: string
  data: Record<string, unknown>
}
