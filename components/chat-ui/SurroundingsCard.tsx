'use client'

import { useState } from 'react'
import type { SearchSurroundingsResult, Attraction } from '@/types'

interface Props {
  result: SearchSurroundingsResult
}

const WATER_KEYWORDS = /kayak|canoe|paddle|boat|cruise|sail|raft|swim|water|fishing|marina/i
const LAND_KEYWORDS = /hike|hiking|trail|climb|zip|scenic|horse|atv|cycle|camp|ski|nature|park|waterfall|peak|cave/i

function groupActivities(surroundings: Attraction[]): {
  water: Attraction[]
  land: Attraction[]
  other: Attraction[]
} {
  const water: Attraction[] = []
  const land: Attraction[] = []
  const other: Attraction[] = []

  for (const s of surroundings) {
    const cat = s.category + ' ' + s.name
    if (WATER_KEYWORDS.test(cat)) {
      water.push(s)
    } else if (LAND_KEYWORDS.test(cat)) {
      land.push(s)
    } else {
      other.push(s)
    }
  }

  return { water, land, other }
}

function ActivityChip({ activity }: { activity: Attraction }) {
  return (
    <span className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full truncate max-w-[160px]">
      {activity.name}
    </span>
  )
}

function ActivityGroup({ label, items }: { label: string; items: Attraction[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(a => (
          <ActivityChip key={a.id} activity={a} />
        ))}
      </div>
    </div>
  )
}

const COLLAPSE_THRESHOLD = 8

export default function SurroundingsCard({ result }: Props) {
  const { surroundings, city } = result
  const [expanded, setExpanded] = useState(false)

  const displayed = expanded ? surroundings : surroundings.slice(0, COLLAPSE_THRESHOLD)
  const { water, land, other } = groupActivities(displayed)
  const hasMore = surroundings.length > COLLAPSE_THRESHOLD

  return (
    <div className="bg-white border border-teal-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-teal-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🌿</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Surroundings · {city}</span>
      </div>

      <div className="p-4">
        {surroundings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">No outdoor activities found near {city}</p>
        ) : (
          <>
            <ActivityGroup label="💧 Water" items={water} />
            <ActivityGroup label="🥾 Land" items={land} />
            <ActivityGroup label="✨ Other" items={other} />
          </>
        )}
      </div>

      {hasMore && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            {expanded ? 'Show less ↑' : `Show all ${surroundings.length} activities ↓`}
          </button>
        </div>
      )}
    </div>
  )
}
