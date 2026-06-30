import { describe, it, expect } from 'vitest'
import { buildBookingSummaryPayload, osmAddress } from '../src/osm-hotel-helpers'

describe('buildBookingSummaryPayload', () => {
  it('calculates nights and total price correctly', () => {
    const result = buildBookingSummaryPayload({
      hotelId: 'h1', hotelName: 'Test Hotel', offerId: 'o1',
      roomType: 'Standard', pricePerNight: 100, currency: 'USD',
      checkIn: '2026-07-01', checkOut: '2026-07-03',
      adults: 2, cancellationPolicy: 'Non-refundable', breakfastIncluded: false,
    })
    expect(result.summary.nights).toBe(2)
    expect(result.summary.totalPrice).toBe(200)
    expect(result.summary.bookingUrl).toContain('offerId=o1')
  })

  it('builds correct booking URL', () => {
    const result = buildBookingSummaryPayload({
      hotelId: 'h2', hotelName: 'Inn', offerId: 'xyz',
      roomType: 'Deluxe', pricePerNight: 150, currency: 'USD',
      checkIn: '2026-08-10', checkOut: '2026-08-12',
      adults: 1, cancellationPolicy: 'Free cancellation', breakfastIncluded: true,
    })
    expect(result.summary.bookingUrl).toContain('adults=1')
  })
})

describe('osmAddress', () => {
  it('assembles address from tags', () => {
    const result = osmAddress({ 'addr:housenumber': '10', 'addr:street': 'Oak Ave' }, 'Nashville')
    expect(result).toContain('Oak Ave')
  })

  it('falls back to city when no addr tags', () => {
    expect(osmAddress({}, 'Memphis')).toBe('Memphis')
  })
})
