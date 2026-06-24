'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useChat } from 'ai/react'
import type { BookingSummary } from '@/components/BookingReviewModal'
import type { RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry, ConfirmedReservation, PlanActivity } from '@/types'
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
  // Activity plan (TREK "place pool" concept, client-side)
  planActivities: PlanActivity[]
  planOpen: boolean
  setPlanOpen: (open: boolean) => void
  addToPlan: (attraction: Attraction, stop: RouteStop, type: 'attraction' | 'outdoor') => void
  removeFromPlan: (id: string) => void
  isInPlan: (id: string) => boolean

  // Collaboration / persistence
  tripId: string | null
  membersCount: number
  saveTripToDb: () => Promise<void>
  loadTripFromDb: (id: string) => Promise<void>
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
  const [planActivities, setPlanActivities] = useState<PlanActivity[]>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('rtp:plan') : null
      return stored ? (JSON.parse(stored) as PlanActivity[]) : []
    } catch { return [] }
  })
  const [planOpen, setPlanOpen] = useState(false)

  // ── Collaboration state ──
  const [tripId, setTripId] = useState<string | null>(null)
  const [membersCount, setMembersCount] = useState(1)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist plan to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('rtp:plan', JSON.stringify(planActivities)) } catch { /* quota exceeded */ }
  }, [planActivities])

  // ── Proactive POIs ──
  const proactivePois = useProactivePlaces(stops)

  // ── Chat ──
  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setInput } = useChat({
    api: '/api/chat',
  })

  // ── Keep a ref to latest stops so we can read them inside the effect
  //    without adding `stops` to the dependency array (which would cause
  //    infinite re-renders since we call setStops inside the effect).
  const stopsRef = useRef<RouteStop[]>(stops)
  stopsRef.current = stops

  // ── Process tool results from AI messages ──
  // AI SDK 4.x: tool results are in message.parts with type='tool-invocation', state='result'
  const processedIds = useRef(new Set<string>())
  useEffect(() => {
    for (const msg of messages) {
      if (processedIds.current.has(msg.id)) continue
      type Part = { type: string; toolInvocation?: { toolName: string; state: string; result?: unknown } }
      const parts = (msg as { parts?: Part[] }).parts ?? []

      // ── Pass 1: collect new stops from suggest_route_stops so subsequent
      //    tools (search_attractions, search_hotels) can do city-name fuzzy
      //    matching without relying on React state that may not have committed yet.
      let batchStops: RouteStop[] = stopsRef.current
      for (const part of parts) {
        if (part.type !== 'tool-invocation') continue
        const ti = part.toolInvocation
        if (!ti || ti.state !== 'result') continue
        const result = ti.result as Record<string, unknown>
        if (ti.toolName === 'suggest_route_stops' && result?.stops) {
          batchStops = result.stops as RouteStop[]
        }
      }

      // ── Pass 2: apply all tool results
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
          // Store under both the AI-provided city name AND the canonical stop city name
          // so the bottom sheet finds data regardless of name drift (e.g. AI uses
          // "Munising" but stop.city is "Pictured Rocks")
          const matchedStop = findMatchingStop(batchStops, city)
          setHotelsByCity(h => ({
            ...h,
            [city]: result.hotels as Hotel[],
            ...(matchedStop && matchedStop.city !== city ? { [matchedStop.city]: result.hotels as Hotel[] } : {}),
          }))
        }

        if (ti.toolName === 'search_attractions' && result?.attractions && result?.city) {
          const city = result.city as string
          const matchedStop = findMatchingStop(batchStops, city)
          setAttractionsByCity(a => ({
            ...a,
            [city]: result.attractions as Attraction[],
            ...(matchedStop && matchedStop.city !== city ? { [matchedStop.city]: result.attractions as Attraction[] } : {}),
          }))
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
    if (stops.length < 4) return  // need at least 2 intermediates to reorder
    const origin = stops[0]
    const destination = stops[stops.length - 1]
    const intermediates = stops.slice(1, -1)

    // Reorder intermediates using nearest-neighbor + 2-opt (ported from TREK RouteCalculator)
    const optimized = optimizeRoute(
      intermediates.map(s => ({ ...s, lat: s.coordinates.lat, lng: s.coordinates.lng })),
      {
        start: { lat: origin.coordinates.lat, lng: origin.coordinates.lng },
        end: { lat: destination.coordinates.lat, lng: destination.coordinates.lng },
      }
    )

    const reorderedCities = [
      `${origin.city}, ${origin.state}`,
      ...optimized.map(s => `${s.city}, ${s.state}`),
      `${destination.city}, ${destination.state}`,
    ]

    const changed = optimized.some((s, i) => s.city !== intermediates[i].city)
    const msg = changed
      ? `Optimize my route — reorder stops to minimize driving. Recalculate the itinerary in this order: ${reorderedCities.join(' → ')}`
      : `My route is already optimized: ${reorderedCities.join(' → ')}. Please confirm and show the current itinerary summary.`

    setIsOptimizing(true)
    append({ role: 'user', content: msg }).finally(() => setIsOptimizing(false))
  }, [stops, append])

  // ── Trip persistence ──

  const saveTripToDb = useCallback(async () => {
    // Require session (next-auth) — session is available via fetch /api/auth/session
    const body = {
      title: stops.length >= 2 ? `${stops[0].city} → ${stops[stops.length - 1].city}` : 'New Trip',
      stops,
      routeGeometry,
      totalDistance,
      totalDuration,
      hotelsByCity,
      attractionsByCity,
      surroundingsByCity,
      confirmedReservations,
      planActivities,
    }
    try {
      if (tripId) {
        await fetch(`/api/trips/${tripId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        const res = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          const newId = data.trip?._id as string | undefined
          if (newId) {
            setTripId(newId)
            // Update URL without reload
            const url = new URL(window.location.href)
            url.searchParams.set('trip', newId)
            window.history.replaceState({}, '', url.toString())
          }
        }
      }
    } catch (err) {
      console.error('saveTripToDb error:', err)
    }
  }, [tripId, stops, routeGeometry, totalDistance, totalDuration, hotelsByCity, attractionsByCity, surroundingsByCity, confirmedReservations, planActivities])

  const loadTripFromDb = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/trips/${id}`)
      if (!res.ok) return
      const data = await res.json()
      const t = data.trip
      if (!t) return
      setTripId(id)
      if (t.stops) setStops(t.stops as RouteStop[])
      if (t.routeGeometry) setRouteGeometry(t.routeGeometry as RouteGeometry)
      if (t.totalDistance) setTotalDistance(t.totalDistance as string)
      if (t.totalDuration) setTotalDuration(t.totalDuration as string)
      if (t.hotelsByCity) setHotelsByCity(t.hotelsByCity as Record<string, Hotel[]>)
      if (t.attractionsByCity) setAttractionsByCity(t.attractionsByCity as Record<string, Attraction[]>)
      if (t.surroundingsByCity) setSurroundingsByCity(t.surroundingsByCity as Record<string, Attraction[]>)
      if (t.confirmedReservations) setConfirmedReservations(t.confirmedReservations as ConfirmedReservation[])
      if (t.planActivities) setPlanActivities(t.planActivities as PlanActivity[])
      // Members count = owner + members array length
      const mc = 1 + (Array.isArray(t.members) ? t.members.length : 0)
      setMembersCount(mc)
    } catch (err) {
      console.error('loadTripFromDb error:', err)
    }
  }, [])

  // On mount: check for ?trip= URL param and load the trip
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const tripParam = url.searchParams.get('trip')
    if (tripParam) {
      loadTripFromDb(tripParam)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save 3s after stops change (only when tripId is set or user is signed in with stops ≥ 2)
  useEffect(() => {
    if (stops.length < 2) return
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      // Only save if we already have a tripId (don't auto-create trips silently —
      // creation happens explicitly via saveTripToDb called by user action)
      if (tripId) {
        saveTripToDb()
      }
    }, 3000)
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, tripId])

  const addToPlan = useCallback((attraction: Attraction, stop: RouteStop, type: 'attraction' | 'outdoor') => {
    setPlanActivities(prev => {
      if (prev.some(a => a.id === attraction.id)) return prev  // already saved
      const activity: PlanActivity = {
        id: attraction.id,
        name: attraction.name,
        category: attraction.category,
        city: stop.city,
        state: stop.state,
        checkIn: stop.checkIn,
        checkOut: stop.checkOut,
        coordinates: attraction.coordinates,
        address: attraction.address,
        website: attraction.website,
        type,
        savedAt: new Date().toISOString(),
      }
      return [...prev, activity]
    })
    setPlanOpen(true)
  }, [])

  const removeFromPlan = useCallback((id: string) => {
    setPlanActivities(prev => prev.filter(a => a.id !== id))
  }, [])

  const isInPlan = useCallback((id: string) => {
    return planActivities.some(a => a.id === id)
  }, [planActivities])

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
    planActivities,
    planOpen,
    setPlanOpen,
    addToPlan,
    removeFromPlan,
    isInPlan,
    tripId,
    membersCount,
    saveTripToDb,
    loadTripFromDb,
  }

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}
