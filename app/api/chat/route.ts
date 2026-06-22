import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { agentTools, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools,
    maxSteps: 10,
  })

  return result.toDataStreamResponse()
}
