import { render, screen } from '@testing-library/react'
import ChatModal from '@/components/ChatModal'
import type { Message } from 'ai'

// jsdom does not implement scrollIntoView — mock it globally for this suite
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

// ChatModal uses useTripContext() — provide a minimal mock so we control messages
vi.mock('@/contexts/TripContext', () => ({
  useTripContext: vi.fn(),
}))

import { useTripContext } from '@/contexts/TripContext'

const mockUseTripContext = useTripContext as ReturnType<typeof vi.fn>

function setupContext(messages: Message[], isLoading = false) {
  mockUseTripContext.mockReturnValue({
    messages,
    input: '',
    isLoading,
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn((e: React.FormEvent<HTMLFormElement>) => e.preventDefault()),
    setInput: vi.fn(),
  })
}

function makeAssistantMessage(parts: Message['parts'], id = 'msg-1'): Message {
  return {
    id,
    role: 'assistant',
    content: '',
    parts,
  } as Message
}

const routeStopsResult = {
  stops: [
    {
      city: 'Chicago',
      state: 'IL',
      coordinates: { lat: 41.8781, lng: -87.6298 },
      stayNights: 1,
      checkIn: '2026-07-01',
      checkOut: '2026-07-02',
    },
    {
      city: 'Nashville',
      state: 'TN',
      coordinates: { lat: 36.1627, lng: -86.7816 },
      stayNights: 0,
      checkIn: '2026-07-02',
      checkOut: '2026-07-02',
    },
  ],
  routeGeometry: null,
  totalDistance: '476 miles',
  totalDuration: '7h 10m',
  message: 'Route planned',
}

describe('ChatModal integration — tool-invocation parts', () => {
  it('renders RouteSummaryCard when assistant message has a suggest_route_stops result part', () => {
    const message = makeAssistantMessage([
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'suggest_route_stops',
          toolCallId: 'call-1',
          state: 'result',
          result: routeStopsResult,
        },
      },
    ] as Message['parts'])

    setupContext([message])
    render(<ChatModal onClose={vi.fn()} />)

    // RouteSummaryCard renders city names from the stops
    expect(screen.getByText('Chicago')).toBeInTheDocument()
    expect(screen.getByText('Nashville')).toBeInTheDocument()
    // The Route Summary header is also rendered
    expect(screen.getByText(/Route Summary/i)).toBeInTheDocument()
  })

  it('renders nothing for a suggest_route_stops tool-invocation in state=call (in-progress)', () => {
    const message = makeAssistantMessage([
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'suggest_route_stops',
          toolCallId: 'call-2',
          state: 'call',
          args: { origin: 'Chicago', destination: 'Nashville' },
        },
      },
    ] as Message['parts'])

    setupContext([message])
    render(<ChatModal onClose={vi.fn()} />)

    // No card content should appear since the tool call is in-progress
    expect(screen.queryByText(/Route Summary/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Chicago')).not.toBeInTheDocument()
  })

  it('renders text content normally for a text-only assistant message', () => {
    const message: Message = {
      id: 'msg-3',
      role: 'assistant',
      content: 'Here is your trip summary!',
      parts: [
        {
          type: 'text',
          text: 'Here is your trip summary!',
        },
      ] as Message['parts'],
    }

    setupContext([message])
    render(<ChatModal onClose={vi.fn()} />)

    expect(screen.getByText('Here is your trip summary!')).toBeInTheDocument()
    // The AI Assistant label should appear
    expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument()
  })

  it('renders both tool cards and text when message has both parts', () => {
    const message = makeAssistantMessage([
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'suggest_route_stops',
          toolCallId: 'call-3',
          state: 'result',
          result: routeStopsResult,
        },
      },
      {
        type: 'text',
        text: 'Your route has been planned.',
      },
    ] as Message['parts'])

    setupContext([message])
    render(<ChatModal onClose={vi.fn()} />)

    expect(screen.getByText(/Route Summary/i)).toBeInTheDocument()
    expect(screen.getByText('Your route has been planned.')).toBeInTheDocument()
  })
})
