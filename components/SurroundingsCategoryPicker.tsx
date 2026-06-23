'use client'

import { useState } from 'react'
import { SURROUNDINGS_OPTIONS, type SurroundingsCategory } from '@/lib/foursquare-client'

interface SurroundingsCategoryPickerProps {
  city: string
  onSearch: (categories: SurroundingsCategory[]) => void
  isLoading?: boolean
}

export default function SurroundingsCategoryPicker({
  city,
  onSearch,
  isLoading,
}: SurroundingsCategoryPickerProps) {
  const [selected, setSelected] = useState<Set<SurroundingsCategory>>(new Set())

  function toggle(key: SurroundingsCategory) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(SURROUNDINGS_OPTIONS.map(o => o.key)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Explore surroundings</h3>
          <p className="text-xs text-gray-400">near {city}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-blue-500 hover:underline">All</button>
          <span className="text-gray-300">|</span>
          <button onClick={clearAll} className="text-gray-400 hover:underline">Clear</button>
        </div>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {SURROUNDINGS_OPTIONS.map(opt => {
          const active = selected.has(opt.key)
          return (
            <button
              key={opt.key}
              onClick={() => toggle(opt.key)}
              title={opt.description}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              <span className="text-base leading-none">{opt.emoji}</span>
              <span className="font-medium truncate">{opt.label}</span>
            </button>
          )
        })}
      </div>

      <button
        disabled={selected.size === 0 || isLoading}
        onClick={() => onSearch(Array.from(selected))}
        className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Searching...' : `Search ${selected.size > 0 ? `${selected.size} categor${selected.size === 1 ? 'y' : 'ies'}` : 'activities'}`}
      </button>
    </div>
  )
}
