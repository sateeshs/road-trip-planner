'use client'
import dynamic from 'next/dynamic'
import { Component, type ReactNode } from 'react'
import type { RouteStop, Attraction, Hotel, RouteGeometry, ConfirmedReservation } from '@/types'
import type { ProactivePOIs } from '@/hooks/useProactivePlaces'
import type { CorridorStop } from '@/hooks/useCorridorStops'
import Spinner from './shared/Spinner'

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span className="text-gray-400 text-sm">Loading map...</span>
      </div>
    </div>
  ),
})

// Catch any runtime errors inside the map and show them instead of a blank screen
class MapErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-red-50">
          <div className="max-w-md p-4 bg-white rounded-xl shadow text-center">
            <p className="text-red-600 font-bold text-sm mb-1">Map failed to load</p>
            <p className="text-gray-500 text-xs font-mono break-all">{this.state.error}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

interface MapViewProps {
  stops: RouteStop[]
  attractions: Attraction[]
  surroundings: Attraction[]
  hotels: Hotel[]
  routeGeometry: RouteGeometry | null
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
  onMapRightClick?: (lat: number, lng: number, x: number, y: number) => void
  confirmedReservations?: ConfirmedReservation[]
  proactivePOIs?: ProactivePOIs
  highlightedCorridorStop?: CorridorStop | null
}

export default function MapView(props: MapViewProps) {
  return (
    <MapErrorBoundary>
      <LeafletMap {...props} />
    </MapErrorBoundary>
  )
}
