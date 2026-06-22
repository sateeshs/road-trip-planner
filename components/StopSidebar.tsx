import type { RouteStop, Hotel, Attraction, HotelOffer } from '@/types'
import HotelCard from './HotelCard'
import AttractionCard from './AttractionCard'

interface StopSidebarProps {
  stop: RouteStop
  hotels: Hotel[]
  attractions: Attraction[]
  onClose: () => void
  onSelectHotel: (hotel: Hotel, offer: HotelOffer) => void
}

export default function StopSidebar({ stop, hotels, attractions, onClose, onSelectHotel }: StopSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">{stop.city}, {stop.state}</h2>
          <p className="text-xs text-gray-400">
            {stop.checkIn} &rarr; {stop.checkOut} &middot; {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''}
            {stop.driveTimeFromPrevious && ` · ${stop.driveTimeFromPrevious} drive`}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg px-2">&times;</button>
      </div>

      <div className="flex gap-4 px-4 py-2 overflow-x-auto flex-1">
        {attractions.length > 0 && (
          <div className="min-w-[240px]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attractions</h3>
            <div className="space-y-2">
              {attractions.slice(0, 3).map(a => <AttractionCard key={a.id} attraction={a} />)}
            </div>
          </div>
        )}
        {hotels.length > 0 && (
          <div className="min-w-[240px]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hotels</h3>
            <div className="space-y-2">
              {hotels.slice(0, 3).map(h => (
                <HotelCard key={h.hotelId} hotel={h} onSelect={onSelectHotel} />
              ))}
            </div>
          </div>
        )}
        {attractions.length === 0 && hotels.length === 0 && (
          <div className="flex items-center justify-center w-full text-sm text-gray-400">
            Ask Claude about places to visit or hotels in {stop.city}
          </div>
        )}
      </div>
    </div>
  )
}
