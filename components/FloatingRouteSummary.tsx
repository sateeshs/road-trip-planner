'use client'
import type { RouteStop } from '@/types'

interface FloatingRouteSummaryProps {
  stops: RouteStop[]
  totalDistance?: string | null
  totalDuration?: string | null
}

export default function FloatingRouteSummary({ stops, totalDistance, totalDuration }: FloatingRouteSummaryProps) {
  if (stops.length < 2) return null
  const origin = stops[0].city
  const dest = stops[stops.length - 1].city
  const midStops = stops.slice(1, -1)
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-4 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">
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
    </div>
  )
}
