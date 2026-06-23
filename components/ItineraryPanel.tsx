'use client'

import type { ConfirmedReservation, RouteStop } from '@/types'

interface ItineraryPanelProps {
  reservations: ConfirmedReservation[]
  stops: RouteStop[]
  open: boolean
  onClose: () => void
  onCancel: (id: string) => void
  onStatusChange: (id: string, status: 'pending' | 'confirmed') => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

// Status badge — ported from TREK's ReservationCard status indicator
function StatusBadge({ status }: { status: 'pending' | 'confirmed' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
      background: status === 'confirmed' ? '#dcfce7' : '#fef9c3',
      color: status === 'confirmed' ? '#15803d' : '#a16207',
      border: `1px solid ${status === 'confirmed' ? '#86efac' : '#fde047'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: status === 'confirmed' ? '#16a34a' : '#ca8a04',
        display: 'inline-block',
      }} />
      {status === 'confirmed' ? 'Confirmed' : 'Pending'}
    </span>
  )
}

// Individual reservation card — adapted from TREK's ReservationCard
function ReservationCard({
  res,
  onCancel,
  onStatusChange,
}: {
  res: ConfirmedReservation
  onCancel: (id: string) => void
  onStatusChange: (id: string, status: 'pending' | 'confirmed') => void
}) {
  const totalStr = formatCurrency(res.totalPrice, res.currency)
  const perNightStr = formatCurrency(res.pricePerNight, res.currency)

  return (
    <div style={{
      background: 'white',
      borderRadius: 14,
      border: `1.5px solid ${res.status === 'confirmed' ? '#86efac' : '#e5e7eb'}`,
      boxShadow: res.status === 'confirmed'
        ? '0 2px 10px rgba(22,163,74,0.1)'
        : '0 1px 4px rgba(0,0,0,0.06)',
      padding: '12px 14px',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {/* Hotel type badge */}
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
            color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 4,
            display: 'inline-block', marginBottom: 4,
          }}>Hotel</span>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {res.hotelName}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
            {res.stopCity}, {res.stopState}
          </div>
        </div>
        <StatusBadge status={res.status} />
      </div>

      {/* Dates & room */}
      <div style={{
        marginTop: 10, padding: '8px 10px', borderRadius: 8,
        background: '#f9fafb', border: '1px solid #f3f4f6',
      }}>
        {/* Check-in → Check-out route (ported from TREK's endpoint route display) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#374151' }}>
          <span>📅</span>
          <span>{formatDate(res.checkIn)}</span>
          <span style={{ color: '#9ca3af' }}>→</span>
          <span>{formatDate(res.checkOut)}</span>
          <span style={{ color: '#6b7280', fontWeight: 400 }}>· {res.nights} night{res.nights !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
          🛏 {res.roomType}
          {res.breakfastIncluded && <span style={{ marginLeft: 8, color: '#d97706' }}>☕ Breakfast included</span>}
        </div>
      </div>

      {/* Cancellation policy (ported from TREK's notes display) */}
      <div style={{ marginTop: 8, fontSize: 10, color: '#9ca3af', lineHeight: 1.4 }}>
        📋 {res.cancellationPolicy}
      </div>

      {/* Pricing */}
      <div style={{
        marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        paddingTop: 8, borderTop: '1px solid #f3f4f6',
      }}>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{perNightStr}/night</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>{totalStr}</div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        {/* Toggle status — ported from TREK's status toggle */}
        <button
          onClick={() => onStatusChange(res.id, res.status === 'confirmed' ? 'pending' : 'confirmed')}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid #e5e7eb',
            background: 'white', fontSize: 11, fontWeight: 600,
            color: res.status === 'confirmed' ? '#ca8a04' : '#15803d',
            cursor: 'pointer',
          }}
        >
          {res.status === 'confirmed' ? '↩ Mark Pending' : '✓ Mark Confirmed'}
        </button>
        <a
          href={res.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, padding: '6px 0', borderRadius: 8,
            background: '#059669', color: 'white',
            fontSize: 11, fontWeight: 700, textAlign: 'center',
            textDecoration: 'none', display: 'block',
          }}
        >
          Open Booking →
        </a>
        <button
          onClick={() => onCancel(res.id)}
          style={{
            width: 30, height: 30, borderRadius: 8, border: '1.5px solid #fee2e2',
            background: 'white', color: '#ef4444', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Remove reservation"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default function ItineraryPanel({
  reservations, stops, open, onClose, onCancel, onStatusChange,
}: ItineraryPanelProps) {
  const confirmed = reservations.filter(r => r.status === 'confirmed')
  const pending = reservations.filter(r => r.status === 'pending')
  const totalCost = confirmed.reduce((s, r) => s + r.totalPrice, 0)

  // Group by stop order (ported from TREK's day-grouped reservation list)
  const byStop = stops.map(stop => ({
    stop,
    reservations: reservations.filter(r => r.stopCity === stop.city),
  })).filter(g => g.reservations.length > 0)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Panel — slides in from the right */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 340, zIndex: 1200,
        background: '#f9fafb',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          background: 'white',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: '#111827', margin: 0 }}>
              🗒 Itinerary
            </h2>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
              {reservations.length} booking{reservations.length !== 1 ? 's' : ''}
              {confirmed.length > 0 && ` · ${confirmed.length} confirmed`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: 'none', background: '#f3f4f6', cursor: 'pointer',
              fontSize: 16, color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Total cost summary */}
        {totalCost > 0 && (
          <div style={{
            margin: '12px 12px 0',
            padding: '10px 14px', borderRadius: 12,
            background: 'linear-gradient(135deg, #059669, #0d9488)',
            color: 'white',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, letterSpacing: 0.5 }}>
                CONFIRMED TOTAL
              </div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>
                {formatCurrency(totalCost)}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.85 }}>
              <div>{confirmed.length} hotel{confirmed.length !== 1 ? 's' : ''}</div>
              <div>{confirmed.reduce((n, r) => n + r.nights, 0)} nights</div>
            </div>
          </div>
        )}

        {/* Scrollable reservation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {reservations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#6b7280' }}>
                No bookings yet
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                Select a hotel from a stop's details and confirm a booking to see it here.
              </div>
            </div>
          ) : (
            byStop.map(({ stop, reservations: stopRes }) => (
              <div key={stop.city} style={{ marginBottom: 16 }}>
                {/* Stop header — ported from TREK's day section divider */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  padding: '4px 0',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#0a84ff', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, flexShrink: 0,
                  }}>
                    {stops.findIndex(s => s.city === stop.city)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>
                      {stop.city}, {stop.state}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>
                      {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''} · {formatDate(stop.checkIn)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                  {stopRes.map(res => (
                    <ReservationCard
                      key={res.id}
                      res={res}
                      onCancel={onCancel}
                      onStatusChange={onStatusChange}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
