'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RouteStop, Attraction, Hotel, RouteGeometry } from '@/types'
import MapControlsPill from './MapControlsPill'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createStopIcon(index: number, isSelected: boolean, isOrigin: boolean) {
  const color = isOrigin ? '#6b7280' : isSelected ? '#1d4ed8' : '#3b82f6'
  const size = isSelected ? 42 : 34
  const label = isOrigin ? '🚗' : String(index)
  const pulse = isSelected ? `
    <div style="
      position:absolute;inset:-8px;border-radius:50%;
      border:3px solid ${color};opacity:0.4;
      animation:ping 1.2s cubic-bezier(0,0,0.2,1) infinite;
    "></div>` : ''
  return L.divIcon({
    className: '',
    html: `
      <style>@keyframes ping{75%,100%{transform:scale(1.6);opacity:0}}</style>
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${pulse}
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};color:white;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:${isOrigin ? 15 : 13}px;
          border:3px solid white;
          box-shadow:0 4px 12px rgba(0,0,0,0.3);
          cursor:pointer;position:relative;z-index:1;
        ">${label}</div>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createHotelIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;border-radius:4px;
      background:#059669;color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
    ">H</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function BoundsUpdater({ stops, routeGeometry }: { stops: RouteStop[]; routeGeometry: RouteGeometry | null }) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = routeGeometry
      ? routeGeometry
      : stops.map(s => [s.coordinates.lat, s.coordinates.lng])
    if (points.length < 2) return
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 10 })
  }, [stops, routeGeometry, map])
  return null
}

interface LeafletMapProps {
  stops: RouteStop[]
  attractions: Attraction[]
  surroundings: Attraction[]
  hotels: Hotel[]
  routeGeometry: RouteGeometry | null
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
}

export default function LeafletMap({
  stops, attractions, surroundings, hotels, routeGeometry, selectedStop, onStopClick,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[39.5, -98.35]}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Routes &copy; <a href="https://openrouteservice.org/">ORS</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <BoundsUpdater stops={stops} routeGeometry={routeGeometry} />
      <MapControlsPill />

      {/* Road route (ORS geometry) */}
      {routeGeometry && routeGeometry.length > 1 && (
        <>
          <Polyline positions={routeGeometry} color="#1e40af" weight={7} opacity={0.2} />
          <Polyline positions={routeGeometry} color="#3b82f6" weight={4} opacity={0.9} />
        </>
      )}

      {/* Fallback straight-line */}
      {!routeGeometry && stops.length > 1 && (
        <Polyline
          positions={stops.map(s => [s.coordinates.lat, s.coordinates.lng] as [number, number])}
          color="#93c5fd" weight={2} opacity={0.6} dashArray="8 6"
        />
      )}

      {/* Stop markers */}
      {stops.map((stop, i) => (
        <Marker
          key={stop.city}
          position={[stop.coordinates.lat, stop.coordinates.lng]}
          icon={createStopIcon(i, selectedStop?.city === stop.city, i === 0)}
          eventHandlers={{ click: () => onStopClick(stop) }}
          zIndexOffset={selectedStop?.city === stop.city ? 1000 : 0}
        >
          <Popup>
            <div className="text-sm min-w-[160px] p-1">
              <div className="font-bold text-gray-900">{stop.city}, {stop.state}</div>
              {stop.stayNights > 0 && (
                <div className="text-gray-500 text-xs mt-0.5">
                  📅 {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''} &nbsp;·&nbsp; {stop.checkIn}
                </div>
              )}
              {stop.driveTimeFromPrevious && (
                <div className="text-blue-600 text-xs font-semibold mt-1">
                  🚗 {stop.driveTimeFromPrevious} &nbsp;·&nbsp; {stop.driveDistanceFromPrevious}
                </div>
              )}
              {i === 0 && <div className="text-gray-400 text-xs mt-1 italic">Starting point</div>}
              <button className="mt-2 text-xs text-blue-600 underline" onClick={() => onStopClick(stop)}>
                View hotels &amp; attractions →
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Hotel markers (green squares) — shown near their stop */}
      {hotels.filter(h => h.coordinates.lat !== 0).map(h => (
        <Marker
          key={h.hotelId}
          position={[h.coordinates.lat, h.coordinates.lng]}
          icon={createHotelIcon()}
        >
          <Popup>
            <div className="text-sm min-w-[160px] p-1">
              <div className="font-bold text-gray-900">{h.name}</div>
              {h.rating && <div className="text-yellow-500 text-xs">{'★'.repeat(Math.round(h.rating))}</div>}
              {h.pricePerNight && (
                <div className="text-green-700 text-xs font-semibold mt-0.5">
                  ${h.pricePerNight.toFixed(0)}/night
                </div>
              )}
              {h.dealTag && <div className="text-xs text-orange-500 mt-0.5">🏷 {h.dealTag}</div>}
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
          color="#d97706" fillColor="#fbbf24" fillOpacity={0.85} weight={2}
        >
          <Popup>
            <div className="text-sm min-w-[140px] p-1">
              <div className="font-bold text-gray-900">{a.name}</div>
              <div className="text-amber-600 text-xs">{a.category}</div>
              {a.rating && <div className="text-yellow-500 text-xs mt-0.5">★ {a.rating.toFixed(1)}</div>}
              {a.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{a.description}</p>}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Surroundings markers (teal) */}
      {surroundings.map(s => (
        <CircleMarker
          key={`surr-${s.id}`}
          center={[s.coordinates.lat, s.coordinates.lng]}
          radius={6}
          color="#0d9488" fillColor="#2dd4bf" fillOpacity={0.85} weight={2}
        >
          <Popup>
            <div className="text-sm min-w-[140px] p-1">
              <div className="font-bold text-gray-900">{s.name}</div>
              <div className="text-teal-600 text-xs">{s.category}</div>
              {s.rating && <div className="text-yellow-500 text-xs mt-0.5">★ {s.rating.toFixed(1)}</div>}
              {s.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{s.description}</p>}
              {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs mt-1 block">Visit →</a>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
