import { render, screen } from '@testing-library/react'
import ChatPanel from '@/components/ChatPanel'
import type { Message } from 'ai'

// jsdom does not implement scrollIntoView — mock it globally for this suite
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

// Minimal no-op props for ChatPanel
const baseProps = {
  input: '',
  isLoading: false,
  collapsed: false,
  onToggle: () => {},
  onInputChange: () => {},
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault() },
  onSuggestionSelect: () => {},
  onExpand: () => {},
  tripStyles: [] as string[],
  onToggleTripStyle: () => {},
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

describe('ChatPanel integration — tool-invocation parts', () => {
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

    render(<ChatPanel {...baseProps} messages={[message]} />)

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

    render(<ChatPanel {...baseProps} messages={[message]} />)

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

    render(<ChatPanel {...baseProps} messages={[message]} />)

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

    render(<ChatPanel {...baseProps} messages={[message]} />)

    expect(screen.getByText(/Route Summary/i)).toBeInTheDocument()
    expect(screen.getByText('Your route has been planned.')).toBeInTheDocument()
  })

  it('renders user messages as plain text without AI cards', () => {
    const userMessage: Message = {
      id: 'msg-4',
      role: 'user',
      content: 'Plan a road trip from Chicago to Nashville',
      parts: [
        {
          type: 'text',
          text: 'Plan a road trip from Chicago to Nashville',
        },
      ] as Message['parts'],
    }

    render(<ChatPanel {...baseProps} messages={[userMessage]} />)

    expect(screen.getByText('Plan a road trip from Chicago to Nashville')).toBeInTheDocument()
    // User messages should NOT render the AI assistant label
    expect(screen.queryByText(/AI Assistant/i)).not.toBeInTheDocument()
    // No route card
    expect(screen.queryByText(/Route Summary/i)).not.toBeInTheDocument()
  })
})
