import { describe, it, expect } from 'vitest'

// Pure function for building calendar events — extracted for testability
function buildCalendarEvents(
  stops: Array<{ city: string; state: string; checkIn: string; checkOut: string }>,
  reservations: Array<{ hotelName: string; stopCity: string; checkIn: string; checkOut: string; totalPrice: number; currency: string }>,
): Array<{ summary: string; start: string; end: string; description: string }> {
  const events: Array<{ summary: string; start: string; end: string; description: string }> = []

  for (const stop of stops) {
    const reservation = reservations.find(r => r.stopCity === stop.city)
    if (reservation) {
      events.push({
        summary: `🏨 ${reservation.hotelName} — ${stop.city}`,
        start: reservation.checkIn,
        end: reservation.checkOut,
        description: `${reservation.hotelName} in ${stop.city}, ${stop.state}\nTotal: ${reservation.currency} ${reservation.totalPrice}`,
      })
    } else {
      events.push({
        summary: `📍 ${stop.city}, ${stop.state}`,
        start: stop.checkIn,
        end: stop.checkOut,
        description: `Stop: ${stop.city}, ${stop.state}`,
      })
    }
  }

  return events
}

describe('buildCalendarEvents', () => {
  const stops = [
    { city: 'Chicago', state: 'IL', checkIn: '2026-07-04', checkOut: '2026-07-05' },
    { city: 'Nashville', state: 'TN', checkIn: '2026-07-05', checkOut: '2026-07-07' },
  ]

  it('creates one event per stop', () => {
    const events = buildCalendarEvents(stops, [])
    expect(events).toHaveLength(2)
  })

  it('uses hotel name in summary when reservation exists for city', () => {
    const events = buildCalendarEvents(stops, [
      { hotelName: 'Grand Hyatt', stopCity: 'Nashville', checkIn: '2026-07-05', checkOut: '2026-07-07', totalPrice: 300, currency: 'USD' },
    ])
    expect(events[1].summary).toContain('Grand Hyatt')
  })

  it('uses city name in summary when no reservation', () => {
    const events = buildCalendarEvents(stops, [])
    expect(events[0].summary).toContain('Chicago')
  })

  it('includes total price in description for booked stops', () => {
    const events = buildCalendarEvents(stops, [
      { hotelName: 'Grand Hyatt', stopCity: 'Nashville', checkIn: '2026-07-05', checkOut: '2026-07-07', totalPrice: 300, currency: 'USD' },
    ])
    expect(events[1].description).toContain('300')
  })
})
