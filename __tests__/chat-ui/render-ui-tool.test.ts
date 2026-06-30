import { describe, it, expect } from 'vitest'
import { agentTools, SYSTEM_PROMPT } from '@/lib/claude-tools'

describe('render_ui tool', () => {
  it('exists in agentTools', () => {
    expect(agentTools).toHaveProperty('render_ui')
    expect(agentTools.render_ui).toBeDefined()
  })

  it('has correct description', () => {
    const tool = agentTools.render_ui
    expect(tool.description).toContain('Render a rich UI component')
    expect(tool.description).toContain('AFTER other tools have already fetched data')
    expect(tool.description).toContain('Do NOT')
    expect(tool.description).toContain('fetch data')
  })

  it('has component enum parameter', () => {
    const tool = agentTools.render_ui
    // Zod schema parameters are in tool.parameters
    expect(tool.parameters).toBeDefined()
  })

  it('execute returns component, title, and data unchanged', async () => {
    const tool = agentTools.render_ui
    const input = {
      component: 'trip_stats' as const,
      title: 'Your 2-Day Trip',
      data: { totalDistance: '300 miles', totalDuration: '5h' },
    }
    const result = await tool.execute(input)
    expect(result).toEqual({
      component: 'trip_stats',
      title: 'Your 2-Day Trip',
      data: { totalDistance: '300 miles', totalDuration: '5h' },
    })
  })

  it('accepts valid component enum values', async () => {
    const tool = agentTools.render_ui
    const validComponents = ['route_summary', 'hotel_comparison', 'day_plan', 'booking_confirmed', 'trip_stats'] as const

    for (const component of validComponents) {
      const result = await tool.execute({
        component,
        title: 'Test',
        data: {},
      })
      expect(result.component).toBe(component)
    }
  })

  it('SYSTEM_PROMPT includes render_ui guidance', () => {
    expect(SYSTEM_PROMPT).toContain('render_ui')
    expect(SYSTEM_PROMPT).toContain('booking_confirmed')
    expect(SYSTEM_PROMPT).toContain('trip_stats')
    expect(SYSTEM_PROMPT).toContain('Never call render_ui before other data-fetching tools')
  })

  it('SYSTEM_PROMPT mentions calling render_ui after tool sequence', () => {
    expect(SYSTEM_PROMPT).toContain('After build_booking_summary succeeds: call render_ui')
  })

  it('SYSTEM_PROMPT instructs not to use render_ui for data fetching', () => {
    expect(SYSTEM_PROMPT).toContain('Never call render_ui to fetch')
  })
})
