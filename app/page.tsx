'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useChat } from 'ai/react'
import ChatPanel from '@/components/ChatPanel'
import MapView from '@/components/MapView'
import StopBottomSheet from '@/components/StopBottomSheet'
import FloatingRouteSummary from '@/components/FloatingRouteSummary'
import MapSuggestions from '@/components/MapSuggestions'
import BookingReviewModal, { type BookingSummary } from '@/components/BookingReviewModal'
import ItineraryPanel from '@/components/ItineraryPanel'
import type { RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry, ConfirmedReservation } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'
import { useProactivePlaces } from '@/hooks/useProactivePlaces'
import { reverseGeocode } from '@/lib/route-utils'

export default function HomePage() {
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [stops, setStops] = useState<RouteStop[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [totalDistance, setTotalDistance] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState<string | null>(null)
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [hotelsByCity, setHotelsByCity] = useState<Record<string, Hotel[]>>({})
  const [attractionsByCity, setAttractionsByCity] = useState<Record<string, Attraction[]>>({})
  const [surroundings, setSurroundings] = useState<Attraction[]>([])
  const [isSurroundingsLoading, setIsSurroundingsLoading] = useState(false)
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)
  const [confirmedReservations, setConfirmedReservations] = useState<ConfirmedReservation[]>([])
  const [itineraryOpen, setItineraryOpen] = useState(false)

  // Map right-click context menu state (TREK useTripPlanner handleMapContextMenu pattern)
  const [mapMenu, setMapMenu] = useState<{
    lat: number; lng: number; x: number; y: number
    resolving: boolean       // waiting for reverse geocode
    city: string | null      // resolved city name
    state: string | null
  } | null>(null)

  const proactivePois = useProactivePlaces(stops)

  // Flat lists for map markers and legend (all cities combined)
  const allHotels = Object.values(hotelsByCity).flat()
  const allAttractions = Object.values(attractionsByCity).flat()

  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setInput } = useChat({
    api: '/api/chat',
  })

  // Process ALL messages whenever the array changes — more reliable than onFinish.
  // AI SDK 4.x: tool results arrive as parts with type='tool-invocation' and
  // toolInvocation.state='result' (NOT type='tool-result').
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
        }
        if (ti.toolName === 'search_hotels' && result?.hotels && result?.city) {
          const city = result.city as string
          setHotelsByCity(prev => ({ ...prev, [city]: result.hotels as Hotel[] }))
        }
        if (ti.toolName === 'search_attractions' && result?.attractions && result?.city) {
          const city = result.city as string
          setAttractionsByCity(prev => ({ ...prev, [city]: result.attractions as Attraction[] }))
        }
        if (ti.toolName === 'explore_surroundings') {
          if (result?.surroundings) setSurroundings(result.surroundings as Attraction[])
          setIsSurroundingsLoading(false)
        }
        if (ti.toolName === 'build_booking_summary' && result?.summary) {
          setBookingSummary(result.summary as BookingSummary)
        }
      }
      // Only mark complete (non-streaming) messages as processed
      if (!isLoading) processedIds.current.add(msg.id)
    }
  }, [messages, isLoading])

  function handleSuggestionSelect(text: string) {
    setInput(text)
    setChatCollapsed(false)
  }

  async function handleExploreSurroundings(city: string, state: string, categories: SurroundingsCategory[]) {
    setSurroundings([])
    setIsSurroundingsLoading(true)
    await append({ role: 'user', content: `Find ${categories.join(', ')} activities near ${city}, ${state}` })
  }

  // Right-click on map → show context menu (TREK handleMapContextMenu pattern)
  const handleMapRightClick = useCallback(async (lat: number, lng: number, x: number, y: number) => {
    if (isLoading) return
    setMapMenu({ lat, lng, x, y, resolving: true, city: null, state: null })
    // Best-effort reverse geocode — silent fail (TREK pattern)
    try {
      const result = await reverseGeocode(lat, lng)
      setMapMenu(prev => prev ? { ...prev, resolving: false, city: result?.city ?? null, state: result?.state ?? null } : null)
    } catch {
      setMapMenu(prev => prev ? { ...prev, resolving: false } : null)
    }
  }, [isLoading])

  // "Add as stop" from the context menu
  async function handleAddStop() {
    if (!mapMenu) return
    const { lat, lng, city, state } = mapMenu
    const locationLabel = city && state ? `${city}, ${state}` : `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°W`

    // Insert provisional stop — shows a pulsing pin while AI processes
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
      // Insert before the final destination
      setStops([...stops.slice(0, -1), provisional, lastStop])
    }

    setMapMenu(null)

    // Let AI orchestrate: update route + search attractions/hotels/surroundings
    await append({
      role: 'user',
      content: `I right-clicked on the map at ${locationLabel} (coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}). Please add it as a stop on the route, recalculate the full itinerary, find the best hotels and attractions there, and explore the best outdoor activities and surroundings nearby.`,
    })
  }

  function handleConfirmBooking(summary: BookingSummary) {
    if (!selectedStop) return
    const reservation: ConfirmedReservation = {
      id: summary.offerId,
      type: 'hotel',
      status: 'pending',   // starts as pending, user can upgrade to confirmed
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
      // Replace if same hotel already booked for this stop
      const filtered = prev.filter(r => !(r.stopCity === selectedStop.city && r.hotelId === summary.hotelId))
      return [...filtered, reservation]
    })
    window.open(summary.bookingUrl, '_blank', 'noopener,noreferrer')
    setBookingSummary(null)
    setItineraryOpen(true)  // auto-open itinerary panel after booking
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView
          stops={stops}
          attractions={allAttractions}
          surroundings={surroundings}
          hotels={allHotels}
          routeGeometry={routeGeometry}
          selectedStop={selectedStop}
          confirmedReservations={confirmedReservations}
          proactivePOIs={proactivePois}
          onStopClick={stop => { setSelectedStop(stop); setSurroundings([]) }}
          onMapRightClick={handleMapRightClick}
        />
      </div>

      {/* Map legend (bottom-right, above zoom controls) */}
      {(allAttractions.length > 0 || allHotels.length > 0 || surroundings.length > 0 || confirmedReservations.length > 0 ||
        proactivePois.gasStations.length > 0 || proactivePois.restaurants.length > 0 || proactivePois.attractions.length > 0) && (
        <div className="absolute bottom-52 right-4 z-[1000] bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-lg border border-white/50 text-xs space-y-1">
          {confirmedReservations.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-white font-bold text-[9px]">✓</span> Booked</div>}
          {allHotels.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-white font-bold text-[9px]">H</span> Hotels</div>}
          {allAttractions.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-600 inline-block" /> Attractions</div>}
          {surroundings.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-400 border-2 border-teal-600 inline-block" /> Outdoor</div>}
          {proactivePois.gasStations.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 border border-gray-500 inline-block" /> Gas</div>}
          {proactivePois.restaurants.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-200 border border-orange-600 inline-block" /> Food</div>}
          {proactivePois.attractions.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-200 border border-violet-600 inline-block" /> POIs</div>}
        </div>
      )}

      {/* Floating chat panel */}
      <ChatPanel
        messages={messages}
        input={input}
        isLoading={isLoading}
        collapsed={chatCollapsed}
        onToggle={() => setChatCollapsed(c => !c)}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onSuggestionSelect={handleSuggestionSelect}
      />

      {/* Route summary pill (top-center) */}
      <FloatingRouteSummary
        stops={stops}
        totalDistance={totalDistance}
        totalDuration={totalDuration}
        bookingCount={confirmedReservations.length}
        onItineraryClick={() => setItineraryOpen(true)}
      />

      {/* Quick suggestion chips (bottom-center, only when no messages) */}
      {messages.length === 0 && (
        <MapSuggestions onSelect={handleSuggestionSelect} />
      )}

      {/* Map right-click context menu (TREK PlaceFormModal prefill pattern) */}
      {mapMenu && (
        <div
          className="fixed z-[2000] bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-56"
          style={{ left: Math.min(mapMenu.x, window.innerWidth - 232), top: Math.min(mapMenu.y, window.innerHeight - 140) }}
        >
          <button
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            onClick={() => setMapMenu(null)}
          >×</button>
          <div className="text-xs text-gray-500 mb-1">Right-clicked location</div>
          {mapMenu.resolving ? (
            <div className="flex items-center gap-2 py-1">
              <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">Resolving location…</span>
            </div>
          ) : (
            <div className="font-semibold text-gray-900 text-sm mb-2 truncate">
              {mapMenu.city && mapMenu.state
                ? `${mapMenu.city}, ${mapMenu.state}`
                : `${mapMenu.lat.toFixed(4)}°, ${mapMenu.lng.toFixed(4)}°`}
            </div>
          )}
          <button
            disabled={mapMenu.resolving || isLoading}
            onClick={handleAddStop}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2 px-3 rounded-xl transition-colors"
          >
            Add as stop + Explore
          </button>
        </div>
      )}

      {/* Dismiss map menu on outside click */}
      {mapMenu && (
        <div className="fixed inset-0 z-[1999]" onClick={() => setMapMenu(null)} />
      )}

      {/* Stop bottom sheet */}
      <StopBottomSheet
        stop={selectedStop}
        hotels={selectedStop ? (hotelsByCity[selectedStop.city] ?? []) : []}
        attractions={selectedStop ? (attractionsByCity[selectedStop.city] ?? []) : []}
        surroundings={surroundings}
        isSurroundingsLoading={isSurroundingsLoading}
        onClose={() => { setSelectedStop(null); setSurroundings([]) }}
        onSelectHotel={(hotel: Hotel, offer: HotelOffer) => {
          setBookingSummary({
            hotelId: hotel.hotelId,
            hotelName: hotel.name,
            offerId: offer.offerId,
            roomType: offer.roomType,
            pricePerNight: offer.price,
            totalPrice: offer.price * (selectedStop?.stayNights ?? 1),
            currency: offer.currency,
            checkIn: selectedStop?.checkIn ?? '',
            checkOut: selectedStop?.checkOut ?? '',
            nights: selectedStop?.stayNights ?? 1,
            adults: 2,
            cancellationPolicy: offer.cancellationPolicy,
            breakfastIncluded: offer.breakfastIncluded,
            bookingUrl: offer.bookingUrl ?? '#',
          })
        }}
        onExploreSurroundings={handleExploreSurroundings}
      />

      {/* Booking review modal */}
      {bookingSummary && (
        <BookingReviewModal
          summary={bookingSummary}
          onClose={() => setBookingSummary(null)}
          onConfirm={() => handleConfirmBooking(bookingSummary)}
        />
      )}

      {/* Itinerary panel (TREK ReservationsPanel port) */}
      <ItineraryPanel
        reservations={confirmedReservations}
        stops={stops}
        open={itineraryOpen}
        onClose={() => setItineraryOpen(false)}
        onCancel={(id) => setConfirmedReservations(prev => prev.filter(r => r.id !== id))}
        onStatusChange={(id, status) =>
          setConfirmedReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r))
        }
      />
    </div>
  )
}
