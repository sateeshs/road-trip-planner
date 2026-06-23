'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import type { RouteStop, Attraction, Hotel, RouteGeometry, ConfirmedReservation } from '@/types'
import type { ProactivePOIs } from '@/hooks/useProactivePlaces'

// ─── Stable library ref — must be outside component to avoid reload on render ──
const LIBRARIES: ('marker' | 'places')[] = ['marker', 'places']

const MAP_OPTIONS: google.maps.MapOptions = {
  zoomControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',
}

// ─── Stop marker DOM element factory ──────────────────────────────────────────

function createStopMarkerElement(
  index: number,
  isSelected: boolean,
  isOrigin: boolean,
  isDestination: boolean,
): HTMLElement {
  const baseColor = isOrigin ? '#16a34a' : isDestination ? '#dc2626' : '#0a84ff'
  const color = isSelected ? '#111827' : baseColor
  const size = isSelected ? 48 : isOrigin || isDestination ? 42 : 38
  const label = isOrigin ? '🚗' : isDestination ? '🏁' : String(index)
  const fontSize = isOrigin || isDestination ? 18 : 14
  const pillText = isOrigin ? 'START' : isDestination ? 'END' : ''
  const pillColor = isOrigin ? '#16a34a' : '#dc2626'

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:relative;width:${size}px;height:${size + (pillText ? 20 : 0)}px;`

  if (isSelected) {
    const pulse = document.createElement('div')
    pulse.style.cssText = `
      position:absolute;inset:-8px;border-radius:50%;
      border:2.5px solid #111827;opacity:0.3;
      animation:rtp-ping 1.4s cubic-bezier(0,0,0.2,1) infinite;
    `
    if (!document.getElementById('rtp-ping-style')) {
      const style = document.createElement('style')
      style.id = 'rtp-ping-style'
      style.textContent = '@keyframes rtp-ping{75%,100%{transform:scale(1.7);opacity:0}}'
      document.head.appendChild(style)
    }
    wrapper.appendChild(pulse)
  }

  const circle = document.createElement('div')
  circle.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:${color};color:white;
    display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:${fontSize}px;
    border:2.5px solid white;
    box-shadow:${isSelected ? '0 0 0 3px rgba(17,24,39,0.22), 0 4px 14px rgba(0,0,0,0.35)' : '0 3px 12px rgba(0,0,0,0.32)'};
    cursor:pointer;position:relative;z-index:1;will-change:transform;
  `
  circle.textContent = label
  wrapper.appendChild(circle)

  if (pillText) {
    const pill = document.createElement('div')
    pill.style.cssText = `
      position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
      background:${pillColor};color:white;
      font-size:8px;font-weight:800;letter-spacing:0.5px;
      padding:1px 5px;border-radius:99px;
      white-space:nowrap;pointer-events:none;
      border:1.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2);
    `
    pill.textContent = pillText
    wrapper.appendChild(pill)
  }

  return wrapper
}

function makeClusterRenderer(color: string, label: string) {
  return {
    render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
      const size = count < 10 ? 34 : count < 50 ? 40 : 46
      const el = document.createElement('div')
      el.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};color:white;
        border:2.5px solid rgba(255,255,255,0.9);
        box-shadow:0 2px 10px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;cursor:pointer;
      `
      el.textContent = `${count}${label}`
      return new google.maps.marker.AdvancedMarkerElement({ position, content: el })
    },
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface TooltipState {
  x: number
  y: number
  name: string
  sub?: string
  extra?: string
}

interface SegmentCard {
  x: number
  y: number
  from: string
  to: string
  driveTime?: string
  driveDistance?: string
}

interface GoogleMapViewProps {
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

// ─── Main component ──────────────────────────────────────────────────────────

export default function GoogleMapView({
  stops,
  attractions,
  surroundings,
  hotels,
  routeGeometry,
  selectedStop,
  onStopClick,
  confirmedReservations = [],
  proactivePOIs,
}: GoogleMapViewProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
    mapIds: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ? [process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID] : [],
  })

  const mapRef = useRef<google.maps.Map | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)

  // Clusterers — one per marker type
  const hotelClustererRef = useRef<MarkerClusterer | null>(null)
  const attractionClustererRef = useRef<MarkerClusterer | null>(null)
  const surroundingClustererRef = useRef<MarkerClusterer | null>(null)
  const gasClustererRef = useRef<MarkerClusterer | null>(null)
  const restaurantClustererRef = useRef<MarkerClusterer | null>(null)

  // Tracked marker arrays for cleanup
  const stopMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const hotelMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const attractionMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const surroundingMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const confirmedMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const gasMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const restaurantMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])

  // Route polylines
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const segmentPolylinesRef = useRef<google.maps.Polyline[]>([])

  // UI state
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [segmentCard, setSegmentCard] = useState<SegmentCard | null>(null)
  const isTouchDevice = typeof window !== 'undefined' && navigator.maxTouchPoints > 0

  // ─── Map load callback ─────────────────────────────────────────────────────

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    infoWindowRef.current = new google.maps.InfoWindow()

    // Initialize clusterers
    hotelClustererRef.current = new MarkerClusterer({
      map,
      renderer: makeClusterRenderer('#059669', ''),
    })
    attractionClustererRef.current = new MarkerClusterer({
      map,
      renderer: makeClusterRenderer('#d97706', ''),
    })
    surroundingClustererRef.current = new MarkerClusterer({
      map,
      renderer: makeClusterRenderer('#0d9488', ''),
    })
    gasClustererRef.current = new MarkerClusterer({
      map,
      renderer: makeClusterRenderer('#6b7280', ''),
    })
    restaurantClustererRef.current = new MarkerClusterer({
      map,
      renderer: makeClusterRenderer('#ea580c', ''),
    })
  }, [])

  // ─── Helper: show tooltip ──────────────────────────────────────────────────

  const showTooltip = useCallback((x: number, y: number, name: string, sub?: string, extra?: string) => {
    if (isTouchDevice) return
    setTooltip({ x, y, name, sub, extra })
  }, [isTouchDevice])

  // ─── Helper: segment geometries (pure JS, no map library dependency) ───────

  const getSegmentGeometries = useCallback(() => {
    if (!routeGeometry || stops.length < 2) return []
    const geo = routeGeometry
    const result: {
      positions: [number, number][]
      from: string
      to: string
      driveTime?: string
      driveDistance?: string
    }[] = []

    function nearestIdx(target: [number, number], from: number): number {
      let best = from
      let bestDist = Infinity
      for (let i = from; i < geo.length; i++) {
        const d = Math.hypot(geo[i][0] - target[0], geo[i][1] - target[1])
        if (d < bestDist) { bestDist = d; best = i }
        if (d < 0.002) break
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
        result.push({
          positions: slice,
          from: `${stops[i].city}, ${stops[i].state}`,
          to: `${stops[i + 1].city}, ${stops[i + 1].state}`,
          driveTime: stops[i + 1].driveTimeFromPrevious,
          driveDistance: stops[i + 1].driveDistanceFromPrevious,
        })
      }
      cursor = endIdx
    }
    return result
  }, [routeGeometry, stops])

  // ─── Effect: draw route polylines ──────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return

    // Clear old polylines
    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []
    segmentPolylinesRef.current.forEach(p => p.setMap(null))
    segmentPolylinesRef.current = []

    if (routeGeometry && routeGeometry.length > 1) {
      const path = routeGeometry.map(([lat, lng]) => ({ lat, lng }))

      // Two-layer Apple Maps style polyline
      const casing = new google.maps.Polyline({
        path,
        map,
        strokeColor: '#0a5cc2',
        strokeWeight: 9,
        strokeOpacity: 0,
        zIndex: 1,
      })
      const core = new google.maps.Polyline({
        path,
        map,
        strokeColor: '#0a84ff',
        strokeWeight: 5,
        strokeOpacity: 0,
        zIndex: 2,
      })
      polylinesRef.current = [casing, core]

      // Animate opacity 0 → 1
      let start: number | null = null
      function animate(ts: number) {
        if (!start) start = ts
        const t = Math.min((ts - start) / 400, 1)
        casing.setOptions({ strokeOpacity: t })
        core.setOptions({ strokeOpacity: t })
        if (t < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)

      // Interactive segment overlays
      const segs = getSegmentGeometries()
      segs.forEach(seg => {
        const overlay = new google.maps.Polyline({
          path: seg.positions.map(([lat, lng]) => ({ lat, lng })),
          map,
          strokeColor: 'transparent',
          strokeWeight: 16,
          strokeOpacity: 0,
          zIndex: 3,
        })

        overlay.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.domEvent) return
          const ev = e.domEvent as MouseEvent
          setSegmentCard({
            x: ev.clientX,
            y: ev.clientY,
            from: seg.from,
            to: seg.to,
            driveTime: seg.driveTime,
            driveDistance: seg.driveDistance,
          })
        })
        overlay.addListener('mouseover', (e: google.maps.MapMouseEvent) => {
          overlay.setOptions({ strokeColor: '#facc15', strokeOpacity: 0.35 })
          if (e.domEvent) {
            const ev = e.domEvent as MouseEvent
            showTooltip(ev.clientX, ev.clientY, `${seg.from} → ${seg.to}`)
          }
        })
        overlay.addListener('mouseout', () => {
          overlay.setOptions({ strokeColor: 'transparent', strokeOpacity: 0 })
          setTooltip(null)
        })

        segmentPolylinesRef.current.push(overlay)
      })
    } else if (stops.length >= 2) {
      // Dashed fallback line while waiting for OSRM geometry
      const path = stops.map(s => ({ lat: s.coordinates.lat, lng: s.coordinates.lng }))
      const dashed = new google.maps.Polyline({
        path,
        map,
        strokeColor: '#93c5fd',
        strokeWeight: 2,
        strokeOpacity: 0.7,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 },
          offset: '0',
          repeat: '20px',
        }],
        zIndex: 1,
      })
      polylinesRef.current = [dashed]
    }
  }, [routeGeometry, stops, isLoaded, getSegmentGeometries, showTooltip])

  // ─── Effect: fit bounds ────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return

    const points = routeGeometry
      ? routeGeometry
      : stops.map(s => [s.coordinates.lat, s.coordinates.lng] as [number, number])
    if (points.length < 2) return

    const bounds = new google.maps.LatLngBounds()
    points.forEach(([lat, lng]) => bounds.extend({ lat, lng }))
    map.fitBounds(bounds, { top: 60, bottom: 60, left: 340, right: 60 })
  }, [stops, routeGeometry, isLoaded])

  // ─── Effect: stop markers ──────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return

    stopMarkersRef.current.forEach(m => { m.map = null })
    stopMarkersRef.current = []

    stops.forEach((stop, i) => {
      const isOrigin = i === 0
      const isDestination = i === stops.length - 1
      const isSelected = selectedStop?.city === stop.city

      const el = createStopMarkerElement(i, isSelected, isOrigin, isDestination)

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: stop.coordinates.lat, lng: stop.coordinates.lng },
        map,
        content: el,
        zIndex: isSelected ? 1000 : 100,
        title: `${stop.city}, ${stop.state}`,
      })

      marker.addListener('click', () => {
        setTooltip(null)
        onStopClick(stop)
      })

      if (!isTouchDevice) {
        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          showTooltip(
            me.clientX, me.clientY,
            `${stop.city}, ${stop.state}`,
            stop.stayNights > 0
              ? `${stop.stayNights} night${stop.stayNights !== 1 ? 's' : ''} · ${stop.checkIn}`
              : isOrigin ? 'Starting point' : undefined,
            stop.driveTimeFromPrevious
              ? `🚗 ${stop.driveTimeFromPrevious} · ${stop.driveDistanceFromPrevious}`
              : undefined,
          )
        })
        el.addEventListener('mouseleave', () => setTooltip(null))
      }

      stopMarkersRef.current.push(marker)
    })
  }, [stops, selectedStop, isLoaded, isTouchDevice, onStopClick, showTooltip])

  // ─── Effect: hotel markers ─────────────────────────────────────────────────

  useEffect(() => {
    const clusterer = hotelClustererRef.current
    if (!clusterer || !isLoaded) return

    hotelMarkersRef.current.forEach(m => { m.map = null })
    clusterer.clearMarkers()
    hotelMarkersRef.current = []

    const markers = hotels
      .filter(h => h.coordinates.lat !== 0)
      .map(h => {
        const el = document.createElement('div')
        el.style.cssText = `
          width:24px;height:24px;border-radius:5px;
          background:#059669;color:white;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:800;
          border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.28);cursor:pointer;
        `
        el.textContent = 'H'

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: h.coordinates.lat, lng: h.coordinates.lng },
          content: el,
          title: h.name,
        })

        if (!isTouchDevice) {
          el.addEventListener('mouseenter', (e: Event) => {
            const me = e as MouseEvent
            showTooltip(
              me.clientX, me.clientY,
              h.name,
              h.rating ? '★'.repeat(Math.round(h.rating)) : undefined,
              h.pricePerNight ? `$${h.pricePerNight.toFixed(0)}/night${h.dealTag ? ' · ' + h.dealTag : ''}` : undefined,
            )
          })
          el.addEventListener('mouseleave', () => setTooltip(null))
        }

        return marker
      })

    clusterer.addMarkers(markers)
    hotelMarkersRef.current = markers
  }, [hotels, isLoaded, isTouchDevice, showTooltip])

  // ─── Effect: attraction markers ────────────────────────────────────────────

  useEffect(() => {
    const clusterer = attractionClustererRef.current
    if (!clusterer || !isLoaded) return

    attractionMarkersRef.current.forEach(m => { m.map = null })
    clusterer.clearMarkers()
    attractionMarkersRef.current = []

    const markers = attractions.map(a => {
      const el = document.createElement('div')
      el.style.cssText = `
        width:14px;height:14px;border-radius:50%;
        background:#fbbf24;border:2px solid #d97706;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer;
      `

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: a.coordinates.lat, lng: a.coordinates.lng },
        content: el,
        title: a.name,
      })

      if (!isTouchDevice) {
        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          showTooltip(me.clientX, me.clientY, a.name, a.category, a.rating ? `★ ${a.rating.toFixed(1)}` : undefined)
        })
        el.addEventListener('mouseleave', () => setTooltip(null))
      }

      return marker
    })

    clusterer.addMarkers(markers)
    attractionMarkersRef.current = markers
  }, [attractions, isLoaded, isTouchDevice, showTooltip])

  // ─── Effect: surroundings markers ─────────────────────────────────────────

  useEffect(() => {
    const clusterer = surroundingClustererRef.current
    if (!clusterer || !isLoaded) return

    surroundingMarkersRef.current.forEach(m => { m.map = null })
    clusterer.clearMarkers()
    surroundingMarkersRef.current = []

    const markers = surroundings.map(s => {
      const el = document.createElement('div')
      el.style.cssText = `
        width:14px;height:14px;border-radius:50%;
        background:#2dd4bf;border:2px solid #0d9488;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer;
      `

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: s.coordinates.lat, lng: s.coordinates.lng },
        content: el,
        title: s.name,
      })

      if (!isTouchDevice) {
        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          showTooltip(me.clientX, me.clientY, s.name, s.category, s.rating ? `★ ${s.rating.toFixed(1)}` : undefined)
        })
        el.addEventListener('mouseleave', () => setTooltip(null))
      }

      return marker
    })

    clusterer.addMarkers(markers)
    surroundingMarkersRef.current = markers
  }, [surroundings, isLoaded, isTouchDevice, showTooltip])

  // ─── Effect: confirmed reservation markers ─────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return

    confirmedMarkersRef.current.forEach(m => { m.map = null })
    confirmedMarkersRef.current = []

    confirmedReservations.forEach(res => {
      const bg = res.status === 'confirmed' ? '#16a34a' : '#ca8a04'
      const border = res.status === 'confirmed' ? '#86efac' : '#fde047'
      const label = res.status === 'confirmed' ? '✓' : '…'

      const el = document.createElement('div')
      el.style.cssText = `
        width:28px;height:28px;border-radius:6px;
        background:${bg};color:white;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:800;
        border:2.5px solid ${border};
        box-shadow:0 2px 10px rgba(0,0,0,0.3);cursor:pointer;
        position:relative;
      `
      el.textContent = label

      const badge = document.createElement('div')
      badge.style.cssText = `
        position:absolute;top:-4px;right:-4px;
        width:10px;height:10px;border-radius:50%;
        background:${bg};border:1.5px solid white;
        font-size:7px;display:flex;align-items:center;justify-content:center;
      `
      badge.textContent = '🏨'
      el.appendChild(badge)

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: res.stopCoordinates.lat, lng: res.stopCoordinates.lng },
        map,
        content: el,
        zIndex: 2000,
        title: res.hotelName,
      })

      if (!isTouchDevice) {
        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          showTooltip(
            me.clientX, me.clientY,
            res.hotelName,
            `${res.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending'} · ${res.nights} nights`,
            `Check-in: ${res.checkIn}  ·  $${res.totalPrice.toFixed(0)} total`,
          )
        })
        el.addEventListener('mouseleave', () => setTooltip(null))
      }

      confirmedMarkersRef.current.push(marker)
    })
  }, [confirmedReservations, isLoaded, isTouchDevice, showTooltip])

  // ─── Effect: proactive POI markers ────────────────────────────────────────

  useEffect(() => {
    const gasClusterer = gasClustererRef.current
    const restClusterer = restaurantClustererRef.current
    if (!gasClusterer || !restClusterer || !isLoaded) return

    gasMarkersRef.current.forEach(m => { m.map = null })
    gasClusterer.clearMarkers()
    gasMarkersRef.current = []

    restaurantMarkersRef.current.forEach(m => { m.map = null })
    restClusterer.clearMarkers()
    restaurantMarkersRef.current = []

    if (!proactivePOIs) return

    const makeProactiveMarker = (
      place: { name: string; category: string; rating?: number; coordinates: { lat: number; lng: number } },
      bg: string,
      border: string,
      emoji: string,
    ) => {
      const el = document.createElement('div')
      el.style.cssText = `
        width:18px;height:18px;border-radius:50%;
        background:${bg};border:2px solid ${border};
        display:flex;align-items:center;justify-content:center;
        font-size:9px;cursor:pointer;
        box-shadow:0 1px 4px rgba(0,0,0,0.2);
      `
      el.textContent = emoji

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: place.coordinates.lat, lng: place.coordinates.lng },
        content: el,
        title: place.name,
      })

      if (!isTouchDevice) {
        el.addEventListener('mouseenter', (e: Event) => {
          const me = e as MouseEvent
          showTooltip(me.clientX, me.clientY, place.name, place.category, place.rating ? `★ ${place.rating.toFixed(1)}` : undefined)
        })
        el.addEventListener('mouseleave', () => setTooltip(null))
      }

      return marker
    }

    const gasMarkers = proactivePOIs.gasStations.map(p =>
      makeProactiveMarker(p, '#e5e7eb', '#9ca3af', '⛽')
    )
    gasClusterer.addMarkers(gasMarkers)
    gasMarkersRef.current = gasMarkers

    const restMarkers = proactivePOIs.restaurants.map(p =>
      makeProactiveMarker(p, '#fed7aa', '#ea580c', '🍽')
    )
    restClusterer.addMarkers(restMarkers)
    restaurantMarkersRef.current = restMarkers
  }, [proactivePOIs, isLoaded, isTouchDevice, showTooltip])

  // ─── Zoom controls ────────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    const map = mapRef.current
    if (map) map.setZoom((map.getZoom() ?? 8) + 1)
  }, [])
  const zoomOut = useCallback(() => {
    const map = mapRef.current
    if (map) map.setZoom((map.getZoom() ?? 8) - 1)
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Loading map...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={{ lat: 39.5, lng: -98.35 }}
        zoom={4}
        options={{
          ...MAP_OPTIONS,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
        }}
        onLoad={onMapLoad}
      />

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 110,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 10,
        }}
      >
        {[{ label: '+', fn: zoomIn }, { label: '−', fn: zoomOut }].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontSize: 20,
              fontWeight: 700,
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Hover tooltip */}
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

      {/* Segment info card */}
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
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#111827', lineHeight: 1.4 }}>{segmentCard.from}</div>
          <div style={{ fontSize: 11, color: '#6b7280', margin: '2px 0' }}>↓</div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#111827', lineHeight: 1.4 }}>{segmentCard.to}</div>
          {(segmentCard.driveTime || segmentCard.driveDistance) && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              {segmentCard.driveTime && (
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Drive time</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{segmentCard.driveTime}</div>
                </div>
              )}
              {segmentCard.driveDistance && (
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Distance</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{segmentCard.driveDistance}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 6, textAlign: 'right' }}>click to dismiss</div>
        </div>
      )}
    </div>
  )
}
