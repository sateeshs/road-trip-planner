import { describe, it, expect } from 'vitest'

// Pure function extracted from TripContext for testability
function computeEstimatedCost(
  stops: Array<{ city: string; stayNights: number }>,
  hotelsByCity: Record<string, Array<{ pricePerNight?: number }>>,
  confirmedReservations: Array<{ totalPrice: number }>,
): { min: number; max: number; confirmed: boolean } | null {
  if (confirmedReservations.length > 0) {
    const total = confirmedReservations.reduce((sum, r) => sum + r.totalPrice, 0)
    return { min: total, max: total, confirmed: true }
  }
  let min = 0, max = 0
  for (const stop of stops.slice(1)) {
    const hotels = hotelsByCity[stop.city] ?? []
    const prices = hotels.map(h => h.pricePerNight ?? 0).filter(p => p > 0).sort((a, b) => a - b)
    if (prices.length === 0) continue
    const nights = stop.stayNights || 1
    min += prices[0] * nights
    max += prices[Math.min(2, prices.length - 1)] * nights
  }
  return min > 0 ? { min, max, confirmed: false } : null
}

describe('computeEstimatedCost', () => {
  it('returns confirmed total when reservations exist', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 2 }],
      {},
      [{ totalPrice: 300 }, { totalPrice: 150 }],
    )
    expect(result).toEqual({ min: 450, max: 450, confirmed: true })
  })

  it('estimates min/max from hotel prices when no reservations', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 1 }],
      { Nashville: [{ pricePerNight: 100 }, { pricePerNight: 150 }, { pricePerNight: 200 }] },
      [],
    )
    expect(result).toEqual({ min: 100, max: 200, confirmed: false })
  })

  it('returns null when no hotels and no reservations', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 1 }],
      {},
      [],
    )
    expect(result).toBeNull()
  })

  it('multiplies price by stayNights', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 3 }],
      { Nashville: [{ pricePerNight: 100 }] },
      [],
    )
    expect(result?.min).toBe(300)
  })
})
