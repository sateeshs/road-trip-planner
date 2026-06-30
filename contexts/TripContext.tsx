'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useChat } from 'ai/react'
import type { BookingSummary } from '@/components/BookingReviewModal'
import type { RouteStop, Hotel, Attraction, RouteGeometry, ConfirmedReservation, PlanActivity } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'
import { useProactivePlaces } from '@/hooks/useProactivePlaces'
import { useProactiveNPS } from '@/hooks/useProactiveNPS'
import type { NpsMapMarker } from '@/hooks/useProactiveNPS'
import { reverseGeocode } from '@/lib/route-utils'
import { runNSGAII } from '@/lib/route-optimizer'
import type { ParetoRoute } from '@/lib/route-optimizer'
import { getTimeMatrix, getRoute, metersToMiles, secondsToTime } from '@/lib/osrm-client'
import { scoreStops, buildStopWeights } from '@/lib/stop-scorer'
import type { ProactivePOIs } from '@/hooks/useProactivePlaces'
import type { Message } from 'ai'
import { extractToolResults } from './trip-tool-results'
import type { ToolInvocationPart } from './trip-tool-results'

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
  restaurantsByCity: Record<string, Attraction[]>
  isSurroundingsLoading: boolean

  // Flat lists for map markers
  allHotels: Hotel[]
  allAttractions: Attraction[]
  allSurroundings: Attraction[]
  allRestaurants: Attraction[]

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
  chatError: Error | null
  retryChat: () => void
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

  // Proactive NPS map markers (deterministic, no LLM required)
  npsMarkers: NpsMapMarker[]

  // Handlers
  handleExploreSurroundings: (city: string, state: string, categories: SurroundingsCategory[]) => Promise<void>
  handleMapRightClick: (lat: number, lng: number, x: number, y: number) => Promise<void>
  handleAddStop: () => Promise<void>
  handleRemoveStop: (stop: RouteStop) => Promise<void>
  handleConfirmBooking: (summary: BookingSummary) => void
  handleCancelReservation: (id: string) => void
  handleReservationStatusChange: (id: string, status: ConfirmedReservation['status']) => void
  handleOptimizeRoute: () => Promise<void>
  isOptimizing: boolean
  paretoRoutes: ParetoRoute[] | null
  setParetoRoutes: (r: ParetoRoute[] | null) => void
  handleSelectParetoRoute: (route: ParetoRoute) => Promise<void>
  stopScores: Map<string, import('@/lib/stop-scorer').StopScore> | null
  // Phase 6: user budget
  userBudget: number | null
  setUserBudget: (b: number | null) => void
  // Activity plan (TREK "place pool" concept, client-side)
  planActivities: PlanActivity[]
  planOpen: boolean
  setPlanOpen: (open: boolean) => void
  addToPlan: (attraction: Attraction, stop: RouteStop, type: 'attraction' | 'outdoor') => void
  removeFromPlan: (id: string) => void
  isInPlan: (id: string) => boolean

  // Trip style preferences
  tripStyles: string[]
  toggleTripStyle: (style: string) => void

  // Collaboration / persistence
  tripId: string | null
  membersCount: number
  saveTripToDb: () => Promise<void>
  loadTripFromDb: (id: string) => Promise<void>

  // Per-trip cost estimate
  estimatedTripCost: { min: number; max: number; confirmed: boolean } | null
}

// ─── Context ────────────────────────────────────────────────────────────────

const TripContext = createContext<TripContextValue | null>(null)

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error('useTripContext must be used inside <TripProvider>')
  return ctx
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function TripProvider({ children }: { children: ReactNode }) {
  // Route state
  const [stops, setStops] = useState<RouteStop[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [totalDistance, setTotalDistance] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState<string | null>(null)
  // Per-city POI state
  const [hotelsByCity, setHotelsByCity] = useState<Record<string, Hotel[]>>({})
  const [attractionsByCity, setAttractionsByCity] = useState<Record<string, Attraction[]>>({})
  const [surroundingsByCity, setSurroundingsByCity] = useState<Record<string, Attraction[]>>({})
  const [restaurantsByCity, setRestaurantsByCity] = useState<Record<string, Attraction[]>>({})
  const [isSurroundingsLoading, setIsSurroundingsLoading] = useState(false)
  // Selection / UI state
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [confirmedReservations, setConfirmedReservations] = useState<ConfirmedReservation[]>([])
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)
  const [itineraryOpen, setItineraryOpen] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [mapMenu, setMapMenu] = useState<MapMenu | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [paretoRoutes, setParetoRoutes] = useState<ParetoRoute[] | null>(null)
  const [stopScores, setStopScores] = useState<Map<string, import('@/lib/stop-scorer').StopScore> | null>(null)
  const [userBudget, setUserBudget] = useState<number | null>(null)
  const [planActivities, setPlanActivities] = useState<PlanActivity[]>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('rtp:plan') : null
      return stored ? (JSON.parse(stored) as PlanActivity[]) : []
    } catch { return [] }
  })
  const [planOpen, setPlanOpen] = useState(false)
  // Trip style preferences
  const [tripStyles, setTripStyles] = useState<string[]>([])
  const toggleTripStyle = useCallback((style: string) => {
    setTripStyles(prev =>
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
    )
  }, [])

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

  // ── Proactive NPS markers ──
  const npsMarkers = useProactiveNPS(stops)

  // ── Chat ──
  const { messages, input, handleInputChange, handleSubmit: _handleSubmit, isLoading, append, setInput, reload, error: chatError } = useChat({
    api: '/api/chat',
  })

  // Wrap handleSubmit to always pass current tripStyles at call time.
  // Relying on useChat's `body` option is unreliable — the SDK captures it
  // at mount and may not re-read it when state changes before the first submit.
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      _handleSubmit(e, { body: { tripStyles } })
    },
    [_handleSubmit, tripStyles],
  )

  // ── Auto-retry on LLM error (once, after 3 s) ──
  // reload() re-sends the last user message without adding a duplicate to the chat.
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (chatError && !isLoading && retryCountRef.current === 0) {
      retryCountRef.current = 1
      retryTimerRef.current = setTimeout(() => {
        reload({ body: { tripStyles } })
      }, 3000)
    }
    if (!chatError) {
      retryCountRef.current = 0
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatError, isLoading])

  // Manual retry/resume — called by the "Resume" button in the chat UI.
  const retryChat = useCallback(() => {
    retryCountRef.current = 0
    reload({ body: { tripStyles } })
  }, [reload, tripStyles])

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
      const parts = ((msg as { parts?: ToolInvocationPart[] }).parts ?? [])

      const batch = extractToolResults(parts, stopsRef.current)

      // Apply suggest_route_stops results
      if (batch.newStops) setStops(batch.newStops)
      if (batch.routeGeometry) setRouteGeometry(batch.routeGeometry)
      if (batch.totalDistance) setTotalDistance(batch.totalDistance)
      if (batch.totalDuration) setTotalDuration(batch.totalDuration)
      if (batch.surroundingsByCityPatch) {
        const patch = batch.surroundingsByCityPatch
        setSurroundingsByCity(prev => ({ ...prev, ...patch }))
      }

      // Apply hotel results — store under AI city name AND matched stop city name
      // so the bottom sheet finds data regardless of city-name drift
      for (const { city, hotels, matchedCity } of batch.hotelPatches) {
        setHotelsByCity(h => ({
          ...h,
          [city]: hotels,
          ...(matchedCity ? { [matchedCity]: hotels } : {}),
        }))
      }

      // Apply attraction results
      for (const { city, attractions, matchedCity } of batch.attractionPatches) {
        setAttractionsByCity(a => ({
          ...a,
          [city]: attractions,
          ...(matchedCity ? { [matchedCity]: attractions } : {}),
        }))
      }

      // Apply surroundings results (with fuzzy city matching, same as hotels/attractions)
      for (const { city, surroundings, matchedCity } of batch.surroundingsPatches) {
        setSurroundingsByCity(prev => ({
          ...prev,
          [city]: surroundings,
          ...(matchedCity ? { [matchedCity]: surroundings } : {}),
        }))
      }

      // Apply restaurant results
      for (const { city, restaurants, matchedCity } of batch.restaurantPatches) {
        setRestaurantsByCity(prev => ({
          ...prev,
          [city]: restaurants,
          ...(matchedCity ? { [matchedCity]: restaurants } : {}),
        }))
      }
      if (batch.surroundingsCompleted) setIsSurroundingsLoading(false)

      // Apply booking summary
      if (batch.bookingSummary) setBookingSummary(batch.bookingSummary)

      if (!isLoading) processedIds.current.add(msg.id)
    }
  }, [messages, isLoading])

  // ── Flat lists for map markers ──
  const allHotels = Object.values(hotelsByCity).flat()
  const allAttractions = Object.values(attractionsByCity).flat()
  const allSurroundings = Object.values(surroundingsByCity).flat()
  const allRestaurants = Object.values(restaurantsByCity).flat()

  // ── Per-trip cost estimate (confirmed reservations take precedence; otherwise estimate from hotel prices) ──
  const estimatedTripCost = useMemo((): { min: number; max: number; confirmed: boolean } | null => {
    if (confirmedReservations.length > 0) {
      const total = confirmedReservations.reduce((sum, r) => sum + r.totalPrice, 0)
      return { min: total, max: total, confirmed: true }
    }
    let min = 0
    let max = 0
    for (const stop of stops.slice(1)) {
      const hotels = hotelsByCity[stop.city] ?? []
      const prices = hotels
        .map((h: Hotel) => h.pricePerNight ?? 0)
        .filter((p: number) => p > 0)
        .sort((a: number, b: number) => a - b)
      if (prices.length === 0) continue
      const nights = stop.stayNights || 1
      min += prices[0] * nights
      max += prices[Math.min(2, prices.length - 1)] * nights
    }
    return min > 0 ? { min, max, confirmed: false } : null
  }, [stops, hotelsByCity, confirmedReservations])

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
    setRestaurantsByCity(prev => { const n = { ...prev }; delete n[stop.city]; return n })
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

  const handleOptimizeRoute = useCallback(async () => {
    if (stops.length < 2) return
    const origin = stops[0]
    const destination = stops[stops.length - 1]
    const intermediates = stops.slice(1, -1)

    setIsOptimizing(true)
    try {
      // ── Phase 5: branch by intermediate count ──────────────────────────────

      // 0 intermediates — ask LLM to suggest the best stops for this corridor
      if (intermediates.length === 0) {
        append({
          role: 'user',
          content:
            `I'm planning a road trip from ${origin.city}, ${origin.state} to ${destination.city}, ${destination.state}. ` +
            `Please suggest the best 1–3 intermediate stops to make this a great road trip. ` +
            `Pick stops that are well-positioned along the route corridor, have interesting attractions, and good hotel options. ` +
            `Then plan the full itinerary with your recommended stops.`,
        })
        return
      }

      // 1 intermediate — score it; send AI message based on quality
      if (intermediates.length === 1) {
        const stop = intermediates[0]
        const [score] = scoreStops({
          stops: [{
            id: stop.city,
            lat: stop.coordinates.lat,
            lng: stop.coordinates.lng,
            attractionCount: attractionsByCity[stop.city]?.length ?? 0,
            hotelCount: hotelsByCity[stop.city]?.length ?? 0,
            avgHotelPrice: (() => {
              const h = hotelsByCity[stop.city]
              if (!h || h.length === 0) return 0
              const prices = h.map(x => x.pricePerNight ?? 0).filter(p => p > 0)
              return prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
            })(),
          }],
          origin: { lat: origin.coordinates.lat, lng: origin.coordinates.lng },
          destination: { lat: destination.coordinates.lat, lng: destination.coordinates.lng },
          routeGeometry: routeGeometry ?? undefined,
        })

        const isWellPositioned = score.totalScore >= 55
        const corridorNote = score.breakdown.corridorAlignment < 35
          ? `The stop appears to be significantly off the main driving corridor (alignment score: ${score.breakdown.corridorAlignment}/100).`
          : score.breakdown.corridorAlignment < 55
            ? `The stop is somewhat off the main corridor (alignment score: ${score.breakdown.corridorAlignment}/100).`
            : ''

        if (isWellPositioned) {
          append({
            role: 'user',
            content:
              `My route is ${origin.city} → ${stop.city} → ${destination.city}. ` +
              `${stop.city} scores ${score.totalScore}/100 for stop quality (attractions: ${score.breakdown.attractionDensity}/100, ` +
              `hotels: ${score.breakdown.hotelQuality}/100, corridor fit: ${score.breakdown.corridorAlignment}/100). ` +
              `This looks like a solid stop. Please confirm this is a good routing choice and recalculate the complete itinerary.`,
          })
        } else {
          append({
            role: 'user',
            content:
              `I'm considering ${origin.city} → ${stop.city} → ${destination.city}. ` +
              `${stop.city} scores ${score.totalScore}/100 for stop quality. ${corridorNote} ` +
              `Attractions score: ${score.breakdown.attractionDensity}/100, hotels: ${score.breakdown.hotelQuality}/100. ` +
              `Please evaluate whether ${stop.city} is worth the detour for what it offers, ` +
              `or suggest a better-positioned alternative along this corridor. ` +
              `Then recalculate the full itinerary with your recommendation.`,
          })
        }
        return
      }

      // 2–8 intermediates — NSGA-II with standard parameters
      // 9+ intermediates — NSGA-II with larger population + generations
      const isLargeRoute = intermediates.length >= 9
      const populationSize = isLargeRoute ? 200 : 120
      const generations    = isLargeRoute ? 400 : 200

      // Build OSRM time matrix for all stops
      const matrixStops = stops.map(s => ({
        id: s.city,
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
      }))
      const timeMatrix = await getTimeMatrix(matrixStops).catch(() => null)

      const toStopWithId = (s: RouteStop) => ({
        ...s,
        id: s.city,
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
      })

      const candidatePool = intermediates.map(toStopWithId)

      const attractionCounts = new Map<string, number>(
        intermediates.map(s => [s.city, attractionsByCity[s.city]?.length ?? 0])
      )
      const hotelPriceByCity = new Map<string, number>(
        intermediates.map(s => {
          const hotels = hotelsByCity[s.city]
          const price = hotels && hotels.length > 0 ? hotels[0].pricePerNight ?? 120 : 120
          return [s.city, price]
        })
      )
      const stayNightsByCity = new Map<string, number>(
        intermediates.map(s => [s.city, s.stayNights ?? 1])
      )

      // Phase 4: score stops → weighted NSGA-II sampling
      const scores = scoreStops({
        stops: intermediates.map(s => ({
          id: s.city,
          lat: s.coordinates.lat,
          lng: s.coordinates.lng,
          attractionCount: attractionsByCity[s.city]?.length ?? 0,
          hotelCount: hotelsByCity[s.city]?.length ?? 0,
          avgHotelPrice: (() => {
            const h = hotelsByCity[s.city]
            if (!h || h.length === 0) return 0
            const prices = h.map(x => x.pricePerNight ?? 0).filter(p => p > 0)
            return prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
          })(),
        })),
        origin: { lat: origin.coordinates.lat, lng: origin.coordinates.lng },
        destination: { lat: destination.coordinates.lat, lng: destination.coordinates.lng },
        routeGeometry: routeGeometry ?? undefined,
      })
      const stopWeights = buildStopWeights(scores)

      // Phase 6: activities cost per city ($25/saved activity)
      const activitiesByCity = new Map<string, number>()
      for (const act of planActivities) {
        activitiesByCity.set(act.city, (activitiesByCity.get(act.city) ?? 0) + 1)
      }

      const result = runNSGAII({
        candidatePool,
        origin: toStopWithId(origin),
        destination: toStopWithId(destination),
        timeMatrix,
        attractionCounts,
        hotelPriceByCity,
        stayNightsByCity,
        stopWeights,
        activitiesByCity,
        populationSize,
        generations,
      })

      const scoresMap = new Map(scores.map(s => [s.id, s]))
      setStopScores(scoresMap)
      setParetoRoutes(result)
    } finally {
      setIsOptimizing(false)
    }
  }, [stops, attractionsByCity, hotelsByCity, routeGeometry, planActivities, append])

  const handleSelectParetoRoute = useCallback(async (route: ParetoRoute) => {
    setParetoRoutes(null)
    const origin = stops[0]
    const destination = stops[stops.length - 1]

    // Resolve ordered RouteStop objects for the selected variant
    // Note: toStopWithId() sets id = s.city, so s.id is the city name
    const orderedStops: RouteStop[] = [
      origin,
      ...route.intermediates.map(s => stops.find(stop => stop.city === s.id) ?? origin),
      destination,
    ]

    // Directly recompute the OSRM route — no AI call needed.
    // Relying on append() here caused the AI to respond with text on the second
    // optimization instead of calling suggest_route_stops, leaving the map stale.
    try {
      setIsOptimizing(true)
      const waypoints = orderedStops.map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng }))
      const osrmResult = await getRoute(waypoints)

      // Rebuild stops with updated per-leg drive time / distance / road info
      const newStops: RouteStop[] = orderedStops.map((stop, i) => {
        if (i === 0) return stop
        const seg = osrmResult.segments[i - 1]
        return {
          ...stop,
          driveTimeFromPrevious:     seg ? secondsToTime(seg.duration)   : stop.driveTimeFromPrevious,
          driveDistanceFromPrevious: seg ? metersToMiles(seg.distance)    : stop.driveDistanceFromPrevious,
          roadName: seg?.roadName,
          hasToll:  seg?.hasToll,
        }
      })

      setStops(newStops)
      setRouteGeometry(osrmResult.geometry)
      setTotalDistance(metersToMiles(osrmResult.totalDistance))
      setTotalDuration(secondsToTime(osrmResult.totalDuration))
    } catch (err) {
      console.error('[Pareto] OSRM recalculation failed, falling back to AI:', err)
      // Fallback: ask the AI explicitly — last resort only
      const cityList = [
        `${origin.city}, ${origin.state}`,
        ...route.intermediates.map(s => {
          const match = stops.find(stop => stop.city === s.id)
          return match ? `${match.city}, ${match.state}` : s.id
        }),
        `${destination.city}, ${destination.state}`,
      ]
      append({
        role: 'user',
        content: `I selected the "${route.label}" route variant. Call suggest_route_stops immediately with these stops in order: ${cityList.join(' → ')}`,
      })
    } finally {
      setIsOptimizing(false)
    }
  }, [stops, append])

  // ── Trip persistence ──
  const saveTripToDb = useCallback(async () => {
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

  // Phase 6: detect budget mentions in user messages ("budget of $500", "only $1,000", etc.)
  // Only updates if user hasn't manually overridden via setUserBudget.
  useEffect(() => {
    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length === 0) return
    const last = userMessages[userMessages.length - 1]
    const text = typeof last.content === 'string' ? last.content : ''
    const hasBudgetWord = /\b(budget|afford|spend|spending|cost|limit|total|max)\b/i.test(text)
    if (!hasBudgetWord) return
    const amounts = [...text.matchAll(/\$\s*([\d,]+)/g)]
      .map(m => parseInt(m[1].replace(/,/g, ''), 10))
      .filter(n => n >= 100)
    if (amounts.length > 0) {
      setUserBudget(Math.max(...amounts))
    }
  }, [messages])

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
    restaurantsByCity,
    isSurroundingsLoading,
    allHotels,
    allAttractions,
    allSurroundings,
    allRestaurants,
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
    npsMarkers,
    messages,
    input,
    isLoading,
    chatError: chatError ?? null,
    retryChat,
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
    paretoRoutes,
    setParetoRoutes,
    handleSelectParetoRoute,
    stopScores,
    userBudget,
    setUserBudget,
    planActivities,
    planOpen,
    setPlanOpen,
    addToPlan,
    removeFromPlan,
    isInPlan,
    tripStyles,
    toggleTripStyle,
    tripId,
    membersCount,
    saveTripToDb,
    loadTripFromDb,
    estimatedTripCost,
  }

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}
