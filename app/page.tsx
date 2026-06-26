'use client'

import { useState } from 'react'
import { TripProvider, useTripContext } from '@/contexts/TripContext'
import ChatPanel from '@/components/ChatPanel'
import ChatModal from '@/components/ChatModal'
import MapView from '@/components/MapView'
import StopBottomSheet from '@/components/StopBottomSheet'
import FloatingRouteSummary from '@/components/FloatingRouteSummary'
import MapSuggestions from '@/components/MapSuggestions'
import BookingReviewModal from '@/components/BookingReviewModal'
import ItineraryPanel from '@/components/ItineraryPanel'
import PlanPanel from '@/components/PlanPanel'
import TripMembersPanel from '@/components/TripMembersPanel'
import RouteOptionsCard from '@/components/RouteOptionsCard'
import CorridorStopsPanel from '@/components/CorridorStopsPanel'
import { useCorridorStops } from '@/hooks/useCorridorStops'
import type { Hotel, HotelOffer } from '@/types'

export default function HomePage() {
  return (
    <TripProvider>
      <TripLayout />
    </TripProvider>
  )
}

function TripLayout() {
  const {
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
    handleExploreSurroundings,
    handleMapRightClick,
    handleAddStop,
    handleRemoveStop,
    handleConfirmBooking,
    handleCancelReservation,
    handleReservationStatusChange,
    paretoRoutes,
    setParetoRoutes,
    handleSelectParetoRoute,
    stopScores,
    userBudget,
    setUserBudget,
    planActivities,
    planOpen,
    setPlanOpen,
    removeFromPlan,
    tripId,
    membersCount,
    saveTripToDb,
    append,
  } = useTripContext()

  const [membersOpen, setMembersOpen] = useState(false)
  const [chatModalOpen, setChatModalOpen] = useState(false)
  const [highlightedCorridorStop, setHighlightedCorridorStop] = useState<import('@/hooks/useCorridorStops').CorridorStop | null>(null)

  // Phase 7: corridor opportunistic stops
  const corridorStops = useCorridorStops(routeGeometry, stops)

  function handleAddCorridorStop(stop: import('@/hooks/useCorridorStops').CorridorStop) {
    const origin = stops[0]
    const dest   = stops[stops.length - 1]
    append({
      role: 'user',
      content:
        `Add ${stop.name} as a stop on my route. ` +
        `It's a ${stop.category.toLowerCase()} located about ${stop.distanceMiles} miles off the main corridor ` +
        `between ${origin.city} and ${dest.city}. ` +
        `Please insert it at the best position in the itinerary and recalculate everything.`,
    })
  }

  function handleSuggestionSelect(text: string) {
    setInput(text)
    setChatCollapsed(false)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView
          stops={stops}
          attractions={allAttractions}
          surroundings={allSurroundings}
          hotels={allHotels}
          routeGeometry={routeGeometry}
          selectedStop={selectedStop}
          confirmedReservations={confirmedReservations}
          proactivePOIs={proactivePois}
          highlightedCorridorStop={highlightedCorridorStop}
          onStopClick={stop => setSelectedStop(stop)}
          onMapRightClick={handleMapRightClick}
        />
      </div>

      {/* Map legend (bottom-right, above zoom controls) */}
      {(allAttractions.length > 0 || allHotels.length > 0 || allSurroundings.length > 0 || confirmedReservations.length > 0 ||
        proactivePois.gasStations.length > 0 || proactivePois.restaurants.length > 0 || proactivePois.attractions.length > 0 ||
        proactivePois.restrooms.length > 0 || proactivePois.campgrounds.length > 0) && (
        <div className="absolute bottom-52 right-4 z-[1000] bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-lg border border-white/50 text-xs space-y-1">
          {confirmedReservations.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-white font-bold text-[9px]">✓</span> Booked</div>}
          {allHotels.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-white font-bold text-[9px]">H</span> Hotels</div>}
          {allAttractions.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-600 inline-block" /> Attractions</div>}
          {allSurroundings.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-400 border-2 border-teal-600 inline-block" /> Outdoor</div>}
          {proactivePois.gasStations.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 border border-gray-500 inline-block" /> Gas</div>}
          {proactivePois.restaurants.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-200 border border-orange-600 inline-block" /> Food</div>}
          {proactivePois.attractions.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-200 border border-violet-600 inline-block" /> POIs</div>}
          {proactivePois.restrooms.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-200 border border-sky-600 inline-block" /> Restrooms</div>}
          {proactivePois.campgrounds.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-200 border border-green-700 inline-block" /> Camping</div>}
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
        onExpand={() => setChatModalOpen(true)}
      />

      {/* Expanded chat modal — reads from TripContext directly, always in sync */}
      {chatModalOpen && (
        <ChatModal onClose={() => setChatModalOpen(false)} />
      )}

      {/* Route summary pill (top-center) */}
      <FloatingRouteSummary
        stops={stops}
        totalDistance={totalDistance}
        totalDuration={totalDuration}
        bookingCount={confirmedReservations.length}
        membersCount={membersCount}
        onItineraryClick={() => setItineraryOpen(true)}
        onMembersClick={() => {
          if (stops.length >= 2 && !tripId) {
            saveTripToDb()
          }
          setMembersOpen(true)
        }}
      />

      {/* Phase 7: On Your Way corridor suggestions */}
      {corridorStops.length > 0 && (
        <CorridorStopsPanel
          stops={corridorStops}
          onAdd={handleAddCorridorStop}
          chatOpen={!chatCollapsed}
          highlightedId={highlightedCorridorStop?.id ?? null}
          onHighlight={stop =>
            setHighlightedCorridorStop(prev => prev?.id === stop.id ? null : stop)
          }
        />
      )}

      {/* Quick suggestion chips (bottom-center, only when no messages) */}
      {messages.length === 0 && (
        <MapSuggestions onSelect={handleSuggestionSelect} />
      )}

      {/* Map right-click context menu */}
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
        surroundings={selectedStop ? (surroundingsByCity[selectedStop.city] ?? []) : []}
        isSurroundingsLoading={isSurroundingsLoading}
        isRemovable={selectedStop ? (() => { const idx = stops.findIndex(s => s.city === selectedStop.city); return stops.length > 2 && idx > 0 && idx < stops.length - 1 })() : false}
        onClose={() => setSelectedStop(null)}
        onRemoveStop={handleRemoveStop}
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

      {/* Activity plan panel */}
      <PlanPanel
        activities={planActivities}
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onRemove={removeFromPlan}
      />

      {/* Itinerary panel */}
      <ItineraryPanel
        reservations={confirmedReservations}
        stops={stops}
        open={itineraryOpen}
        onClose={() => setItineraryOpen(false)}
        onCancel={handleCancelReservation}
        onStatusChange={handleReservationStatusChange}
      />

      {/* Trip members / sharing panel */}
      <TripMembersPanel
        tripId={tripId}
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
      />

      {/* NSGA-II Pareto route options overlay */}
      {paretoRoutes && (
        <RouteOptionsCard
          routes={paretoRoutes}
          onSelect={handleSelectParetoRoute}
          onDismiss={() => setParetoRoutes(null)}
          stopScores={stopScores}
          userBudget={userBudget}
          onBudgetChange={setUserBudget}
        />
      )}
    </div>
  )
}
