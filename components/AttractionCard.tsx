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
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                saved
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
              }`}
            >
              {saved ? '✓ Saved' : '+ Save'}
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
