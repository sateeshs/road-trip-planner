'use client'

const SUGGESTIONS = [
  { label: '🌆 Chicago → Nashville', full: 'Plan a road trip from Chicago to Nashville for a family of 4, 3 days' },
  { label: '🗽 NYC → Miami', full: 'Family trip from New York to Miami, 5 days, 2 adults 2 kids' },
  { label: '🤠 Dallas → New Orleans', full: 'Road trip from Dallas to New Orleans, weekend trip, 2 adults' },
  { label: '🌉 LA → San Francisco', full: 'Coastal road trip from Los Angeles to San Francisco, 3 days' },
  { label: '🌲 Seattle → Portland', full: 'Road trip from Seattle to Portland, day trip with scenic stops' },
]

interface MapSuggestionsProps {
  onSelect: (text: string) => void
}

export default function MapSuggestions({ onSelect }: MapSuggestionsProps) {
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex flex-wrap gap-2 justify-center px-4 max-w-2xl">
      {SUGGESTIONS.map(s => (
        <button
          key={s.label}
          onClick={() => onSelect(s.full)}
          className="bg-white/90 backdrop-blur-md border border-white/50 shadow-md rounded-full px-4 py-2 text-sm font-medium text-gray-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all whitespace-nowrap"
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
