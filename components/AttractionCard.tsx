import type { Attraction } from '@/types'

interface AttractionCardProps {
  attraction: Attraction
  onSave?: () => void
  saved?: boolean
}

export default function AttractionCard({ attraction, onSave, saved }: AttractionCardProps) {
  return (
    <div className="border border-gray-100 rounded-xl p-3 bg-white hover:border-amber-200 transition-colors">
      <div className="flex justify-between items-start gap-1">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{attraction.name}</h3>
          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">{attraction.category}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {attraction.rating && (
            <div className="flex items-center gap-0.5">
              <span className="text-yellow-400 text-xs">&#9733;</span>
              <span className="text-xs font-medium">{attraction.rating.toFixed(1)}</span>
            </div>
          )}
          {onSave && (
            <button
              onClick={onSave}
              title={saved ? 'Saved to plan' : 'Save to plan'}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
                saved
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-500'
              }`}
            >
              {saved ? '✓' : '+'}
            </button>
          )}
        </div>
      </div>
      {attraction.description && (
        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{attraction.description}</p>
      )}
      {attraction.website && (
        <a href={attraction.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
          Visit website &rarr;
        </a>
      )}
    </div>
  )
}
