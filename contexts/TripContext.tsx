'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useChat } from 'ai/react'
import type { BookingSummary } from '@/components/BookingReviewModal'
import type { RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry, ConfirmedReservation } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'
import { useProactivePlaces } from '@/hooks/useProactivePlaces'
import { reverseGeocode } from '@/lib/route-utils'
import { optimizeRoute } from '@/lib/route-optimizer'
import type { ProactivePOIs } from '@/hooks/useProactivePlaces'
import type { Message } from 'ai'

// ─── Shape ─────────────────────────────────────────────────────────────────

interface MapMenu {
  lat: number
  lng: number
  x: number
  y: number
  resolving: boolean
  city: string | null
  state: string | null
}

export interface TripContextValue {
  // Route
  stops: RouteStop[]
  routeGeometry: RouteGeometry | null
  totalDistance: string | null
  totalDuration: string | null

  // Per-city POI data
  hotelsByCity: Record<string, Hotel[]>
  attractionsByCity: Record<string, Attraction[]>
  surroundingsByCity: Record<string, Attraction[]>
  isSurroundingsLoading: boolean

  // Flat lists for map markers
  allHotels: Hotel[]
  allAttractions: Attraction[]
  allSurroundings: Attraction[]

  // Selection / UI
  selectedStop: RouteStop | null
  setSelectedStop: (stop: RouteStop | null) => void

  // Reservations
  confirmedReservations: ConfirmedReservation[]
  bookingSummary: BookingSummary | null
  setBookingSummary: (s: BookingSummary | null) => void
  itineraryOpen: boolean
  setItineraryOpen: (open: boolean) => void

  // Chat (ai/react)
  messages: Message[]
  input: string
  isLoading: boolean
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  setInput: (v: string) => void
  append: ReturnType<typeof useChat>['append']

  // Right-click map menu
  mapMenu: MapMenu | null
  setMapMenu: (m: MapMenu | null) => void

  // Collapsible chat panel
  chatCollapsed: boolean
  setChatCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void

  // Proactive POIs (gas, food, restrooms, campgrounds)
  proactivePois: ProactivePOIs

  // Handlers
  handleExploreSurroundings: (city: string, state: string, categories: SurroundingsCategory[]) => Promise<void>
  handleMapRightClick: (lat: number, lng: number, x: number, y: number) => Promise<void>
  handleAddStop: () => Promise<void>
  handleRemoveStop: (stop: RouteStop) => Promise<void>
  handleConfirmBooking: (summary: BookingSummary) => void
  handleCancelReservation: (id: string) => void
  handleReservationStatusChange: (id: string, status: ConfirmedReservation['status']) => void
  handleOptimizeRoute: () => void
  isOptimizing: boolean
}

// ─── Context ────────────────────────────────────────────────────────────────

const TripContext = createContext<TripContextValue | null>(null)

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error('useTripContext must be used inside <TripProvider>')
  return ctx
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Finds the stop whose city name best matches the AI-provided city string.
 * The AI often uses a nearby city name instead of the exact stop name
 * (e.g. "Munising" for a "Pictured Rocks" stop, or "Sault Ste. Marie" for "Soo Locks").
 * Matching logic: exact → prefix → word overlap.
 */
function findMatchingStop(stops: RouteStop[], aiCity: string): RouteStop | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const key = norm(aiCity)
  // 1. Exact match
  const exact = stops.find(s => norm(s.city) === key)
  if (exact) return exact
  // 2. One contains the other
  const contains = stops.find(s => key.includes(norm(s.city)) || norm(s.city).includes(key))
  if (contains) return contains
  // 3. Any word overlap
  const aiWords = key.split(/\s+/).filter(w => w.length > 2)
  return stops.find(s => aiWords.some(w => norm(s.city).includes(w)))
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function TripProvider({ children }: { children: ReactNode }) {
  // ── Route state ──
  const [stops, setStops] = useState<RouteStop[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [totalDistance, setTotalDistance] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState<string | null>(null)

  // ── Per-city POI state ──
  const [hotelsByCity, setHotelsByCity] = useState<Record<string, Hotel[]>>({})
  const [attractionsByCity, setAttractionsByCity] = useState<Record<string, Attraction[]>>({})
  const [surroundingsByCity, setSurroundingsByCity] = useState<Record<string, Attraction[]>>({})
  const [isSurroundingsLoading, setIsSurroundingsLoading] = useState(false)

  // ── Selection / UI state ──
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [confirmedReservations, setConfirmedReservations] = useState<ConfirmedReservation[]>([])
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [mapMenu, setMapMenu] = useState<MapMenu | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  // ── Proactive POIs ──
  const proactivePois = useProactivePlaces(stops)

  // ── Chat ──
  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setInput } = useChat({
    api: '/api/chat',
  })

  // ── Process tool results from AI messages ──
  // AI SDK 4.x: tool results are in message.parts with type='tool-invocation', state='result'
  const processedIds = useRef(new Set<string>())
  useEffect(() => {
    for (const msg of messages) {
      if (processedIds.current.has(msg.id)) continue
      const parts = (msg as {
        parts?: Array<{
          type: string
          toolInvocation?: { toolName: string; state: string; result?: unknown }
        }>
      }).parts ?? []

      for (const part of parts) {
        if (part.type !== 'tool-invocation') continue
        const ti = part.toolInvocation
        if (!ti || ti.state !== 'result') continue
        const result = ti.result as Record<string, unknown>

        if (ti.toolName === 'suggest_route_stops') {
          if (result?.stops) setStops(result.stops as RouteStop[])
          if (result?.routeGeometry) setRouteGeometry(result.routeGeometry as RouteGeometry)
          if (result?.totalDistance) setTotalDistance(result.totalDistance as string)
          if (result?.totalDuration) setTotalDuration(result.totalDuration as string)
          if (result?.surroundingsByCity) {
            const byCityRaw = result.surroundingsByCity as Record<string, Attraction[]>
            setSurroundingsByCity(prev => ({ ...prev, ...byCityRaw }))
          }
        }

        if (ti.toolName === 'search_hotels' && result?.hotels && result?.city) {
          const city = result.city as string
          // Store under both the AI-provided name and the canonical stop city name
          // (they can differ, e.g. AI uses "Munising" but stop city is "Pictured Rocks")
          setStops(prev => {
            const matchedStop = findMatchingStop(prev, city)
            setHotelsByCity(h => ({
              ...h,
              [city]: result.hotels as Hotel[],
              ...(matchedStop && matchedStop.city !== city ? { [matchedStop.city]: result.hotels as Hotel[] } : {}),
            }))
            return prev
          })
        }

        if (ti.toolName === 'search_attractions' && result?.attractions && result?.city) {
          const city = result.city as string
          setStops(prev => {
            const matchedStop = findMatchingStop(prev, city)
            setAttractionsByCity(a => ({
              ...a,
              [city]: result.attractions as Attraction[],
              ...(matchedStop && matchedStop.city !== city ? { [matchedStop.city]: result.attractions as Attraction[] } : {}),
            }))
            return prev
          })
        }

        if (ti.toolName === 'explore_surroundings') {
          if (result?.surroundings && result?.city) {
            const city = result.city as string
            setSurroundingsByCity(prev => ({ ...prev, [city]: result.surroundings as Attraction[] }))
          }
          setIsSurroundingsLoading(false)
        }

        if (ti.toolName === 'build_booking_summary' && result?.summary) {
          setBookingSummary(result.summary as BookingSummary)
        }
      }

      if (!isLoading) processedIds.current.add(msg.id)
    }
  }, [messages, isLoading])

  // ── Flat lists for map markers ──
  const allHotels = Object.values(hotelsByCity).flat()
  const allAttractions = Object.values(attractionsByCity).flat()
  const allSurroundings = Object.values(surroundingsByCity).flat()

  // ── Handlers ──

  const handleExploreSurroundings = useCallback(async (city: string, state: string, categories: SurroundingsCategory[]) => {
    setSurroundingsByCity(prev => { const n = { ...prev }; delete n[city]; return n })
    setIsSurroundingsLoading(true)
    await append({ role: 'user', content: `Find ${categories.join(', ')} activities near ${city}, ${state}` })
  }, [append])

  const handleMapRightClick = useCallback(async (lat: number, lng: number, x: number, y: number) => {
    if (isLoading) return
    setMapMenu({ lat, lng, x, y, resolving: true, city: null, state: null })
    try {
      const result = await reverseGeocode(lat, lng)
      setMapMenu(prev => prev ? { ...prev, resolving: false, city: result?.city ?? null, state: result?.state ?? null } : null)
    } catch {
      setMapMenu(prev => prev ? { ...prev, resolving: false } : null)
    }
  }, [isLoading])

  const handleAddStop = useCallback(async () => {
    if (!mapMenu) return
    const { lat, lng, city, state } = mapMenu
    const locationLabel = city && state ? `${city}, ${state}` : `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°W`

    if (stops.length >= 2) {
      const lastStop = stops[stops.length - 1]
      const prevStop = stops[stops.length - 2]
      const provisional: RouteStop = {
        city: city ?? 'New Stop',
        state: state ?? '??',
        coordinates: { lat, lng },
        stayNights: 1,
        checkIn: prevStop.checkOut,
        checkOut: lastStop.checkIn,
        isProvisional: true,
      }
      setStops([...stops.slice(0, -1), provisional, lastStop])
    }

    setMapMenu(null)
    await append({
      role: 'user',
      content: `I right-clicked on the map at ${locationLabel} (coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}). Please add it as a stop on the route, recalculate the full itinerary, find the best hotels and attractions there, and explore the best outdoor activities and surroundings nearby.`,
    })
  }, [mapMenu, stops, append])

  const handleRemoveStop = useCallback(async (stop: RouteStop) => {
    const updatedStops = stops.filter(s => s.city !== stop.city)
    setStops(updatedStops)
    setHotelsByCity(prev => { const n = { ...prev }; delete n[stop.city]; return n })
    setAttractionsByCity(prev => { const n = { ...prev }; delete n[stop.city]; return n })
    setSurroundingsByCity(prev => { const n = { ...prev }; delete n[stop.city]; return n })
    setSelectedStop(null)
    if (updatedStops.length >= 2) {
      const cityList = updatedStops.map(s => `${s.city}, ${s.state}`).join(' → ')
      await append({
        role: 'user',
        content: `Remove ${stop.city}, ${stop.state} from the route and recalculate. Updated stops: ${cityList}`,
      })
    }
  }, [stops, append])

  const handleConfirmBooking = useCallback((summary: BookingSummary) => {
    if (!selectedStop) return
    const reservation: ConfirmedReservation = {
      id: summary.offerId,
      type: 'hotel',
      status: 'pending',
      hotelId: summary.hotelId,
      hotelName: summary.hotelName,
      stopCity: selectedStop.city,
      stopState: selectedStop.state,
      stopCoordinates: selectedStop.coordinates,
      checkIn: summary.checkIn,
      checkOut: summary.checkOut,
      nights: summary.nights,
      roomType: summary.roomType,
      pricePerNight: summary.pricePerNight,
      totalPrice: summary.totalPrice,
      currency: summary.currency,
      cancellationPolicy: summary.cancellationPolicy,
      breakfastIncluded: summary.breakfastIncluded,
      bookingUrl: summary.bookingUrl,
      confirmedAt: new Date().toISOString(),
    }
    setConfirmedReservations(prev => {
      const filtered = prev.filter(r => !(r.stopCity === selectedStop.city && r.hotelId === summary.hotelId))
      return [...filtered, reservation]
    })
    window.open(summary.bookingUrl, '_blank', 'noopener,noreferrer')
    setBookingSummary(null)
    setItineraryOpen(true)
  }, [selectedStop])

  const handleOptimizeRoute = useCallback(() => {
    if (stops.length < 3) return  // need at least origin + 1 intermediate + destination
    const origin = stops[0]
    const destination = stops[stops.length - 1]
    const intermediates = stops.slice(1, -1)

    // Reorder intermediates using nearest-neighbor + 2-opt (TREK RouteCalculator pattern)
    const optimized = optimizeRoute(
      intermediates.map(s => ({ ...s, lat: s.coordinates.lat, lng: s.coordinates.lng })),
      {
        start: { lat: origin.coordinates.lat, lng: origin.coordinates.lng },
        end: { lat: destination.coordinates.lat, lng: destination.coordinates.lng },
      }
    )

    // Check if order actually changed
    const same = optimized.every((s, i) => s.city === intermediates[i].city)
    if (same) return

    // Build new ordered city list and re-run the full AI route planning
    const reorderedCities = [
      `${origin.city}, ${origin.state}`,
      ...optimized.map(s => `${s.city}, ${s.state}`),
      `${destination.city}, ${destination.state}`,
    ]

    setIsOptimizing(true)
    append({
      role: 'user',
      content: `Optimize my route — I've reordered the stops to minimize driving. Please recalculate the itinerary in this order: ${reorderedCities.join(' → ')}`,
    }).finally(() => setIsOptimizing(false))
  }, [stops, append])

  const handleCancelReservation = useCallback((id: string) => {
    setConfirmedReservations(prev => prev.filter(r => r.id !== id))
  }, [])

  const handleReservationStatusChange = useCallback((id: string, status: ConfirmedReservation['status']) => {
    setConfirmedReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }, [])

  const value: TripContextValue = {
    stops,
    routeGeometry,
    totalDistance,
    totalDuration,
    hotelsByCity,
    attractionsByCity,
    surroundingsByCity,
    isSurroundingsLoading,
    allHotels,
    allAttractions,
    allSurroundings,
    selectedStop,
    setSelectedStop,
    confirmedReservations,
    bookingSummary,
    setBookingSummary,
    itineraryOpen,
    setItineraryOpen,
    chatCollapsed,
    setChatCollapsed,
    mapMenu,
    setMapMenu,
    proactivePois,
    messages,
    input,
    isLoading,
    handleInputChange,
    handleSubmit,
    setInput,
    append,
    handleExploreSurroundings,
    handleMapRightClick,
    handleAddStop,
    handleRemoveStop,
    handleConfirmBooking,
    handleCancelReservation,
    handleReservationStatusChange,
    handleOptimizeRoute,
    isOptimizing,
  }

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}
