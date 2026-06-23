'use client'

// Custom zoom + location controls pill — inspired by TREK's MapCompassPill.tsx glass style.
// Replaces the disabled Leaflet default zoom controls with a floating frosted-glass pill.
import { useMap } from 'react-leaflet'
import MapLocationButton from './MapLocationButton'

export default function MapControlsPill() {
  const map = useMap()

  const btnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'white', color: '#374151',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, lineHeight: 1,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    transition: 'background 0.15s',
    flexShrink: 0,
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 100,
      right: 12,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      alignItems: 'center',
    }}>
      {/* Zoom pill (glass capsule — TREK MapCompassPill style) */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
      }}>
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          style={btnStyle}
          onClick={() => map.zoomIn()}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
        >
          +
        </button>
        <div style={{ width: 22, height: 1, background: '#e5e7eb', margin: '0 4px' }} />
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          style={btnStyle}
          onClick={() => map.zoomOut()}
          onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
        >
          −
        </button>
      </div>

      {/* Location FAB — adapted from TREK LocationButton.tsx */}
      <MapLocationButton />
    </div>
  )
}
