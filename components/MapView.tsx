'use client'

import dynamic from 'next/dynamic'
import type { RouteStop, Attraction } from '@/types'

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: () => (
  <div className="w-full h-full flex items-center justify-center bg-gray-100">
    <span className="text-gray-400 text-sm">Loading map...</span>
  </div>
) })

interface MapViewProps {
  stops: RouteStop[]
  attractions: Attraction[]
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
}

export default function MapView(props: MapViewProps) {
  return <LeafletMap {...props} />
}
