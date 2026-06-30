import { describe, it, expect } from 'vitest'
import { agentTools } from '@/lib/claude-tools'

describe('search_restaurants tool', () => {
  it('exists in agentTools', () => {
    expect(agentTools).toHaveProperty('search_restaurants')
  })

  it('has a description mentioning dining or restaurants', () => {
    const tool = agentTools.search_restaurants as { description: string }
    expect(tool.description).toMatch(/restaurant|dining/i)
  })

  it('has execute function', () => {
    const tool = agentTools.search_restaurants as { execute: unknown }
    expect(typeof tool.execute).toBe('function')
  })
})
