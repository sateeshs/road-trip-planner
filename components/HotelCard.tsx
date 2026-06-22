import type { Hotel, HotelOffer } from '@/types'

interface HotelCardProps {
  hotel: Hotel
  onSelect: (hotel: Hotel, offer: HotelOffer) => void
}

export default function HotelCard({ hotel, onSelect }: HotelCardProps) {
  const bestOffer = hotel.availableOffers?.[0]
  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors bg-white">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{hotel.name}</h3>
          <p className="text-xs text-gray-400 truncate">{hotel.address}</p>
        </div>
        {hotel.rating && (
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <span className="text-yellow-400 text-xs">&#9733;</span>
            <span className="text-xs font-medium">{hotel.rating}</span>
          </div>
        )}
      </div>

      {hotel.dealTag && (
        <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full mb-2 font-medium">
          {hotel.dealTag}
        </span>
      )}

      <div className="flex items-center justify-between mt-3">
        <div>
          {hotel.pricePerNight ? (
            <span className="text-base font-bold text-gray-900">
              ${hotel.pricePerNight.toFixed(0)}
              <span className="text-xs font-normal text-gray-400">/night</span>
            </span>
          ) : (
            <span className="text-xs text-gray-400">Price on request</span>
          )}
        </div>
        {bestOffer && (
          <button
            onClick={() => onSelect(hotel, bestOffer)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Select
          </button>
        )}
      </div>
    </div>
  )
}
