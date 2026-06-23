import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentTools, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const runtime = 'edge'
export const maxDuration = 30

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

// Free model with confirmed tool use support — override with OPENROUTER_MODEL env var
// Other working free models: nvidia/nemotron-3-super-120b-a12b:free
const MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const result = streamText({
    model: openrouter(MODEL),
    system: `${SYSTEM_PROMPT}\n\nToday's date is ${today}. Use this as the default trip start date when none is provided.`,
    messages,
    tools: agentTools,
    maxSteps: 10,
  })

  return result.toDataStreamResponse()
}
