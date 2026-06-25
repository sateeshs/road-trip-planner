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
}

export default function CorridorStopsPanel({ stops, onAdd }: CorridorStopsPanelProps) {
  const [dismissed, setDismissed] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())

  if (dismissed || stops.length === 0) return null

  function handleAdd(stop: CorridorStop) {
    setAdded(prev => new Set(prev).add(stop.id))
    onAdd(stop)
  }

  return (
    <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-[999] w-full max-w-3xl px-4 pointer-events-none">
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
            return (
              <div
                key={stop.id}
                className={[
                  'flex items-center gap-2 shrink-0 rounded-xl border px-3 py-1.5 text-sm transition-all',
                  isAdded
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50',
                ].join(' ')}
              >
                <span className="text-base leading-none">{stop.emoji}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate max-w-[140px]">{stop.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {stop.distanceMiles < 0.5
                      ? 'on route'
                      : `${stop.distanceMiles} mi off route`}
                  </div>
                </div>
                {isAdded ? (
                  <span className="text-green-500 text-xs font-semibold shrink-0">✓ Added</span>
                ) : (
                  <button
                    onClick={() => handleAdd(stop)}
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
