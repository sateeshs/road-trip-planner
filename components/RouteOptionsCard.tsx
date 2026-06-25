'use client'

import type { ParetoRoute } from '@/lib/route-optimizer'
import type { StopScore, StopQualityLabel } from '@/lib/stop-scorer'

interface RouteOptionsCardProps {
  routes: ParetoRoute[]
  onSelect: (route: ParetoRoute) => void
  onDismiss: () => void
  stopScores?: Map<string, StopScore> | null
}

const QUALITY_BADGE: Record<StopQualityLabel, { text: string; cls: string }> = {
  excellent: { text: 'Excellent', cls: 'bg-emerald-500/20 text-emerald-300' },
  good:      { text: 'Good',      cls: 'bg-blue-500/20 text-blue-300' },
  fair:      { text: 'Fair',      cls: 'bg-yellow-500/20 text-yellow-300' },
  poor:      { text: 'Poor',      cls: 'bg-red-500/20 text-red-300' },
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatCost(usd: number): string {
  return `$${Math.round(usd).toLocaleString()}`
}

function formatStops(count: number): string {
  return count === 1 ? '1 stop' : `${count} stops`
}

const LABEL_META: Record<ParetoRoute['label'], { icon: string; title: string; recommended?: boolean }> = {
  fast:     { icon: '⚡', title: 'Fast' },
  balanced: { icon: '⚖️', title: 'Balanced', recommended: true },
  complete: { icon: '🗺️', title: 'Complete' },
}

export default function RouteOptionsCard({ routes, onSelect, onDismiss, stopScores }: RouteOptionsCardProps) {
  // Ensure display order: fast → balanced → complete
  const ordered: ParetoRoute[] = (['fast', 'balanced', 'complete'] as const)
    .map(label => routes.find(r => r.label === label))
    .filter((r): r is ParetoRoute => r !== undefined)

  return (
    /* Semi-transparent full-screen overlay */
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      {/* Backdrop blur */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Choose your optimized route</h2>
            <p className="text-gray-400 text-sm mt-0.5">NSGA-II found {ordered.length} route variants — pick what fits you:</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white text-2xl leading-none ml-4 mt-0.5 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Route cards */}
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          {ordered.map(route => {
            const meta = LABEL_META[route.label]
            const isBalanced = route.label === 'balanced'
            return (
              <div
                key={route.label}
                className={[
                  'flex-1 rounded-xl p-4 border transition-all',
                  isBalanced
                    ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/40'
                    : 'bg-white/5 border-white/10 hover:bg-white/10',
                ].join(' ')}
              >
                {/* Title row */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <span className="text-white font-semibold text-sm">{meta.title}</span>
                  </div>
                  {meta.recommended && (
                    <span className="text-xs font-semibold text-blue-300 bg-blue-500/25 px-2 py-0.5 rounded-full">
                      ★ Recommended
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500 w-4 text-center">📍</span>
                    <span>{formatStops(route.intermediates.length)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500 w-4 text-center">🕐</span>
                    <span>{formatMinutes(route.driveMinutes)} drive</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500 w-4 text-center">💰</span>
                    <span>~{formatCost(route.estimatedCostUsd)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-gray-500 w-4 text-center">⭐</span>
                    <span>{route.attractionScore} attraction{route.attractionScore !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Stop list with quality badges */}
                {route.intermediates.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {route.intermediates.map(s => {
                      const score = stopScores?.get(s.id)
                      const badge = score ? QUALITY_BADGE[score.label] : null
                      return (
                        <div key={s.id} className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-400 truncate">{s.id}</span>
                          {badge && (
                            <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                              {badge.text}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Select button */}
                <button
                  onClick={() => onSelect(route)}
                  className={[
                    'mt-4 w-full py-2 px-3 rounded-lg font-semibold text-sm transition-colors',
                    isBalanced
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white',
                  ].join(' ')}
                >
                  Select
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 text-center">
          <button
            onClick={onDismiss}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          >
            Keep current route
          </button>
        </div>
      </div>
    </div>
  )
}
