import type { Attraction } from '@/types'

const CATEGORY_EMOJIS: Record<string, string> = {
  camping: '⛺', campground: '⛺',
  kayak: '🚣', canoe: '🚣',
  hik: '🥾', trail: '🥾',
  cycl: '🚴', bike: '🚴',
  atv: '🏍️', 'off-road': '🏍️',
  horse: '🐴', equestrian: '🐴',
  climb: '🧗',
  fish: '🎣',
  swim: '🏊', lake: '🏊', beach: '🏖️',
  raft: '🌊', river: '🌊',
  boat: '⛵', marina: '⛵',
  scenic: '🏔️', lookout: '🏔️', viewpoint: '🏔️',
  ski: '⛷️', snow: '⛷️',
  waterfall: '💦',
  park: '🌲', nature: '🌲',
}

export function getSurroundingsEmoji(category: string): string {
  const lower = category.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key)) return emoji
  }
  return '🏕️'
}

interface SurroundingsCardProps {
  attraction: Attraction
  onSave?: () => void
  saved?: boolean
}

export default function SurroundingsCard({ attraction, onSave, saved }: SurroundingsCardProps) {
  const emoji = getSurroundingsEmoji(attraction.category)
  return (
    <div className="border border-green-100 rounded-xl p-3 bg-white hover:border-green-300 transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-xl leading-none mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-1">
            <h3 className="font-semibold text-sm text-gray-900 leading-tight">{attraction.name}</h3>
            <div className="flex items-center gap-1 shrink-0">
              {attraction.rating && (
                <div className="flex items-center gap-0.5">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs font-medium text-gray-600">{attraction.rating.toFixed(1)}</span>
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
          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full mt-0.5 inline-block">
            {attraction.category}
          </span>
          {attraction.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{attraction.description}</p>
          )}
          {attraction.address && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{attraction.address}</p>
          )}
          {attraction.website && (
            <a href={attraction.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
              Visit website &rarr;
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
