import { streamText, experimental_createMCPClient } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { renderUiTool, SYSTEM_PROMPT } from '@/lib/claude-tools'

export const runtime = 'edge'
export const maxDuration = 30

// OpenRouter: unified API gateway for 200+ models including Claude
// Uses the OpenAI-compatible endpoint with a custom base URL
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    // Shown in your OpenRouter dashboard under usage logs
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://road-trip-planner-blush.vercel.app',
    'X-Title': 'Road Trip Planner',
  },
})

// openai/gpt-oss-120b:free — confirmed to support tool calls reliably.
// openrouter/free is a pseudo-model that picks any available free model; some
// don't support tool_use and silently return text, breaking attractions/hotels.
// Override with OPENROUTER_MODEL env var.
const MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free'

// Max messages to send to the model — trim older ones to avoid context overflow.
// Tool results can be 5–10 KB each; after 3–4 trip modifications the 131K context fills.
const MAX_HISTORY_MESSAGES = 30

// Use MCP Workers when all three env vars are set; fall back to inline tools otherwise.
const USE_MCP = !!(
  process.env.ROUTING_MCP_URL &&
  process.env.PLACES_MCP_URL &&
  process.env.HOTELS_MCP_URL
)

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY is not configured. Add it to your .env.local file.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await req.json() as { messages: any; tripStyles?: string[] }
  const { messages, tripStyles } = body

  // Trim history: keep the most recent MAX_HISTORY_MESSAGES messages.
  // Always keep the first user message so the model knows the original trip request.
  const trimmed: typeof messages =
    messages.length <= MAX_HISTORY_MESSAGES
      ? messages
      : [messages[0], ...messages.slice(-(MAX_HISTORY_MESSAGES - 1))]

  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const styleNote =
    tripStyles && tripStyles.length > 0 && messages.length <= 2
      ? `\n\nTrip style preferences selected by this user: ${tripStyles.join(', ')}. Tailor hotel tier, activity type, and dining recommendations accordingly.`
      : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tools: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mcpClients: Array<{ close: () => Promise<any> }> = []

  if (USE_MCP) {
    // MCP mode — tools served from Cloudflare Workers via Streamable HTTP
    const [routingClient, placesClient, hotelsClient] = await Promise.all([
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.ROUTING_MCP_URL!)),
      }),
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.PLACES_MCP_URL!)),
      }),
      experimental_createMCPClient({
        transport: new StreamableHTTPClientTransport(new URL(process.env.HOTELS_MCP_URL!)),
      }),
    ])

    mcpClients = [routingClient, placesClient, hotelsClient]

    const [routingTools, placesTools, hotelTools] = await Promise.all([
      routingClient.tools(),
      placesClient.tools(),
      hotelsClient.tools(),
    ])

    // render_ui is a client-side-only tool; not served by any Worker
    tools = { ...routingTools, ...placesTools, ...hotelTools, render_ui: renderUiTool }
  } else {
    // Fallback — inline tools (works without MCP env vars)
    const { agentTools } = await import('@/lib/claude-tools')
    tools = agentTools
  }

  const result = streamText({
    model: openrouter(MODEL),
    system: `${SYSTEM_PROMPT}${styleNote}\n\nToday's date is ${today}. Use this as the default trip start date when none is provided.`,
    messages: trimmed,
    tools,
    // Step budget: 1 suggest_route_stops + 4 search_attractions + 4 search_hotels
    // + 4 explore_surroundings = 13 steps for a 4-stop trip. 15 gives headroom without
    // letting the model burn the 30s Edge budget on excessive tool calls.
    maxSteps: 15,
    onError: ({ error }) => {
      console.error('[OpenRouter] streamText error:', error)
    },
    onFinish: async () => {
      if (mcpClients.length > 0) {
        await Promise.allSettled(mcpClients.map((c) => c.close()))
      }
    },
  })

  return result.toDataStreamResponse()
}
