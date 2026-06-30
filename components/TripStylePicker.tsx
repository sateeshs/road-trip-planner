'use client'

const TRIP_STYLES = [
  { label: 'Budget', emoji: '💰' },
  { label: 'Luxury', emoji: '✨' },
  { label: 'Family', emoji: '👨‍👩‍👧' },
  { label: 'Adventure', emoji: '🏕️' },
  { label: 'Foodie', emoji: '🍜' },
  { label: 'Romantic', emoji: '💑' },
]

type Props = {
  selectedStyles: string[]
  onToggle: (style: string) => void
  disabled?: boolean
}

export default function TripStylePicker({ selectedStyles, onToggle, disabled = false }: Props) {
  return (
    <div className="px-3 pb-2">
      <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Trip style (optional)</p>
      <div className="flex flex-wrap gap-1.5">
        {TRIP_STYLES.map(({ label, emoji }) => {
          const isSelected = selectedStyles.includes(label)
          return (
            <button
              key={label}
              type="button"
              onClick={() => !disabled && onToggle(label)}
              disabled={disabled}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                disabled
                  ? isSelected
                    ? 'bg-blue-400 text-white border-blue-400 opacity-60 cursor-not-allowed'
                    : 'bg-white text-gray-400 border-gray-200 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
