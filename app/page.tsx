'use client'

import { useState } from 'react'
import { useChat } from 'ai/react'
import ChatPanel from '@/components/ChatPanel'
import MapView from '@/components/MapView'
import StopSidebar from '@/components/StopSidebar'
import BookingReviewModal, { type BookingSummary } from '@/components/BookingReviewModal'
import type { RouteStop, Hotel, Attraction, HotelOffer, RouteGeometry } from '@/types'

export default function HomePage() {
  const [stops, setStops] = useState<RouteStop[]>([])
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | null>(null)
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onFinish: (message) => {
      const parts = (message as { parts?: Array<{ type: string; toolName?: string; result?: unknown }> }).parts || []
      for (const part of parts) {
        if (part.type === 'tool-result') {
          const result = part.result as Record<string, unknown>
          if (part.toolName === 'suggest_route_stops') {
            if (result?.stops) setStops(result.stops as RouteStop[])
            // routeGeometry is [lat, lng][] from ORS — null if ORS call failed
            if (result?.routeGeometry) setRouteGeometry(result.routeGeometry as RouteGeometry)
          }
          if (part.toolName === 'search_hotels' && result?.hotels) {
            setHotels(result.hotels as Hotel[])
          }
          if (part.toolName === 'search_attractions' && result?.attractions) {
            setAttractions(result.attractions as Attraction[])
          }
          if (part.toolName === 'build_booking_summary' && result?.summary) {
            setBookingSummary(result.summary as BookingSummary)
          }
        }
      }
    },
  })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: Chat */}
      <div className="w-full md:w-[420px] flex-shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <header className="px-4 py-3 border-b border-gray-100 bg-white">
          <h1 className="text-lg font-semibold text-gray-900">Road Trip Planner</h1>
          <p className="text-xs text-gray-500">Powered by Claude AI</p>
        </header>
        <ChatPanel
          messages={messages}
          input={input}
          isLoading={isLoading}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
        />
      </div>

      {/* Right: Map + Sidebar */}
      <div className="hidden md:flex flex-1 flex-col overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapView
            stops={stops}
            attractions={attractions}
            routeGeometry={routeGeometry}
            selectedStop={selectedStop}
            onStopClick={setSelectedStop}
          />
        </div>

        {/* Bottom: Stop info when a stop is selected */}
        {selectedStop && (
          <div className="h-64 border-t border-gray-200 overflow-y-auto bg-white">
            <StopSidebar
              stop={selectedStop}
              hotels={hotels}
              attractions={attractions}
              onClose={() => setSelectedStop(null)}
              onSelectHotel={(hotel: Hotel, offer: HotelOffer) => {
                setBookingSummary({
                  hotelId: hotel.hotelId,
                  hotelName: hotel.name,
                  offerId: offer.offerId,
                  roomType: offer.roomType,
                  pricePerNight: offer.price,
                  totalPrice: offer.price * selectedStop.stayNights,
                  currency: offer.currency,
                  checkIn: selectedStop.checkIn,
                  checkOut: selectedStop.checkOut,
                  nights: selectedStop.stayNights,
                  adults: 2,
                  cancellationPolicy: offer.cancellationPolicy,
                  breakfastIncluded: offer.breakfastIncluded,
                  bookingUrl: offer.bookingUrl || '#',
                })
              }}
            />
          </div>
        )}
      </div>

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
