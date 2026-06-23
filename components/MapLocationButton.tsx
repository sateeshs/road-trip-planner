'use client'

import { useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

type LocateState = 'off' | 'loading' | 'active' | 'error'

// Adapted from TREK's LocationButton.tsx — three-state geolocation FAB.
// Uses browser geolocation + Leaflet's useMap() to fly to user's position.
export default function MapLocationButton() {
  const map = useMap()
  const [state, setState] = useState<LocateState>('off')

  function handleClick() {
    if (state === 'loading') return

    if (state === 'active') {
      setState('off')
      return
    }

    setState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setState('active')
        map.flyTo([lat, lng], 12, { duration: 1.2 })

        // Place a blue dot at user's location
        const dot = L.circleMarker([lat, lng], {
          radius: 10,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.9,
          weight: 3,
        })
        dot.bindPopup('<div class="text-sm font-semibold text-gray-900">📍 You are here</div>')
        dot.addTo(map)
      },
      () => {
        setState('error')
        setTimeout(() => setState('off'), 3000)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const title =
    state === 'error' ? 'Location denied — check browser permissions' :
    state === 'loading' ? 'Getting location…' :
    state === 'active' ? 'Showing your location' :
    'Show my location'

  const bg = state === 'active' ? '#3b82f6' : state === 'error' ? '#ef4444' : 'white'
  const color = state === 'active' || state === 'error' ? 'white' : '#6b7280'

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      style={{
        width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: bg, color, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s, color 0.2s',
        fontSize: 16,
      }}
    >
      {state === 'loading' ? (
        <span style={{ fontSize: 14 }}>⏳</span>
      ) : state === 'active' ? (
        <span>◎</span>
      ) : state === 'error' ? (
        <span style={{ fontSize: 13 }}>✕</span>
      ) : (
        <span>⊕</span>
      )}
    </button>
  )
}
