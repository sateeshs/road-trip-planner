'use client'
import type { RouteStop } from '@/types'

interface FloatingRouteSummaryProps {
  stops: RouteStop[]
  totalDistance?: string | null
  totalDuration?: string | null
  bookingCount?: number
  onItineraryClick?: () => void
}

export default function FloatingRouteSummary({
  stops, totalDistance, totalDuration, bookingCount = 0, onItineraryClick,
}: FloatingRouteSummaryProps) {
  if (stops.length < 2) return null
  const origin = stops[0].city
  const dest = stops[stops.length - 1].city
  const midStops = stops.slice(1, -1)

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
      {/* Route pill */}
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-4 py-2 text-sm font-medium text-gray-800 whitespace-nowrap pointer-events-none">
        <span>🚗</span>
        <span>{origin}</span>
        {midStops.map(s => (
          <span key={s.city} className="flex items-center gap-1">
            <span className="text-gray-400">→</span>
            <span className="text-blue-600">{s.city}</span>
          </span>
        ))}
        <span className="text-gray-400">→</span>
        <span>{dest}</span>
        {(totalDistance || totalDuration) && (
          <>
            <span className="text-gray-300 mx-1">|</span>
            {totalDistance && <span className="text-gray-500">{totalDistance}</span>}
            {totalDuration && <span className="text-gray-500">{`· ${totalDuration}`}</span>}
          </>
        )}
      </div>

      {/* Itinerary button — shows booking count badge (ported from TREK reservations indicator) */}
      {onItineraryClick && (
        <button
          onClick={onItineraryClick}
          className="relative flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-colors"
        >
          🗒
          <span className="hidden sm:inline">Itinerary</span>
          {bookingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-white">
              {bookingCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
