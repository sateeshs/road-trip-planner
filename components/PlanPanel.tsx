'use client'
import { useState } from 'react'
import type { PlanActivity } from '@/types'
import { getSurroundingsEmoji } from './SurroundingsCard'

interface PlanPanelProps {
  activities: PlanActivity[]
  open: boolean
  onClose: () => void
  onRemove: (id: string) => void
}

function activityEmoji(a: PlanActivity): string {
  if (a.type === 'outdoor') return getSurroundingsEmoji(a.category)
  return '📍'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PlanPanel({ activities, open, onClose, onRemove }: PlanPanelProps) {
  const [copied, setCopied] = useState(false)

  // Group by city
  const byCityOrder: string[] = []
  const byCity: Record<string, PlanActivity[]> = {}
  for (const a of activities) {
    if (!byCity[a.city]) { byCity[a.city] = []; byCityOrder.push(a.city) }
    byCity[a.city].push(a)
  }

  function handleShare() {
    const lines: string[] = ['🗺️ My Road Trip Plan\n']
    for (const city of byCityOrder) {
      const items = byCity[city]
      const first = items[0]
      lines.push(`📍 ${city}, ${first.state}  (${formatDate(first.checkIn)} – ${formatDate(first.checkOut)})`)
      for (const a of items) {
        lines.push(`  ${activityEmoji(a)} ${a.name}  [${a.category}]`)
        if (a.website) lines.push(`     🔗 ${a.website}`)
      }
      lines.push('')
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[1300] bg-black/20 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-80 z-[1400] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 bg-white">
          <div>
            <h2 className="text-base font-bold text-gray-900">My Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activities.length === 0 ? 'No activities saved yet' : `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activities.length > 0 && (
              <button
                onClick={handleShare}
                title="Copy plan to clipboard"
                className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-16">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Build your activity plan</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Tap the <span className="font-semibold text-blue-500">+</span> button on any attraction or outdoor activity to add it here.
              </p>
            </div>
          ) : (
            <div className="py-3">
              {byCityOrder.map(city => {
                const items = byCity[city]
                const first = items[0]
                return (
                  <div key={city} className="mb-1">
                    {/* City header */}
                    <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 sticky top-0">
                      <div className="font-semibold text-xs text-gray-700 uppercase tracking-wide">{city}, {first.state}</div>
                      <div className="text-xs text-gray-400">{formatDate(first.checkIn)} – {formatDate(first.checkOut)}</div>
                    </div>

                    {/* Activity rows */}
                    <div className="divide-y divide-gray-50">
                      {items.map(a => (
                        <div key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 group transition-colors">
                          <span className="text-xl leading-none mt-0.5 shrink-0">{activityEmoji(a)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                            <p className="text-xs text-gray-400">{a.category}</p>
                            {a.website && (
                              <a
                                href={a.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline"
                              >
                                Visit →
                              </a>
                            )}
                          </div>
                          <button
                            onClick={() => onRemove(a.id)}
                            title="Remove from plan"
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-sm shrink-0 mt-0.5"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
