import { render, screen } from '@testing-library/react'
import RouteSummaryCard from '@/components/chat-ui/RouteSummaryCard'
import type { SuggestRouteStopsResult } from '@/types'

const baseResult: SuggestRouteStopsResult = {
  stops: [
    { city: 'Chicago', state: 'IL', coordinates: { lat: 41.8, lng: -87.6 }, stayNights: 0, checkIn: '2026-07-01', checkOut: '2026-07-01', driveTimeFromPrevious: undefined, driveDistanceFromPrevious: undefined, roadName: undefined, hasToll: false },
    { city: 'Indianapolis', state: 'IN', coordinates: { lat: 39.7, lng: -86.1 }, stayNights: 1, checkIn: '2026-07-01', checkOut: '2026-07-02', driveTimeFromPrevious: '2h 50m', driveDistanceFromPrevious: '182 miles', roadName: 'I-65 S', hasToll: false },
    { city: 'Nashville', state: 'TN', coordinates: { lat: 36.1, lng: -86.7 }, stayNights: 2, checkIn: '2026-07-02', checkOut: '2026-07-04', driveTimeFromPrevious: '3h 10m', driveDistanceFromPrevious: '186 miles', roadName: 'I-65 S', hasToll: true },
  ],
  routeGeometry: null,
  totalDistance: '368 miles',
  totalDuration: '6h 0m',
  message: '',
}

describe('RouteSummaryCard', () => {
  it('renders all stop city names', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
    expect(screen.getByText(/Indianapolis/i)).toBeInTheDocument()
    expect(screen.getByText(/Nashville/i)).toBeInTheDocument()
  })

  it('shows drive time and distance for legs that have them', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/2h 50m/)).toBeInTheDocument()
    expect(screen.getByText(/182 miles/)).toBeInTheDocument()
  })

  it('shows toll warning for toll legs', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/toll/i)).toBeInTheDocument()
  })

  it('shows total distance and duration', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/368 miles/)).toBeInTheDocument()
    expect(screen.getByText(/6h 0m/)).toBeInTheDocument()
  })

  it('renders gracefully with a single stop', () => {
    const result: SuggestRouteStopsResult = {
      ...baseResult,
      stops: [baseResult.stops[0]],
      totalDistance: null,
      totalDuration: null,
    }
    render(<RouteSummaryCard result={result} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })
})
