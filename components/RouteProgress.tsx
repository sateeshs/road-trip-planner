import type { RouteStop } from '@/types'

export default function RouteProgress({ stops, currentIndex }: { stops: RouteStop[]; currentIndex: number }) {
  if (stops.length === 0) return null
  return (
    <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
      {stops.map((stop, i) => (
        <div key={stop.city} className="flex items-center gap-1 shrink-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            i <= currentIndex ? 'bg-blue-600' : 'bg-gray-300'
          }`}>{i + 1}</div>
          <span className={`text-xs ${i <= currentIndex ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{stop.city}</span>
          {i < stops.length - 1 && <span className="text-gray-300 text-xs mx-0.5">&rarr;</span>}
        </div>
      ))}
    </div>
  )
}
