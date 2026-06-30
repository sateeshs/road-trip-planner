'use client'

import type { SearchHotelsResult, Hotel } from '@/types'

interface Props {
  result: SearchHotelsResult
}

function StarRating({ stars }: { stars?: number }) {
  const filled = Math.round(stars ?? 0)
  return (
    <span className="text-amber-400 text-xs" aria-label={`${filled} stars`}>
      {'★'.repeat(filled)}{'☆'.repeat(Math.max(0, 5 - filled))}
    </span>
  )
}

function HotelRow({ hotel }: { hotel: Hotel }) {
  const topAmenities = (hotel.amenities ?? []).slice(0, 3)
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{hotel.name}</p>
          <StarRating stars={hotel.starRating} />
        </div>
        {hotel.pricePerNight && (
          <div className="text-right flex-none">
            <p className="text-sm font-bold text-gray-900">${hotel.pricePerNight}</p>
            <p className="text-[10px] text-gray-400">per night</p>
          </div>
        )}
      </div>
      {topAmenities.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {topAmenities.map(a => (
            <span key={a} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full capitalize">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HotelResultsCard({ result }: Props) {
  const { hotels = [], city } = result
  const topHotels = [...hotels].sort((a, b) => (a.pricePerNight ?? 999) - (b.pricePerNight ?? 999)).slice(0, 3)

  return (
    <div className="bg-white border border-green-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-green-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🏨</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Hotels · {city}</span>
      </div>

      <div className="px-4">
        {topHotels.length === 0 ? (
          <p className="py-4 text-sm text-gray-400 text-center">No hotels found near {city}</p>
        ) : (
          topHotels.map(h => <HotelRow key={h.hotelId} hotel={h} />)
        )}
      </div>

      {topHotels.length > 0 && (
        <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">Click a stop on the map to book · Prices per night</p>
        </div>
      )}
    </div>
  )
}
