import { render, screen } from '@testing-library/react'
import ChatToolResultRenderer from '@/components/chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'

function makePart(toolName: string, result: unknown): ToolInvocationPart {
  return {
    type: 'tool-invocation',
    toolInvocation: { toolName, toolCallId: 'id-1', state: 'result', result },
  }
}

describe('ChatToolResultRenderer', () => {
  it('renders nothing for in-progress tool calls (state=call)', () => {
    const part: ToolInvocationPart = {
      type: 'tool-invocation',
      toolInvocation: { toolName: 'search_hotels', toolCallId: 'id-1', state: 'call' },
    }
    const { container } = render(<ChatToolResultRenderer part={part} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for unknown tool names', () => {
    const part = makePart('unknown_tool', {})
    const { container } = render(<ChatToolResultRenderer part={part} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a card for search_hotels with valid result', () => {
    const part = makePart('search_hotels', { hotels: [], city: 'Chicago', checkIn: '2026-07-01', checkOut: '2026-07-02' })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Hotels · Chicago/i)).toBeInTheDocument()
  })

  it('renders a card for search_attractions with valid result', () => {
    const part = makePart('search_attractions', { attractions: [], city: 'Nashville' })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Attractions · Nashville/i)).toBeInTheDocument()
  })

  it('renders a card for suggest_route_stops with valid result', () => {
    const part = makePart('suggest_route_stops', {
      stops: [
        { city: 'Chicago', state: 'IL', coordinates: { lat: 41.8, lng: -87.6 }, stayNights: 0, checkIn: '', checkOut: '' },
        { city: 'Nashville', state: 'TN', coordinates: { lat: 36.1, lng: -86.7 }, stayNights: 1, checkIn: '', checkOut: '' },
      ],
      totalDistance: '476 miles', totalDuration: '7h 10m', routeGeometry: null, message: '',
    })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })

  it('renders a card for explore_surroundings with valid result', () => {
    const part = makePart('explore_surroundings', { surroundings: [], city: 'Pigeon Forge', activities: [] })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Pigeon Forge/i)).toBeInTheDocument()
  })
})
