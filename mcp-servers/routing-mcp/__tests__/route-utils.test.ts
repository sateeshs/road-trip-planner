import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCityCoords, addDays } from '../src/route-utils'

describe('resolveCityCoords', () => {
  it('resolves a hardcoded major US city instantly', async () => {
    const result = await resolveCityCoords('Chicago')
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(41.87, 1)
    expect(result!.lng).toBeCloseTo(-87.62, 1)
    expect(result!.state).toBe('IL')
  })

  it('returns null for a completely unknown city', async () => {
    // Mock fetch to return empty results for the unknown city (no network call)
    const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    ).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    )
    const result = await resolveCityCoords('__nonexistent_city_xyz__')
    expect(result).toBeNull()
    spy.mockRestore()
  })

  it('resolves Nashville from hardcoded table', async () => {
    const result = await resolveCityCoords('Nashville')
    expect(result).not.toBeNull()
    expect(result!.state).toBe('TN')
  })
})

describe('addDays', () => {
  it('adds days to a date string', () => {
    expect(addDays('2026-06-01', 3)).toBe('2026-06-04')
  })

  it('handles month rollover', () => {
    expect(addDays('2026-01-29', 3)).toBe('2026-02-01')
  })
})
