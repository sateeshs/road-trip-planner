'use client'
/**
 * Phase 7 — "On Your Way" corridor suggestions panel.
 * Shows a horizontal scrollable chip bar of notable POIs near the route.
 */

import { useState } from 'react'
import type { CorridorStop } from '@/hooks/useCorridorStops'

interface CorridorStopsPanelProps {
  stops: CorridorStop[]
  onAdd: (stop: CorridorStop) => void
  /** Whether the left chat panel is expanded — shifts corridor panel right to avoid overlap */
  chatOpen?: boolean
  /** IDs of stops currently pinned on the map */
  highlightedIds?: Set<string>
  /** Toggle highlight on/off for a stop */
  onHighlight?: (stop: CorridorStop) => void
}

export default function CorridorStopsPanel({ stops, onAdd, chatOpen = true, highlightedIds, onHighlight }: CorridorStopsPanelProps) {
  const [dismissed, setDismissed] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())

  if (dismissed || stops.length === 0) return null

  function handleAdd(stop: CorridorStop) {
    setAdded(prev => new Set(prev).add(stop.id))
    onHighlight?.(stop)   // pin on map when adding
    onAdd(stop)
  }

  // When chat panel is open (left-4, w-[26rem] = ~432px), start after it.
  // When collapsed, center across full viewport.
  const posClass = chatOpen
    ? 'left-[27.5rem] right-4'
    : 'left-1/2 -translate-x-1/2 max-w-3xl'

  return (
    <div className={`absolute top-[4.5rem] z-[999] px-0 pointer-events-none ${posClass}`}>
      <div className="pointer-events-auto bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-2xl px-3 py-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            On Your Way
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Scrollable chip row */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {stops.map(stop => {
            const isAdded = added.has(stop.id)
            const isHighlighted = highlightedIds?.has(stop.id) ?? false
            return (
              <div
                key={stop.id}
                onClick={() => !isAdded && onHighlight?.(stop)}
                className={[
                  'flex items-center gap-2 shrink-0 rounded-xl border px-3 py-1.5 text-sm transition-all',
                  isAdded
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : isHighlighted
                      ? 'bg-amber-50 border-amber-400 text-amber-800 ring-1 ring-amber-300 cursor-pointer'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-amber-300 hover:bg-amber-50 cursor-pointer',
                ].join(' ')}
                title={isAdded ? undefined : isHighlighted ? 'Click to remove pin' : 'Click to preview on map'}
              >
                <span className="text-base leading-none">{stop.emoji}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate max-w-[140px]">{stop.name}</div>
                  <div className="text-[10px] text-gray-400 leading-tight">
                    {stop.category}
                  </div>
                  <div className={`text-[10px] font-medium leading-tight ${isHighlighted ? 'text-amber-600' : 'text-blue-500'}`}>
                    {isHighlighted ? '📍 Pinned on map' : `Near ${stop.nearStopCity}`}
                    {!isHighlighted && stop.distanceMiles >= 0.5 && (
                      <span className="text-gray-400 font-normal"> · {stop.distanceMiles} mi off route</span>
                    )}
                  </div>
                </div>
                {isAdded ? (
                  <span className="text-green-500 text-xs font-semibold shrink-0">✓ Added</span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); handleAdd(stop) }}
                    className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                    title={`Add ${stop.name} as a stop`}
                  >
                    +
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
