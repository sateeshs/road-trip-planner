'use client'

import { useState } from 'react'
import type { ParetoRoute } from '@/lib/route-optimizer'
import type { StopScore, StopQualityLabel } from '@/lib/stop-scorer'

interface RouteOptionsCardProps {
  routes: ParetoRoute[]
  onSelect: (route: ParetoRoute) => void
  onDismiss: () => void
  stopScores?: Map<string, StopScore> | null
  /** Phase 6: user's stated trip budget in USD */
  userBudget?: number | null
  onBudgetChange?: (budget: number | null) => void
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

export default function RouteOptionsCard({
  routes, onSelect, onDismiss, stopScores, userBudget, onBudgetChange,
}: RouteOptionsCardProps) {
  // Local controlled state for the budget input
  const [budgetInput, setBudgetInput] = useState(userBudget != null ? String(userBudget) : '')

  // Ensure display order: fast → balanced → complete
  const ordered: ParetoRoute[] = (['fast', 'balanced', 'complete'] as const)
    .map(label => routes.find(r => r.label === label))
    .filter((r): r is ParetoRoute => r !== undefined)

  function handleBudgetCommit(raw: string) {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(n) && n >= 50) {
      onBudgetChange?.(n)
    } else if (raw.trim() === '') {
      onBudgetChange?.(null)
    }
  }

  return (
    /* Semi-transparent full-screen overlay */
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-3xl bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Choose your optimized route</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              NSGA-II found {ordered.length} route variants — pick what fits you:
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white text-2xl leading-none ml-4 mt-0.5 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Budget row */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-white/15 bg-white/8">
          <span className="text-sm font-medium text-gray-200 shrink-0">💰 Trip budget:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-300 text-sm font-medium">$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 800"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              onBlur={e => handleBudgetCommit(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBudgetCommit(budgetInput)}
              className="w-28 bg-white/15 border border-white/30 rounded-lg px-2.5 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-400/80 focus:bg-white/20 transition-colors"
            />
          </div>
          {userBudget != null ? (
            <span className="text-xs text-gray-300">
              Routes over <span className="text-white font-semibold">{formatCost(userBudget)}</span> are grayed out
            </span>
          ) : (
            <span className="text-xs text-gray-400">Enter a budget to filter over-budget routes</span>
          )}
        </div>

        {/* Route cards */}
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          {ordered.map(route => {
            const meta = LABEL_META[route.label]
            const isBalanced = route.label === 'balanced'
            const overBudget = userBudget != null && route.estimatedCostUsd > userBudget

            return (
              <div
                key={route.label}
                className={[
                  'flex-1 rounded-xl p-4 border transition-all relative',
                  overBudget
                    ? 'bg-white/3 border-white/5 opacity-60'
                    : isBalanced
                      ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10',
                ].join(' ')}
              >
                {/* Over-budget banner */}
                {overBudget && (
                  <div className="absolute inset-x-0 top-0 flex items-center justify-center">
                    <span className="bg-red-500/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-b-md">
                      Over budget
                    </span>
                  </div>
                )}

                {/* Title row */}
                <div className={`flex items-center justify-between mb-1 ${overBudget ? 'mt-4' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <span className="text-white font-semibold text-sm">{meta.title}</span>
                  </div>
                  {meta.recommended && !overBudget && (
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
                  <div className={`flex items-center gap-2 text-sm ${overBudget ? 'text-red-400' : 'text-gray-300'}`}>
                    <span className="text-gray-500 w-4 text-center">💰</span>
                    <span>~{formatCost(route.estimatedCostUsd)}</span>
                    {overBudget && userBudget != null && (
                      <span className="text-red-500 text-xs">
                        (+{formatCost(route.estimatedCostUsd - userBudget)} over)
                      </span>
                    )}
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
                  onClick={() => !overBudget && onSelect(route)}
                  disabled={overBudget}
                  className={[
                    'mt-4 w-full py-2 px-3 rounded-lg font-semibold text-sm transition-colors',
                    overBudget
                      ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                      : isBalanced
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white',
                  ].join(' ')}
                >
                  {overBudget ? 'Over budget' : 'Select'}
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
