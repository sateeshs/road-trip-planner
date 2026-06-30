import type { ToolInvocationPart } from '@/types'

describe('ToolInvocationPart type', () => {
  it('accepts a completed tool invocation shape', () => {
    const part: ToolInvocationPart = {
      type: 'tool-invocation',
      toolInvocation: {
        toolName: 'search_hotels',
        toolCallId: 'call-123',
        state: 'result',
        result: { hotels: [], city: 'Chicago' },
      },
    }
    expect(part.toolInvocation.state).toBe('result')
  })
})
