'use client'

import { useState } from 'react'
import type { RouteStop, Hotel, Attraction, HotelOffer } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'
import HotelCard from './HotelCard'
import AttractionCard from './AttractionCard'
import SurroundingsCard from './SurroundingsCard'
import SurroundingsCategoryPicker from './SurroundingsCategoryPicker'

type Tab = 'attractions' | 'hotels' | 'surroundings'

interface StopSidebarProps {
  stop: RouteStop
  hotels: Hotel[]
  attractions: Attraction[]
  surroundings: Attraction[]
  onClose: () => void
  onSelectHotel: (hotel: Hotel, offer: HotelOffer) => void
  onExploreSurroundings: (city: string, state: string, categories: SurroundingsCategory[]) => void
  isSurroundingsLoading?: boolean
}

export default function StopSidebar({
  stop,
  hotels,
  attractions,
  surroundings,
  onClose,
  onSelectHotel,
  onExploreSurroundings,
  isSurroundingsLoading,
}: StopSidebarProps) {
  const [tab, setTab] = useState<Tab>('attractions')

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'attractions', label: 'Attractions', count: attractions.length },
    { key: 'hotels',      label: 'Hotels',      count: hotels.length },
    { key: 'surroundings',label: 'Explore',     count: surroundings.length },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">{stop.city}, {stop.state}</h2>
          <p className="text-xs text-gray-400">
            {stop.checkIn} &rarr; {stop.checkOut}
            &nbsp;&middot;&nbsp;{stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''}
            {stop.driveTimeFromPrevious && (
              <> &middot; <span className="text-blue-500">{stop.driveTimeFromPrevious}</span> drive</>
            )}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">&times;</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.key === 'surroundings' && <span>🌲</span>}
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                tab === t.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">

        {tab === 'attractions' && (
          attractions.length > 0 ? (
            <div className="space-y-2">
              {attractions.map(a => <AttractionCard key={a.id} attraction={a} />)}
            </div>
          ) : (
            <EmptyState message={`Ask Claude about places to visit in ${stop.city}`} />
          )
        )}

        {tab === 'hotels' && (
          hotels.length > 0 ? (
            <div className="space-y-2">
              {hotels.map(h => <HotelCard key={h.hotelId} hotel={h} onSelect={onSelectHotel} />)}
            </div>
          ) : (
            <EmptyState message={`Ask Claude to find hotels in ${stop.city}`} />
          )
        )}

        {tab === 'surroundings' && (
          <div className="space-y-3">
            {/* Always show the picker so user can choose/change categories */}
            <SurroundingsCategoryPicker
              city={stop.city}
              isLoading={isSurroundingsLoading}
              onSearch={(cats) => onExploreSurroundings(stop.city, stop.state, cats)}
            />

            {/* Results below picker */}
            {surroundings.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">{surroundings.length} activities found nearby</p>
                <div className="space-y-2">
                  {surroundings.map(s => <SurroundingsCard key={s.id} attraction={s} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-sm text-gray-400 text-center">
      {message}
    </div>
  )
}
