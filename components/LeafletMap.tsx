'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteStop, Attraction, RouteGeometry } from '@/types'

// Fix Leaflet default icons (same pattern as TREK's MapView.tsx)
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createStopIcon(index: number, isSelected: boolean, isOrigin: boolean) {
  const color = isOrigin ? '#6b7280' : isSelected ? '#1d4ed8' : '#3b82f6'
  const size = isSelected ? 38 : 30
  const label = isOrigin ? '🚗' : String(index)
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};color:white;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:${isOrigin ? 14 : isSelected ? 14 : 12}px;
      border:3px solid white;
      box-shadow:0 2px 10px rgba(0,0,0,0.35);
      cursor:pointer;
      transition:transform 0.15s;
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Auto-fit map bounds when stops or geometry changes */
function BoundsUpdater({ stops, routeGeometry }: { stops: RouteStop[]; routeGeometry: RouteGeometry | null }) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = routeGeometry
      ? routeGeometry
      : stops.map(s => [s.coordinates.lat, s.coordinates.lng])
    if (points.length < 2) return
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 })
  }, [stops, routeGeometry, map])
  return null
}

interface LeafletMapProps {
  stops: RouteStop[]
  attractions: Attraction[]
  routeGeometry: RouteGeometry | null  // real road geometry from ORS
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
}

export default function LeafletMap({
  stops,
  attractions,
  routeGeometry,
  selectedStop,
  onStopClick,
}: LeafletMapProps) {
  const center: [number, number] = [39.5, -98.35] // Center of USA — BoundsUpdater will refit

  return (
    <MapContainer
      center={center}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Routes &copy; <a href="https://openrouteservice.org/">OpenRouteService</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <BoundsUpdater stops={stops} routeGeometry={routeGeometry} />

      {/* Real road route from OpenRouteService — shown as a solid blue road line */}
      {routeGeometry && routeGeometry.length > 1 && (
        <>
          {/* Shadow / outline */}
          <Polyline
            positions={routeGeometry}
            color="#1e40af"
            weight={6}
            opacity={0.25}
          />
          {/* Main route line */}
          <Polyline
            positions={routeGeometry}
            color="#3b82f6"
            weight={4}
            opacity={0.85}
          />
        </>
      )}

      {/* Fallback: straight-line connector when ORS geometry not yet loaded */}
      {!routeGeometry && stops.length > 1 && (
        <Polyline
          positions={stops.map(s => [s.coordinates.lat, s.coordinates.lng] as [number, number])}
          color="#93c5fd"
          weight={2}
          opacity={0.6}
          dashArray="8 6"
        />
      )}

      {/* Stop markers */}
      {stops.map((stop, i) => (
        <Marker
          key={stop.city}
          position={[stop.coordinates.lat, stop.coordinates.lng]}
          icon={createStopIcon(i, selectedStop?.city === stop.city, i === 0)}
          eventHandlers={{ click: () => onStopClick(stop) }}
        >
          <Popup>
            <div className="text-sm min-w-[140px]">
              <div className="font-semibold text-gray-900">{stop.city}, {stop.state}</div>
              {stop.stayNights > 0 && (
                <div className="text-gray-500 text-xs mt-0.5">
                  {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''} &middot; {stop.checkIn}
                </div>
              )}
              {stop.driveTimeFromPrevious && (
                <div className="text-blue-600 text-xs mt-0.5 font-medium">
                  {stop.driveTimeFromPrevious} &middot; {stop.driveDistanceFromPrevious}
                </div>
              )}
              {i === 0 && <div className="text-gray-400 text-xs mt-0.5">Starting point</div>}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Attraction markers (amber circles) */}
      {attractions.map(a => (
        <CircleMarker
          key={a.id}
          center={[a.coordinates.lat, a.coordinates.lng]}
          radius={7}
          color="#d97706"
          fillColor="#fbbf24"
          fillOpacity={0.85}
          weight={2}
        >
          <Popup>
            <div className="text-sm min-w-[140px]">
              <div className="font-semibold text-gray-900">{a.name}</div>
              <div className="text-amber-600 text-xs">{a.category}</div>
              {a.rating && (
                <div className="text-yellow-500 text-xs mt-0.5">&#9733; {a.rating.toFixed(1)}</div>
              )}
              {a.description && (
                <p className="text-gray-500 text-xs mt-1 line-clamp-2">{a.description}</p>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
