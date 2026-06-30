'use client'

import type { SuggestRouteStopsResult } from '@/types'

interface Props {
  result: SuggestRouteStopsResult
}

export default function RouteSummaryCard({ result }: Props) {
  const { stops = [], totalDistance, totalDuration } = result

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🗺️</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Route Summary</span>
      </div>

      <div className="px-4 py-3 space-y-0">
        {stops.map((stop, idx) => (
          <div key={stop.city}>
            {/* Leg info (drive time from previous) */}
            {idx > 0 && (stop.driveTimeFromPrevious || stop.driveDistanceFromPrevious) && (
              <div className="flex items-center gap-2 py-1.5 pl-3.5">
                <div className="w-px h-4 bg-blue-200 ml-1" />
                <span className="text-[11px] text-gray-500">
                  {[stop.driveTimeFromPrevious, stop.driveDistanceFromPrevious].filter(Boolean).join(' · ')}
                  {stop.roadName && (
                    <span className="ml-1.5 text-blue-600 font-medium">via {stop.roadName}</span>
                  )}
                </span>
                {stop.hasToll && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">
                    toll
                  </span>
                )}
              </div>
            )}

            {/* Stop row */}
            <div className="flex items-center gap-2.5 py-1">
              <span className="text-base w-6 text-center flex-none">
                {idx === 0 ? '🚗' : idx === stops.length - 1 ? '🏁' : `${idx}`}
              </span>
              <div>
                <span className="text-sm font-semibold text-gray-900">{stop.city}</span>
                <span className="text-xs text-gray-400 ml-1">{stop.state}</span>
                {stop.stayNights > 0 && (
                  <span className="text-[11px] text-gray-400 ml-2">
                    {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(totalDistance || totalDuration) && (
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 bg-gray-50/60">
          <span className="text-[11px] text-gray-500 font-medium">Total</span>
          {totalDistance && <span className="text-xs text-gray-700 font-semibold">{totalDistance}</span>}
          {totalDuration && <span className="text-xs text-gray-700 font-semibold">{totalDuration}</span>}
        </div>
      )}
    </div>
  )
}
