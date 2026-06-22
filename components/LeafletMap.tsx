'use client'

import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteStop, Attraction } from '@/types'

// Fix Leaflet default icons (same fix as TREK's MapView.tsx)
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createStopIcon(index: number, isSelected: boolean) {
  const color = isSelected ? '#1d4ed8' : '#3b82f6'
  const size = isSelected ? 36 : 30
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};color:white;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${isSelected ? 14 : 12}px;
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">${index + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

interface LeafletMapProps {
  stops: RouteStop[]
  attractions: Attraction[]
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
}

export default function LeafletMap({ stops, attractions, selectedStop, onStopClick }: LeafletMapProps) {
  const center: [number, number] = stops.length > 0
    ? [stops[Math.floor(stops.length / 2)].coordinates.lat, stops[Math.floor(stops.length / 2)].coordinates.lng]
    : [39.5, -98.35] // Center of USA

  const routePoints: [number, number][] = stops.map(s => [s.coordinates.lat, s.coordinates.lng])

  return (
    <MapContainer
      center={center}
      zoom={stops.length > 0 ? 6 : 4}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Route polyline */}
      {routePoints.length > 1 && (
        <Polyline positions={routePoints} color="#3b82f6" weight={3} opacity={0.7} dashArray="8 4" />
      )}

      {/* Stop markers */}
      {stops.map((stop, i) => (
        <Marker
          key={stop.city}
          position={[stop.coordinates.lat, stop.coordinates.lng]}
          icon={createStopIcon(i, selectedStop?.city === stop.city)}
          eventHandlers={{ click: () => onStopClick(stop) }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{stop.city}, {stop.state}</div>
              {stop.stayNights > 0 && <div className="text-gray-500">{stop.stayNights} night{stop.stayNights > 1 ? 's' : ''}</div>}
              {stop.driveTimeFromPrevious && <div className="text-gray-500">{stop.driveTimeFromPrevious} drive</div>}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Attraction markers */}
      {attractions.map(a => (
        <CircleMarker
          key={a.id}
          center={[a.coordinates.lat, a.coordinates.lng]}
          radius={6}
          color="#f59e0b"
          fillColor="#fbbf24"
          fillOpacity={0.8}
          weight={2}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{a.name}</div>
              <div className="text-gray-500 text-xs">{a.category}</div>
              {a.rating && <div className="text-yellow-500">&#9733; {a.rating.toFixed(1)}</div>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
