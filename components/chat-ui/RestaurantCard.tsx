'use client'

import type { SearchRestaurantsResult } from '@/types'

interface Props {
  result: SearchRestaurantsResult
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  fast_food: '🍔',
  food_court: '🍱',
  bar: '🍺',
  pub: '🍺',
  bistro: '🥘',
}

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '🍴'
}

export default function RestaurantCard({ result }: Props) {
  const { restaurants = [], city } = result
  const displayed = restaurants.slice(0, 6)
  const overflow = restaurants.length - displayed.length

  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50 overflow-hidden text-sm mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5">
        <span className="text-base">🍽️</span>
        <span className="font-semibold">Dining · {city}</span>
        <span className="ml-auto text-orange-200 text-xs">{restaurants.length} spot{restaurants.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {displayed.length === 0 ? (
          <p className="text-orange-600 text-center py-2">No dining spots found near {city}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {displayed.map(r => (
                <div key={r.id} className="bg-white rounded-lg border border-orange-100 px-3 py-2">
                  <div className="text-lg leading-none mb-1">{categoryEmoji(r.category)}</div>
                  <p className="font-medium text-gray-900 text-xs leading-snug line-clamp-2">{r.name}</p>
                  <p className="text-orange-600 text-[11px] mt-0.5 capitalize">{r.category.replace('_', ' ')}</p>
                  {r.description && (
                    <p className="text-gray-400 text-[10px] mt-0.5 line-clamp-1">{r.description}</p>
                  )}
                </div>
              ))}
            </div>
            {overflow > 0 && (
              <p className="text-center text-orange-500 text-[11px] mt-2">
                +{overflow} more · click a stop on the map to explore
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
