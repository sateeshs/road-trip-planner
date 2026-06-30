'use client'
import type { RouteStop, ConfirmedReservation } from '@/types'
import { useTripContext } from '@/contexts/TripContext'

async function downloadCalendar(stops: RouteStop[], reservations: ConfirmedReservation[]) {
  const res = await fetch('/api/export-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stops, reservations }),
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'road-trip.ics'
  a.click()
  URL.revokeObjectURL(url)
}

interface FloatingRouteSummaryProps {
  stops: RouteStop[]
  totalDistance?: string | null
  totalDuration?: string | null
  bookingCount?: number
  membersCount?: number
  onItineraryClick?: () => void
  onMembersClick?: () => void
}

export default function FloatingRouteSummary({
  stops, totalDistance, totalDuration, bookingCount = 0, membersCount = 0, onItineraryClick, onMembersClick,
}: FloatingRouteSummaryProps) {
  const { handleOptimizeRoute, isOptimizing, isLoading, planActivities, setPlanOpen, estimatedTripCost, confirmedReservations } = useTripContext()

  if (stops.length < 2) return null
  const origin = stops[0].city
  const dest = stops[stops.length - 1].city
  const midStops = stops.slice(1, -1)
  const intermediateCount = stops.length - 2
  const canOptimize = stops.length >= 2  // Phase 5: show for any origin+destination pair

  // Button label + tooltip adapt to how many intermediate stops exist
  const optimizeLabel = intermediateCount <= 0
    ? 'Suggest Stops'
    : intermediateCount === 1
      ? 'Evaluate Stop'
      : 'Optimize'
  const optimizeTitle = intermediateCount <= 0
    ? 'Ask AI to suggest the best intermediate stops for this route'
    : intermediateCount === 1
      ? 'Score this stop for corridor fit and attractions; suggest alternatives if needed'
      : 'Run NSGA-II to find the best stop order — shows Fast / Balanced / Complete options'

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
        {estimatedTripCost && (
          <>
            <span className="text-gray-300 mx-1">|</span>
            <span className={`text-xs font-medium ${estimatedTripCost.confirmed ? 'text-green-600' : 'text-gray-500'}`}>
              {estimatedTripCost.confirmed
                ? `$${estimatedTripCost.min.toLocaleString()} booked`
                : `Est. $${estimatedTripCost.min.toLocaleString()}–$${estimatedTripCost.max.toLocaleString()}`
              }
            </span>
          </>
        )}
      </div>

      {/* Optimize / Suggest Stops / Evaluate Stop button */}
      {canOptimize && (
        <button
          onClick={handleOptimizeRoute}
          disabled={isOptimizing || isLoading}
          title={optimizeTitle}
          className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 hover:text-purple-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isOptimizing ? (
            <span className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>✦</span>
          )}
          <span className="hidden sm:inline">{optimizeLabel}</span>
        </button>
      )}

      {/* My Plan button */}
      <button
        onClick={() => setPlanOpen(true)}
        className="relative flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-colors"
      >
        📋
        <span className="hidden sm:inline">My Plan</span>
        {planActivities.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-white">
            {planActivities.length}
          </span>
        )}
      </button>

      {/* Itinerary button — shows booking count badge */}
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

      {/* Calendar export button — only shown when at least one reservation is confirmed */}
      {confirmedReservations.length > 0 && (
        <button
          onClick={() => downloadCalendar(stops, confirmedReservations)}
          title="Export trip to calendar (.ics)"
          className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-colors"
        >
          📅
          <span className="hidden sm:inline">Export</span>
        </button>
      )}

      {/* Members button */}
      <button
        onClick={onMembersClick}
        title="Share trip & manage members"
        className="relative flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className="hidden sm:inline">Share</span>
        {membersCount > 1 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-white">
            {membersCount}
          </span>
        )}
      </button>
    </div>
  )
}
