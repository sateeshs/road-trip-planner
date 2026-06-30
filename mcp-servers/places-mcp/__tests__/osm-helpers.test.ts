import { describe, it, expect } from 'vitest'
import { osmCategory, osmAddress, parseSurroundingsElements } from '../src/osm-helpers'

describe('osmCategory', () => {
  it('returns Museum for tourism=museum', () => {
    expect(osmCategory({ tourism: 'museum' })).toBe('Museum')
  })

  it('returns Park for leisure=park', () => {
    expect(osmCategory({ leisure: 'park' })).toBe('Park')
  })

  it('falls back to Attraction for unknown tags', () => {
    expect(osmCategory({})).toBe('Attraction')
  })
})

describe('osmAddress', () => {
  it('assembles address from OSM tags', () => {
    expect(osmAddress({ 'addr:housenumber': '123', 'addr:street': 'Main St', 'addr:city': 'Nashville' }, 'Nashville'))
      .toBe('123, Main St, Nashville')
  })

  it('falls back to city when no address tags', () => {
    expect(osmAddress({}, 'Chicago')).toBe('Chicago')
  })
})

describe('parseSurroundingsElements', () => {
  it('infers Kayaking category from name', () => {
    const elements = [{
      id: 1, type: 'node' as const, lat: 41.8, lon: -87.6,
      tags: { tourism: 'attraction', name: 'Chicago Kayak Tours' },
    }]
    const results = parseSurroundingsElements(elements, 'Chicago', 5)
    expect(results[0].category).toBe('Kayaking')
  })

  it('deduplicates by name', () => {
    const elements = [
      { id: 1, type: 'node' as const, lat: 41.8, lon: -87.6, tags: { tourism: 'park', name: 'Central Park' } },
      { id: 2, type: 'node' as const, lat: 41.9, lon: -87.7, tags: { tourism: 'park', name: 'Central Park' } },
    ]
    expect(parseSurroundingsElements(elements, 'Chicago', 5)).toHaveLength(1)
  })

  it('respects limit', () => {
    const elements = Array.from({ length: 10 }, (_, i) => ({
      id: i, type: 'node' as const, lat: 41.8, lon: -87.6,
      tags: { leisure: 'park', name: `Park ${i}` },
    }))
    expect(parseSurroundingsElements(elements, 'Chicago', 3)).toHaveLength(3)
  })
})
