'use client'

import { useState } from 'react'
import { useChat } from 'ai/react'
import ChatPanel from '@/components/ChatPanel'
import MapView from '@/components/MapView'
import StopBottomSheet from '@/components/StopBottomSheet'
import FloatingRouteSummary from '@/components/FloatingRouteSummary'
import MapSuggestions from '@/components/MapSuggestions'
import BookingReviewModal, { type BookingSummary } from '@/components/BookingReviewModal'
import type { RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'

export default function HomePage() {
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [stops, setStops] = useState<RouteStop[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [totalDistance, setTotalDistance] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState<string | null>(null)
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [surroundings, setSurroundings] = useState<Attraction[]>([])
  const [isSurroundingsLoading, setIsSurroundingsLoading] = useState(false)
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, append, setInput } = useChat({
    api: '/api/chat',
    onFinish: (message) => {
      const parts = (message as { parts?: Array<{ type: string; toolName?: string; result?: unknown }> }).parts || []
      for (const part of parts) {
        if (part.type === 'tool-result') {
          const result = part.result as Record<string, unknown>
          if (part.toolName === 'suggest_route_stops') {
            if (result?.stops) setStops(result.stops as RouteStop[])
            if (result?.routeGeometry) setRouteGeometry(result.routeGeometry as RouteGeometry)
            if (result?.totalDistance) setTotalDistance(result.totalDistance as string)
            if (result?.totalDuration) setTotalDuration(result.totalDuration as string)
          }
          if (part.toolName === 'search_hotels' && result?.hotels) setHotels(result.hotels as Hotel[])
          if (part.toolName === 'search_attractions' && result?.attractions) setAttractions(result.attractions as Attraction[])
          if (part.toolName === 'explore_surroundings' && result?.surroundings) {
            setSurroundings(result.surroundings as Attraction[])
            setIsSurroundingsLoading(false)
          }
          if (part.toolName === 'build_booking_summary' && result?.summary) {
            setBookingSummary(result.summary as BookingSummary)
          }
        }
      }
    },
  })

  function handleSuggestionSelect(text: string) {
    setInput(text)
    setChatCollapsed(false)
  }

  async function handleExploreSurroundings(city: string, state: string, categories: SurroundingsCategory[]) {
    setSurroundings([])
    setIsSurroundingsLoading(true)
    await append({ role: 'user', content: `Find ${categories.join(', ')} activities near ${city}, ${state}` })
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView
          stops={stops}
          attractions={attractions}
          surroundings={surroundings}
          hotels={hotels}
          routeGeometry={routeGeometry}
          selectedStop={selectedStop}
          onStopClick={stop => { setSelectedStop(stop); setSurroundings([]) }}
        />
      </div>

      {/* Map legend (bottom-right) */}
      {(attractions.length > 0 || hotels.length > 0 || surroundings.length > 0) && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-lg border border-white/50 text-xs space-y-1">
          {hotels.length > 0 && <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-white font-bold text-[9px]">H</span> Hotels</div>}
          {attractions.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-600 inline-block" /> Attractions</div>}
          {surroundings.length > 0 && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-400 border-2 border-teal-600 inline-block" /> Outdoor</div>}
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
      />

      {/* Quick suggestion chips (bottom-center, only when no messages) */}
      {messages.length === 0 && (
        <MapSuggestions onSelect={handleSuggestionSelect} />
      )}

      {/* Stop bottom sheet */}
      <StopBottomSheet
        stop={selectedStop}
        hotels={hotels}
        attractions={attractions}
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

      {/* Booking modal */}
      {bookingSummary && (
        <BookingReviewModal
          summary={bookingSummary}
          onClose={() => setBookingSummary(null)}
          onConfirm={() => {
            window.open(bookingSummary.bookingUrl, '_blank', 'noopener,noreferrer')
            setBookingSummary(null)
          }}
        />
      )}
    </div>
  )
}
