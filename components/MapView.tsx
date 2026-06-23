'use client'
import dynamic from 'next/dynamic'
import type { RouteStop, Attraction, Hotel, RouteGeometry, ConfirmedReservation } from '@/types'
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

interface MapViewProps {
  stops: RouteStop[]
  attractions: Attraction[]
  surroundings: Attraction[]
  hotels: Hotel[]
  routeGeometry: RouteGeometry | null
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
  confirmedReservations?: ConfirmedReservation[]
}

export default function MapView(props: MapViewProps) {
  return <LeafletMap {...props} />
}
