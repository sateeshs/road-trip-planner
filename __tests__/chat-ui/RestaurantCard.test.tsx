import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RestaurantCard from '@/components/chat-ui/RestaurantCard'
import type { SearchRestaurantsResult, Attraction } from '@/types'

const makeRestaurants = (n: number): Attraction[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Restaurant ${i + 1}`,
    category: i % 3 === 0 ? 'cafe' : i % 3 === 1 ? 'fast_food' : 'restaurant',
    address: 'Nashville, TN',
    coordinates: { lat: 36.1, lng: -86.7 },
  }))

describe('RestaurantCard', () => {
  it('renders city name in header', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(2), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/Dining · Nashville/i)).toBeInTheDocument()
  })

  it('renders at most 6 restaurants when given more', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(9), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getAllByText(/Restaurant \d+/).length).toBe(6)
  })

  it('shows overflow count when more than 6 restaurants', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(9), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument()
  })

  it('shows empty state when no restaurants', () => {
    const result: SearchRestaurantsResult = { restaurants: [], city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/No dining spots found near Nashville/i)).toBeInTheDocument()
  })

  it('renders category emoji for cafe', () => {
    const result: SearchRestaurantsResult = {
      restaurants: [{ id: '1', name: 'Corner Cafe', category: 'cafe', address: '', coordinates: { lat: 0, lng: 0 } }],
      city: 'Nashville',
    }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText('☕')).toBeInTheDocument()
  })
})
