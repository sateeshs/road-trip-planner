import { render, screen } from '@testing-library/react'
import DynamicUICard from '@/components/chat-ui/DynamicUICard'
import type { RenderUiResult } from '@/types'

describe('DynamicUICard', () => {
  it('renders trip_stats with distance and duration', () => {
    const result: RenderUiResult = {
      component: 'trip_stats',
      title: 'Your 3-Day Trip',
      data: { totalDistance: '540 miles', totalDuration: '8h 30m', stopCount: 3, estimatedCost: '$650' },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Your 3-Day Trip/)).toBeInTheDocument()
    expect(screen.getByText(/540 miles/)).toBeInTheDocument()
    expect(screen.getByText(/8h 30m/)).toBeInTheDocument()
  })

  it('renders booking_confirmed with hotel name and dates', () => {
    const result: RenderUiResult = {
      component: 'booking_confirmed',
      title: 'Booking Confirmed!',
      data: { hotelName: 'Grand Hyatt', checkIn: '2026-07-01', checkOut: '2026-07-03', nights: 2, totalPrice: 378, currency: 'USD' },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Grand Hyatt/i)).toBeInTheDocument()
    expect(screen.getByText(/\$378/)).toBeInTheDocument()
  })

  it('renders a generic info card for unknown component types', () => {
    // TypeScript won't allow invalid enum values directly — cast for test
    const result = { component: 'unknown_type', title: 'Something Else', data: { foo: 'bar' } } as unknown as RenderUiResult
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Something Else/)).toBeInTheDocument()
  })

  it('renders day_plan with activities', () => {
    const result: RenderUiResult = {
      component: 'day_plan',
      title: 'Day 1 — Chicago',
      data: { day: 1, city: 'Chicago', activities: ['Visit the Bean', 'Lunch at Millennium Park', 'Art Institute'] },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Day 1 — Chicago/)).toBeInTheDocument()
    expect(screen.getByText('Visit the Bean')).toBeInTheDocument()
  })

  it('renders route_summary component', () => {
    const result: RenderUiResult = {
      component: 'route_summary',
      title: 'Trip Itinerary',
      data: { origin: 'Chicago, IL', destination: 'Nashville, TN', stops: ['Indianapolis, IN'] },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Trip Itinerary/)).toBeInTheDocument()
  })

  it('renders hotel_comparison component', () => {
    const result: RenderUiResult = {
      component: 'hotel_comparison',
      title: 'Hotel Options',
      data: {
        hotels: [
          { name: 'Grand Hyatt', price: 189, stars: 4 },
          { name: 'Marriott Downtown', price: 149, stars: 3 },
        ],
      },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Hotel Options/)).toBeInTheDocument()
  })
})
