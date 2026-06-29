import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT } from '@/lib/claude-tools'

describe('SYSTEM_PROMPT', () => {
  it('includes grounding instruction forbidding fabricated data', () => {
    expect(SYSTEM_PROMPT).toMatch(/never fabricate|never make up/i)
  })

  it('includes structured response schema with Route Overview section', () => {
    expect(SYSTEM_PROMPT).toMatch(/Route Overview/i)
  })

  it('includes structured response schema with Trip Budget section', () => {
    expect(SYSTEM_PROMPT).toMatch(/Trip Budget/i)
  })

  it('includes search_restaurants in tool call order', () => {
    expect(SYSTEM_PROMPT).toMatch(/search_restaurants/i)
  })

  it('includes conditional note to omit Dining section when tool not yet run', () => {
    expect(SYSTEM_PROMPT).toMatch(/omit this section if search_restaurants hasn't run yet/i)
  })
})
