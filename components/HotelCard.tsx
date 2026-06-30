import type { Hotel, HotelOffer } from '@/types'

interface HotelCardProps {
  hotel: Hotel
  onSelect: (hotel: Hotel, offer: HotelOffer) => void
}

export default function HotelCard({ hotel, onSelect }: HotelCardProps) {
  const bestOffer = hotel.availableOffers?.[0]
  const isCamping = hotel.isCamping

  return (
    <div className={`border rounded-xl p-4 transition-colors bg-white ${isCamping ? 'border-green-200 hover:border-green-400' : 'border-gray-200 hover:border-blue-300'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isCamping && <span className="text-base leading-none">⛺</span>}
            <h3 className="font-semibold text-sm text-gray-900 truncate">{hotel.name}</h3>
          </div>
          <p className="text-xs text-gray-400 truncate">{hotel.address}</p>
        </div>
        {hotel.rating && !isCamping && (
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <span className="text-yellow-400 text-xs">&#9733;</span>
            <span className="text-xs font-medium">{hotel.rating}</span>
          </div>
        )}
      </div>

      {hotel.dealTag && (
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 font-medium ${isCamping ? 'bg-green-100 text-green-700' : 'bg-green-100 text-green-700'}`}>
          {hotel.dealTag}
        </span>
      )}

      {isCamping && hotel.amenities && hotel.amenities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {hotel.amenities.slice(0, 3).map(a => (
            <span key={a} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">{a}</span>
          ))}
        </div>
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
            className={`text-xs px-3 py-1.5 text-white rounded-lg transition-colors font-medium ${isCamping ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isCamping ? 'Reserve' : 'Select'}
          </button>
        )}
      </div>
    </div>
  )
}
