import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentTools, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const maxDuration = 60

// OpenRouter: unified API gateway for 200+ models including Claude
// Uses the OpenAI-compatible endpoint with a custom base URL
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    // Shown in your OpenRouter dashboard under usage logs
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://road-trip-planner-blush.vercel.app',
    'X-Title': 'Road Trip Planner',
  },
})

// Free model on OpenRouter with tool use support — override with OPENROUTER_MODEL env var
// Free models: https://openrouter.ai/models?q=free
const MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openrouter(MODEL),
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools,
    maxSteps: 10,
  })

  return result.toDataStreamResponse()
}
