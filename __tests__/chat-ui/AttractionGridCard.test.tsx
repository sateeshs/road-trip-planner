import { render, screen } from '@testing-library/react'
import AttractionGridCard from '@/components/chat-ui/AttractionGridCard'
import type { SearchAttractionsResult } from '@/types'

function makeAttractions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    name: `Attraction ${i + 1}`,
    category: i % 2 === 0 ? 'Museum' : 'Park',
    address: `${i} Main St`,
    coordinates: { lat: 36.1 + i * 0.01, lng: -86.7 + i * 0.01 },
  }))
}

describe('AttractionGridCard', () => {
  it('shows city name', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(3), city: 'Nashville' }} />)
    expect(screen.getByText(/Nashville/i)).toBeInTheDocument()
  })

  it('renders up to 6 attractions', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(10), city: 'Nashville' }} />)
    expect(screen.getByText('Attraction 6')).toBeInTheDocument()
    expect(screen.queryByText('Attraction 7')).not.toBeInTheDocument()
  })

  it('renders all when fewer than 6', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(4), city: 'Nashville' }} />)
    expect(screen.getByText('Attraction 4')).toBeInTheDocument()
  })

  it('shows empty state when no attractions', () => {
    render(<AttractionGridCard result={{ attractions: [], city: 'Nashville' }} />)
    expect(screen.getByText(/No attractions found/i)).toBeInTheDocument()
  })

  it('shows category labels', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(2), city: 'Nashville' }} />)
    expect(screen.getByText('Museum')).toBeInTheDocument()
    expect(screen.getByText('Park')).toBeInTheDocument()
  })

  it('shows overflow count when more than 6 attractions', () => {
    const manyAttractions = Array.from({ length: 9 }, (_, i) => ({
      id: `a${i}`,
      name: `Attraction ${i + 1}`,
      category: 'museum',
      address: `${i} Main St`,
      coordinates: { lat: 36.1, lng: -86.7 },
    }))
    // cast needed: test intentionally uses partial data to verify graceful max-6 capping
    render(<AttractionGridCard result={{ attractions: manyAttractions as any, city: 'Nashville' }} />)
    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument()
  })
})
