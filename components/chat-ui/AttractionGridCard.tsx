'use client'

import type { SearchAttractionsResult, Attraction } from '@/types'

interface Props {
  result: SearchAttractionsResult
}

const CATEGORY_EMOJI: Record<string, string> = {
  museum: '🏛️',
  'art gallery': '🖼️',
  park: '🌳',
  viewpoint: '👁️',
  'scenic viewpoint': '👁️',
  zoo: '🦁',
  aquarium: '🐠',
  'theme park': '🎢',
  waterfall: '💧',
  beach: '🏖️',
  'mountain peak': '⛰️',
  monument: '🗿',
  memorial: '🕊️',
  castle: '🏰',
  theatre: '🎭',
  cinema: '🎬',
  'nature reserve': '🌿',
  garden: '🌸',
}

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '🎯'
}

function AttractionTile({ attraction }: { attraction: Attraction }) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-amber-50/50 rounded-xl border border-amber-100/70">
      <span className="text-xl flex-none">{categoryEmoji(attraction.category)}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{attraction.name}</p>
        <p className="text-[10px] text-amber-600 mt-0.5">{attraction.category}</p>
      </div>
    </div>
  )
}

export default function AttractionGridCard({ result }: Props) {
  const { attractions, city } = result
  const displayed = attractions.slice(0, 6)

  return (
    <div className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-amber-500 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🎯</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Attractions · {city}</span>
      </div>

      <div className="p-3">
        {displayed.length === 0 ? (
          <p className="py-3 text-sm text-gray-400 text-center">No attractions found near {city}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayed.map(a => <AttractionTile key={a.id} attraction={a} />)}
          </div>
        )}
      </div>

      {attractions.length > 6 && (
        <div className="px-4 py-2 border-t border-amber-50 bg-amber-50/40">
          <p className="text-[10px] text-amber-600">+{attractions.length - 6} more · click a stop on the map</p>
        </div>
      )}
    </div>
  )
}
