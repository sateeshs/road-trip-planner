'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import type { RouteStop, Attraction, Hotel, RouteGeometry, ConfirmedReservation } from '@/types'
import type { ProactivePOIs } from '@/hooks/useProactivePlaces'
import MapControlsPill from './MapControlsPill'

// Fix default Leaflet icon URLs (Vite/Next.js bundler issue — ported from TREK)
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// ─── Icon factories (module-level cache, ported from TREK iconCache pattern) ──

const stopIconCache = new Map<string, L.DivIcon>()

function createStopIcon(
  index: number,
  isSelected: boolean,
  isOrigin: boolean,
  isDestination: boolean,
) {
  const key = `${index}:${isSelected}:${isOrigin}:${isDestination}`
  if (stopIconCache.has(key)) return stopIconCache.get(key)!

  // Origin = green, Destination = red, intermediate = blue, selected = dark
  const baseColor = isOrigin ? '#16a34a' : isDestination ? '#dc2626' : '#0a84ff'
  const color = isSelected ? '#111827' : baseColor
  const borderColor = isSelected ? '#111827' : 'white'
  const size = isSelected ? 48 : isOrigin || isDestination ? 42 : 38
  const shadow = isSelected
    ? '0 0 0 3px rgba(17,24,39,0.22), 0 4px 14px rgba(0,0,0,0.35)'
    : isOrigin || isDestination
      ? '0 3px 12px rgba(0,0,0,0.32)'
      : '0 2px 10px rgba(0,0,0,0.28)'

  // Labels: 🚗 for origin, 🏁 for destination, number for intermediate
  const label = isOrigin ? '🚗' : isDestination ? '🏁' : String(index)
  const fontSize = isOrigin || isDestination ? 18 : 14

  // Label pill below the marker (START / END / city abbreviation)
  const pillText = isOrigin ? 'START' : isDestination ? 'END' : ''
  const pillColor = isOrigin ? '#16a34a' : '#dc2626'
  const pill = pillText ? `<div style="
    position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
    background:${pillColor};color:white;
    font-size:8px;font-weight:800;letter-spacing:0.5px;
    padding:1px 5px;border-radius:99px;
    white-space:nowrap;pointer-events:none;
    border:1.5px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.2);
  ">${pillText}</div>` : ''

  // Pulse ring for selected stop
  const pulse = isSelected ? `<div style="
    position:absolute;inset:-8px;border-radius:50%;
    border:2.5px solid #111827;opacity:0.3;
    animation:rtp-ping 1.4s cubic-bezier(0,0,0.2,1) infinite;
  "></div>` : ''

  const totalH = size + (pill ? 20 : 0)

  const icon = L.divIcon({
    className: '',
    html: `
      <style>@keyframes rtp-ping{75%,100%{transform:scale(1.7);opacity:0}}</style>
      <div style="position:relative;width:${size}px;height:${totalH}px;">
        ${pulse}
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};color:white;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:${fontSize}px;
          border:2.5px solid ${borderColor};
          box-shadow:${shadow};
          cursor:pointer;position:relative;z-index:1;
          will-change:transform;
        ">${label}</div>
        ${pill}
      </div>`,
    iconSize: [size, totalH],
    iconAnchor: [size / 2, size / 2],
  })
  stopIconCache.set(key, icon)
  return icon
}

let _hotelIcon: L.DivIcon | null = null
function createHotelIcon(): L.DivIcon {
  if (_hotelIcon) return _hotelIcon
  _hotelIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:5px;
      background:#059669;color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:800;letter-spacing:-0.5px;
      border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.28);
      cursor:pointer;
    ">H</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
  return _hotelIcon
}

// Confirmed reservation marker — gold with checkmark, ported from TREK's confirmed status styling
const confirmedIconCache = new Map<string, L.DivIcon>()
function createConfirmedHotelIcon(status: 'confirmed' | 'pending'): L.DivIcon {
  const cached = confirmedIconCache.get(status)
  if (cached) return cached
  const bg = status === 'confirmed' ? '#16a34a' : '#ca8a04'
  const border = status === 'confirmed' ? '#86efac' : '#fde047'
  const label = status === 'confirmed' ? '✓' : '…'
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:6px;
      background:${bg};color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:800;
      border:2.5px solid ${border};
      box-shadow:0 2px 10px rgba(0,0,0,0.3);
      cursor:pointer;position:relative;
    ">
      ${label}
      <div style="
        position:absolute;top:-4px;right:-4px;
        width:10px;height:10px;border-radius:50%;
        background:${bg};border:1.5px solid white;
        font-size:7px;display:flex;align-items:center;justify-content:center;
      ">🏨</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
  confirmedIconCache.set(status, icon)
  return icon
}

// ─── Cluster icon (ported from TREK clusterIconCreateFunction) ─────────────

function clusterIconCreate(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 34 : count < 50 ? 40 : 46
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:#111827;color:white;
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 2px 10px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;cursor:pointer;
      transition:transform 0.15s ease,box-shadow 0.15s ease;
    ">${count}</div>`,
    className: '',
    iconSize: L.point(size, size),
  })
}

// ─── BoundsUpdater: fits map to route or stops ─────────────────────────────

function BoundsUpdater({ stops, routeGeometry }: { stops: RouteStop[]; routeGeometry: RouteGeometry | null }) {
  const map = useMap()
  const prev = useRef<string>('')
  useEffect(() => {
    const points: [number, number][] = routeGeometry
      ? routeGeometry
      : stops.map(s => [s.coordinates.lat, s.coordinates.lng])
    if (points.length < 2) return
    const key = points.map(p => p.join(',')).join('|')
    if (key === prev.current) return
    prev.current = key
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [340, 60],   // leave room for chat panel on left
      paddingBottomRight: [60, 60],
      maxZoom: 11,
      animate: true,
    })
  }, [stops, routeGeometry, map])
  return null
}

// ─── AnimatedRoute: Apple Maps two-layer polyline with draw-on animation ─────
// Ported from TREK's casing+core pattern. Animates stroke-dashoffset on mount.

function AnimatedRoute({ positions }: { positions: [number, number][] }) {
  const casingRef = useRef<L.Polyline | null>(null)
  const coreRef = useRef<L.Polyline | null>(null)
  const animatedRef = useRef(false)

  // Animate the stroke-dashoffset of the SVG path after mount
  const animatePath = useCallback((polyline: L.Polyline | null) => {
    if (!polyline) return
    const el = (polyline as unknown as { _path?: SVGPathElement })._path
    if (!el) return
    const len = el.getTotalLength?.() ?? 4000
    el.style.strokeDasharray = String(len)
    el.style.strokeDashoffset = String(len)
    el.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)'
    // Force reflow then animate
    void el.getBoundingClientRect()
    el.style.strokeDashoffset = '0'
  }, [])

  return (
    <>
      {/* Casing layer — darker blue, wider (Apple Maps style, ported from TREK) */}
      <Polyline
        positions={positions}
        pathOptions={{ color: '#0a5cc2', weight: 9, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
        ref={(r) => {
          casingRef.current = r
          if (r && !animatedRef.current) {
            animatedRef.current = true
            setTimeout(() => animatePath(r), 80)
          }
        }}
      />
      {/* Core layer — bright blue, thinner */}
      <Polyline
        positions={positions}
        pathOptions={{ color: '#0a84ff', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
        ref={(r) => { coreRef.current = r }}
      />
    </>
  )
}

// ─── InteractiveSegment: clickable/hoverable route segment ─────────────────
// Each leg between stops gets its own interactive invisible overlay so users
// can click a road segment to see drive time + distance for that leg.

interface SegmentInfo {
  from: string
  to: string
  driveTime?: string
  driveDistance?: string
  midPoint: [number, number]
}

function InteractiveSegment({
  positions,
  info,
  onSegmentClick,
}: {
  positions: [number, number][]
  info: SegmentInfo
  onSegmentClick: (info: SegmentInfo, x: number, y: number) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: hovered ? '#facc15' : 'transparent',
        weight: 16,
        opacity: hovered ? 0.35 : 0,
        lineCap: 'round',
        lineJoin: 'round',
      }}
      eventHandlers={{
        mouseover: () => setHovered(true),
        mouseout: () => setHovered(false),
        click: (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e)
          onSegmentClick(info, e.originalEvent.clientX, e.originalEvent.clientY)
        },
      }}
    />
  )
}

// ─── Hover tooltip (fixed-position div, ported from TREK TooltipOverlay) ────

interface TooltipState {
  x: number
  y: number
  name: string
  sub?: string
  extra?: string
}

// ─── Main LeafletMap component ─────────────────────────────────────────────

interface LeafletMapProps {
  stops: RouteStop[]
  attractions: Attraction[]
  surroundings: Attraction[]
  hotels: Hotel[]
  routeGeometry: RouteGeometry | null
  selectedStop: RouteStop | null
  onStopClick: (stop: RouteStop) => void
  confirmedReservations?: ConfirmedReservation[]
  proactivePOIs?: ProactivePOIs
}

export default function LeafletMap({
  stops, attractions, surroundings, hotels, routeGeometry, selectedStop, onStopClick,
  confirmedReservations = [], proactivePOIs,
}: LeafletMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [segmentCard, setSegmentCard] = useState<{ info: SegmentInfo; x: number; y: number } | null>(null)
  const isTouchDevice = typeof window !== 'undefined' && navigator.maxTouchPoints > 0

  const showTooltip = useCallback((x: number, y: number, name: string, sub?: string, extra?: string) => {
    if (isTouchDevice) return
    setTooltip({ x, y, name, sub, extra })
  }, [isTouchDevice])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  // Build per-segment geometry slices for interactive overlays
  // ORS returns a single flat geometry; we re-slice it per stop pair using nearest-point matching
  const segmentGeometries = useCallback((): { positions: [number, number][]; info: SegmentInfo }[] => {
    if (!routeGeometry || stops.length < 2) return []
    const geo = routeGeometry
    const result: { positions: [number, number][]; info: SegmentInfo }[] = []

    // Find the index of the geometry point nearest to a stop's coordinates
    function nearestIdx(target: [number, number], from: number): number {
      let best = from
      let bestDist = Infinity
      for (let i = from; i < geo.length; i++) {
        const d = Math.hypot(geo[i][0] - target[0], geo[i][1] - target[1])
        if (d < bestDist) { bestDist = d; best = i }
        if (d < 0.002) break // close enough — stop searching
      }
      return best
    }

    let cursor = 0
    for (let i = 0; i < stops.length - 1; i++) {
      const fromPt: [number, number] = [stops[i].coordinates.lat, stops[i].coordinates.lng]
      const toPt: [number, number] = [stops[i + 1].coordinates.lat, stops[i + 1].coordinates.lng]
      const startIdx = nearestIdx(fromPt, cursor)
      const endIdx = nearestIdx(toPt, startIdx + 1)
      const slice = geo.slice(startIdx, endIdx + 1)
      if (slice.length > 1) {
        const mid = slice[Math.floor(slice.length / 2)]
        result.push({
          positions: slice,
          info: {
            from: `${stops[i].city}, ${stops[i].state}`,
            to: `${stops[i + 1].city}, ${stops[i + 1].state}`,
            driveTime: stops[i + 1].driveTimeFromPrevious,
            driveDistance: stops[i + 1].driveDistanceFromPrevious,
            midPoint: mid,
          },
        })
      }
      cursor = endIdx
    }
    return result
  }, [routeGeometry, stops])

  const segments = segmentGeometries()

  return (
    <>
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        {/* CartoDB Voyager tiles — shows streets, place names, POI labels (Google Maps-like) */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
          subdomains="abcd"
        />

        <BoundsUpdater stops={stops} routeGeometry={routeGeometry} />
        <MapControlsPill />

        {/* ── Route geometry ── */}
        {routeGeometry && routeGeometry.length > 1 && (
          <AnimatedRoute positions={routeGeometry} />
        )}

        {/* Interactive segment overlays (clickable invisible wide stripes) */}
        {segments.map((seg, i) => (
          <InteractiveSegment
            key={`seg-${i}`}
            positions={seg.positions}
            info={seg.info}
            onSegmentClick={(info, x, y) => setSegmentCard({ info, x, y })}
          />
        ))}

        {/* Fallback dashed line when no ORS geometry yet */}
        {!routeGeometry && stops.length > 1 && (
          <Polyline
            positions={stops.map(s => [s.coordinates.lat, s.coordinates.lng] as [number, number])}
            pathOptions={{ color: '#93c5fd', weight: 2, opacity: 0.7, dashArray: '8 6' }}
          />
        )}

        {/* ── Stop markers ── */}
        {stops.map((stop, i) => (
          <Marker
            key={stop.city}
            position={[stop.coordinates.lat, stop.coordinates.lng]}
            icon={createStopIcon(i, selectedStop?.city === stop.city, i === 0, i === stops.length - 1)}
            eventHandlers={{
              click: () => { hideTooltip(); onStopClick(stop) },
              mouseover: (e: L.LeafletMouseEvent) =>
                showTooltip(
                  e.originalEvent.clientX,
                  e.originalEvent.clientY,
                  `${stop.city}, ${stop.state}`,
                  stop.stayNights > 0 ? `${stop.stayNights} night${stop.stayNights !== 1 ? 's' : ''} · ${stop.checkIn}` : i === 0 ? 'Starting point' : undefined,
                  stop.driveTimeFromPrevious ? `🚗 ${stop.driveTimeFromPrevious} · ${stop.driveDistanceFromPrevious}` : undefined,
                ),
              mousemove: (e: L.LeafletMouseEvent) =>
                showTooltip(
                  e.originalEvent.clientX,
                  e.originalEvent.clientY,
                  `${stop.city}, ${stop.state}`,
                  stop.stayNights > 0 ? `${stop.stayNights} night${stop.stayNights !== 1 ? 's' : ''} · ${stop.checkIn}` : i === 0 ? 'Starting point' : undefined,
                  stop.driveTimeFromPrevious ? `🚗 ${stop.driveTimeFromPrevious} · ${stop.driveDistanceFromPrevious}` : undefined,
                ),
              mouseout: hideTooltip,
            }}
            zIndexOffset={selectedStop?.city === stop.city ? 1000 : 0}
          />
        ))}

        {/* ── Hotel markers with clustering (ported from TREK MarkerClusterGroup) ── */}
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={40}
          disableClusteringAtZoom={13}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          animate={false}
          iconCreateFunction={clusterIconCreate}
        >
          {hotels.filter(h => h.coordinates.lat !== 0).map(h => (
            <Marker
              key={h.hotelId}
              position={[h.coordinates.lat, h.coordinates.lng]}
              icon={createHotelIcon()}
              eventHandlers={{
                mouseover: (e: L.LeafletMouseEvent) =>
                  showTooltip(
                    e.originalEvent.clientX,
                    e.originalEvent.clientY,
                    h.name,
                    h.rating ? '★'.repeat(Math.round(h.rating)) : undefined,
                    h.pricePerNight ? `$${h.pricePerNight.toFixed(0)}/night${h.dealTag ? ' · ' + h.dealTag : ''}` : undefined,
                  ),
                mousemove: (e: L.LeafletMouseEvent) =>
                  showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, h.name),
                mouseout: hideTooltip,
              }}
            />
          ))}
        </MarkerClusterGroup>

        {/* ── Confirmed reservation markers — shown above hotels, ported from TREK confirmed status ── */}
        {confirmedReservations.map(res => (
          <Marker
            key={`res-${res.id}`}
            position={[res.stopCoordinates.lat, res.stopCoordinates.lng]}
            icon={createConfirmedHotelIcon(res.status)}
            zIndexOffset={2000}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) =>
                showTooltip(
                  e.originalEvent.clientX,
                  e.originalEvent.clientY,
                  res.hotelName,
                  `${res.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'} · ${res.nights} nights`,
                  `Check-in: ${res.checkIn}  ·  $${res.totalPrice.toFixed(0)} total`,
                ),
              mousemove: (e: L.LeafletMouseEvent) =>
                showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, res.hotelName, res.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'),
              mouseout: hideTooltip,
            }}
          />
        ))}

        {/* ── Attraction markers (amber circles) ── */}
        {attractions.map(a => (
          <CircleMarker
            key={a.id}
            center={[a.coordinates.lat, a.coordinates.lng]}
            radius={7}
            pathOptions={{ color: '#d97706', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 }}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) =>
                showTooltip(
                  e.originalEvent.clientX,
                  e.originalEvent.clientY,
                  a.name,
                  a.category,
                  a.rating ? `★ ${a.rating.toFixed(1)}` : undefined,
                ),
              mousemove: (e: L.LeafletMouseEvent) =>
                showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, a.name, a.category),
              mouseout: hideTooltip,
            }}
          />
        ))}

        {/* ── Surroundings markers (teal) ── */}
        {surroundings.map(s => (
          <CircleMarker
            key={`surr-${s.id}`}
            center={[s.coordinates.lat, s.coordinates.lng]}
            radius={7}
            pathOptions={{ color: '#0d9488', fillColor: '#2dd4bf', fillOpacity: 0.9, weight: 2 }}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) =>
                showTooltip(
                  e.originalEvent.clientX,
                  e.originalEvent.clientY,
                  s.name,
                  s.category,
                  s.rating ? `★ ${s.rating.toFixed(1)}` : undefined,
                ),
              mousemove: (e: L.LeafletMouseEvent) =>
                showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, s.name, s.category),
              mouseout: hideTooltip,
            }}
          />
        ))}

        {/* ── Proactive POIs from Overpass (gas stations, restaurants, attractions) ── */}
        {proactivePOIs?.gasStations.map(p => (
          <CircleMarker
            key={p.id}
            center={[p.coordinates.lat, p.coordinates.lng]}
            radius={5}
            pathOptions={{ color: '#6b7280', fillColor: '#d1d5db', fillOpacity: 0.85, weight: 1.5 }}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, 'Gas Station'),
              mousemove: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, 'Gas Station'),
              mouseout: hideTooltip,
            }}
          />
        ))}
        {proactivePOIs?.restaurants.map(p => (
          <CircleMarker
            key={p.id}
            center={[p.coordinates.lat, p.coordinates.lng]}
            radius={5}
            pathOptions={{ color: '#ea580c', fillColor: '#fed7aa', fillOpacity: 0.85, weight: 1.5 }}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, p.category),
              mousemove: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, p.category),
              mouseout: hideTooltip,
            }}
          />
        ))}
        {proactivePOIs?.attractions.map(p => (
          <CircleMarker
            key={p.id}
            center={[p.coordinates.lat, p.coordinates.lng]}
            radius={5}
            pathOptions={{ color: '#7c3aed', fillColor: '#ddd6fe', fillOpacity: 0.85, weight: 1.5 }}
            eventHandlers={{
              mouseover: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, p.category),
              mousemove: (e: L.LeafletMouseEvent) => showTooltip(e.originalEvent.clientX, e.originalEvent.clientY, p.name, p.category),
              mouseout: hideTooltip,
            }}
          />
        ))}
      </MapContainer>

      {/* ── Hover tooltip overlay (fixed-position div, ported from TREK TooltipOverlay) ── */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'white',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            padding: '7px 11px',
            maxWidth: 220,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tooltip.name}
          </div>
          {tooltip.sub && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{tooltip.sub}</div>
          )}
          {tooltip.extra && (
            <div style={{ fontSize: 11, color: '#2563eb', marginTop: 1, fontWeight: 600 }}>{tooltip.extra}</div>
          )}
        </div>
      )}

      {/* ── Segment info card (appears on route click) ── */}
      {segmentCard && (
        <div
          onClick={() => setSegmentCard(null)}
          style={{
            position: 'fixed',
            left: Math.min(segmentCard.x + 12, window.innerWidth - 220),
            top: Math.max(segmentCard.y - 80, 10),
            zIndex: 9999,
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            padding: '10px 14px',
            minWidth: 190,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Route segment</div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#111827', lineHeight: 1.4 }}>
            {segmentCard.info.from}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', margin: '2px 0' }}>↓</div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#111827', lineHeight: 1.4 }}>
            {segmentCard.info.to}
          </div>
          {(segmentCard.info.driveTime || segmentCard.info.driveDistance) && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              {segmentCard.info.driveTime && (
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Drive time</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{segmentCard.info.driveTime}</div>
                </div>
              )}
              {segmentCard.info.driveDistance && (
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Distance</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{segmentCard.info.driveDistance}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 6, textAlign: 'right' }}>click to dismiss</div>
        </div>
      )}
    </>
  )
}
