import { render, screen } from '@testing-library/react'
import HotelResultsCard from '@/components/chat-ui/HotelResultsCard'
import type { SearchHotelsResult } from '@/types'

const hotels = [
  { hotelId: 'h1', name: 'Grand Hyatt', starRating: 4, pricePerNight: 189, currency: 'USD', amenities: ['wifi', 'pool', 'parking'], address: '123 Main St', coordinates: { lat: 41.8, lng: -87.6 } },
  { hotelId: 'h2', name: 'Budget Inn', starRating: 2, pricePerNight: 65, currency: 'USD', amenities: ['wifi'], address: '456 Oak Ave', coordinates: { lat: 41.82, lng: -87.62 } },
  { hotelId: 'h3', name: 'The Marriott', starRating: 3, pricePerNight: 130, currency: 'USD', amenities: ['wifi', 'gym'], address: '789 Park Blvd', coordinates: { lat: 41.81, lng: -87.61 } },
  { hotelId: 'h4', name: 'Ritz Carlton', starRating: 5, pricePerNight: 420, currency: 'USD', amenities: ['spa', 'pool', 'concierge'], address: '1 Luxury Dr', coordinates: { lat: 41.79, lng: -87.59 } },
]

const result: SearchHotelsResult = {
  hotels,
  city: 'Chicago',
  checkIn: '2026-07-01',
  checkOut: '2026-07-02',
}

describe('HotelResultsCard', () => {
  it('shows city name in header', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })

  it('shows at most 3 hotels', () => {
    render(<HotelResultsCard result={result} />)
    // 4 hotels provided, only 3 should appear
    expect(screen.queryByText('Ritz Carlton')).not.toBeInTheDocument()
    expect(screen.getByText('Grand Hyatt')).toBeInTheDocument()
  })

  it('shows price per night', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getByText(/\$65/)).toBeInTheDocument()
  })

  it('shows empty state when no hotels', () => {
    render(<HotelResultsCard result={{ ...result, hotels: [] }} />)
    expect(screen.getByText(/No hotels found/i)).toBeInTheDocument()
  })

  it('shows amenity tags', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getAllByText(/wifi/i).length).toBeGreaterThan(0)
  })
})
