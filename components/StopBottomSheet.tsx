'use client'
import { useState, useEffect } from 'react'
import type { RouteStop, Hotel, Attraction, HotelOffer } from '@/types'
import type { SurroundingsCategory } from '@/lib/foursquare-client'
import HotelCard from './HotelCard'
import AttractionCard from './AttractionCard'
import SurroundingsCard from './SurroundingsCard'
import SurroundingsCategoryPicker from './SurroundingsCategoryPicker'

type Tab = 'attractions' | 'hotels' | 'surroundings'

interface StopBottomSheetProps {
  stop: RouteStop | null
  hotels: Hotel[]
  attractions: Attraction[]
  surroundings: Attraction[]
  isSurroundingsLoading?: boolean
  isRemovable?: boolean   // false for origin and destination
  onClose: () => void
  onSelectHotel: (hotel: Hotel, offer: HotelOffer) => void
  onExploreSurroundings: (city: string, state: string, categories: SurroundingsCategory[]) => void
  onRemoveStop?: (stop: RouteStop) => void
}

export default function StopBottomSheet({
  stop,
  hotels,
  attractions,
  surroundings,
  isSurroundingsLoading,
  isRemovable,
  onClose,
  onSelectHotel,
  onExploreSurroundings,
  onRemoveStop,
}: StopBottomSheetProps) {
  const [tab, setTab] = useState<Tab>('attractions')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (stop) {
      setTab('attractions')
      setTimeout(() => setVisible(true), 10)
    } else {
      setVisible(false)
    }
  }, [stop])

  if (!stop && !visible) return null

  const tabs: Array<{ key: Tab; label: string; emoji?: string; count: number }> = [
    { key: 'attractions', label: 'Attractions', count: attractions.length },
    { key: 'hotels', label: 'Hotels', count: hotels.length },
    { key: 'surroundings', label: 'Explore', emoji: '🌲', count: surroundings.length },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-[1100] transition-opacity duration-300 ${visible && stop ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1200] bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${visible && stop ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '60vh' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-2">
          <div>
            <h2 className="text-base font-bold text-gray-900">{stop?.city}, {stop?.state}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {stop?.checkIn} → {stop?.checkOut}
              {stop && stop.stayNights > 0 && <> · {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''}</>}
              {stop?.driveTimeFromPrevious && (
                <> · <span className="text-blue-500 font-medium">{stop.driveTimeFromPrevious}</span> drive</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {isRemovable && stop && onRemoveStop && (
              <button
                onClick={() => { onRemoveStop(stop); onClose() }}
                className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                title="Remove this stop from the route"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                  <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
                Remove stop
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.emoji && <span>{t.emoji}</span>}
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === t.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-3" style={{ maxHeight: 'calc(60vh - 130px)' }}>
          {tab === 'attractions' && (
            attractions.length > 0
              ? <div className="grid grid-cols-2 gap-2">{attractions.map(a => <AttractionCard key={a.id} attraction={a} />)}</div>
              : <p className="text-sm text-gray-400 py-4 text-center">Ask the AI about places to visit in {stop?.city}</p>
          )}
          {tab === 'hotels' && (
            hotels.length > 0
              ? <div className="grid grid-cols-2 gap-2">{hotels.map(h => <HotelCard key={h.hotelId} hotel={h} onSelect={onSelectHotel} />)}</div>
              : <p className="text-sm text-gray-400 py-4 text-center">Ask the AI to find hotels in {stop?.city}</p>
          )}
          {tab === 'surroundings' && stop && (
            <div className="space-y-3">
              <SurroundingsCategoryPicker
                city={stop.city}
                isLoading={isSurroundingsLoading}
                onSearch={cats => onExploreSurroundings(stop.city, stop.state, cats)}
              />
              {surroundings.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {surroundings.map(s => <SurroundingsCard key={s.id} attraction={s} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
