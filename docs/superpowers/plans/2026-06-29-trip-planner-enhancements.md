# Trip Planner Intelligence Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured AI output, restaurant search, trip-style preference chips, cost estimate, and `.ics` calendar export — sourced from two reference apps (Shubhamsaboo/awesome-llm-apps) analyzed against this codebase.

**Architecture:** Six additive enhancements on top of the existing Edge streaming pipeline. No backend architecture changes. Restaurant search uses the existing Overpass mirror-racing pattern. Trip styles are passed in the `useChat` body and injected into the system prompt server-side. Cost estimate is derived from existing TripContext state. Calendar export uses a Node.js (non-Edge) API route with `ical-generator`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Vercel AI SDK (`ai`/`@ai-sdk/openai`), Zod, Vitest + @testing-library/react, `ical-generator` (new)

## Global Constraints

- All test files go in `__tests__/` using Vitest + @testing-library/react; run with `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run`
- All new API routes on Edge runtime unless explicitly stated otherwise; the calendar export route uses `export const runtime = 'nodejs'`
- No `@apply` in Tailwind — utility classes only
- TDD: write failing test first, then implement
- Immutable data patterns — no mutation of existing state
- Purely additive — no changes to OSRM routing, Leaflet map, or TripContext state shape (only additions)
- Build must pass: `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run build`
- `ical-generator` is the only new production dependency allowed
- Node v22.13.1 required — prefix all `npm`/`node` commands with `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"`

---

## Stack Compatibility Notes

| Enhancement | Compatibility |
|---|---|
| SYSTEM_PROMPT edits | ✅ String-only change to `lib/claude-tools.ts` |
| `search_restaurants` Overpass tool | ✅ fetch-based, Edge runtime, mirrors existing pattern exactly |
| `RestaurantCard` component | ✅ Tailwind, follows AttractionGridCard pattern |
| Trip Style chips | ✅ `useChat({ body })` passes extra data; API route reads it from `req.json()` |
| Cost estimate | ✅ Derived in TripContext from existing `hotelsByCity` + `confirmedReservations` |
| `.ics` export | ⚠️ `ical-generator` requires Node.js Buffer — route must use `runtime = 'nodejs'` |

---

## File Map

### New Files
```
components/
  TripStylePicker.tsx            — multi-select trip style chips (Budget, Family, etc.)
  chat-ui/
    RestaurantCard.tsx           — dining results card for search_restaurants results
app/api/
  export-calendar/route.ts      — Node.js route: POST → .ics file download
__tests__/
  TripStylePicker.test.tsx
  chat-ui/
    RestaurantCard.test.tsx
  export-calendar.test.ts
```

### Modified Files
```
lib/claude-tools.ts              — search_restaurants tool + SYSTEM_PROMPT structured schema + grounding
types/index.ts                   — SearchRestaurantsResult interface
components/chat-ui/
  ChatToolResultRenderer.tsx     — add 'search_restaurants' case → RestaurantCard
contexts/TripContext.tsx         — tripStyles state + useChat body + estimatedTripCost memo
components/
  ChatPanel.tsx                  — show TripStylePicker when no messages, pass styles up
  FloatingRouteSummary.tsx       — show cost estimate badge + .ics download button
app/api/chat/route.ts            — read tripStyles from body, inject into system prompt
package.json                     — add ical-generator
```

---

### Task 1: SYSTEM_PROMPT Structured Output Schema + Grounding

**Files:**
- Modify: `lib/claude-tools.ts` (SYSTEM_PROMPT string at the bottom)
- Test: `__tests__/system-prompt.test.ts`

**Interfaces:**
- Consumes: existing `SYSTEM_PROMPT` export
- Produces: same `SYSTEM_PROMPT` export, extended with new instructions

- [ ] **Step 1: Write the failing test**

Create `__tests__/system-prompt.test.ts`:

```typescript
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
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/system-prompt.test.ts
```

Expected: 4 tests FAIL

- [ ] **Step 3: Add to SYSTEM_PROMPT in `lib/claude-tools.ts`**

Find the closing backtick of `SYSTEM_PROMPT` (currently ends with `...never call render_ui before other data-fetching tools have run.\``). Append before that closing backtick:

```typescript
// Insert this block just before the closing backtick of SYSTEM_PROMPT:

GROUNDING:
Never fabricate hotel names, prices, attraction ratings, or restaurant details. If a tool returns no results or the data is unavailable, say so clearly. Do not invent specifics.

TOOL CALL ORDER UPDATE — after explore_surroundings, also call:
8. Call **search_restaurants** for every stop using the canonical city name from suggest_route_stops.

STRUCTURED RESPONSE FORMAT — after all tools complete, produce a response with these exact sections:

**Route Overview**
[origin] → [stop1] → [stop2] → [destination] · [total distance] · [total drive time]

**Stops & Drive Times**
- [City]: [drive time] from [previous city] via [highway]
(one bullet per stop)

**Hotels**
- [City]: [hotel name] — $[price]/night
(top pick per stop; if no hotel found, say "No hotels found")

**Activities**
- [City]: [2-3 attraction names with emoji]

**Dining**
- [City]: [1-2 restaurant names with type emoji]
(omit this section if search_restaurants hasn't run yet)

**Trip Budget Estimate**
Estimated total: $[min]–$[max] ([N] nights · [N] stops)
(estimate hotels only; note this is based on lowest available rates)

**Practical Tips**
[toll warnings, seasonal notes, rest stop suggestions — omit if none apply]
`
```

Full replacement — the end of SYSTEM_PROMPT should now read:

```typescript
- Never call render_ui to fetch or look up data. Only call it to present data that other tools have already returned.
- Never call render_ui before other data-fetching tools have run.

GROUNDING:
Never fabricate hotel names, prices, attraction ratings, or restaurant details. If a tool returns no results or the data is unavailable, say so clearly. Do not invent specifics.

TOOL CALL ORDER UPDATE — after explore_surroundings, also call:
8. Call **search_restaurants** for every stop using the canonical city name from suggest_route_stops.

STRUCTURED RESPONSE FORMAT — after all tools complete, produce a response with these exact sections:

**Route Overview**
[origin] → [stop1] → [stop2] → [destination] · [total distance] · [total drive time]

**Stops & Drive Times**
- [City]: [drive time] from [previous city] via [highway]

**Hotels**
- [City]: [hotel name] — $[price]/night

**Activities**
- [City]: [2-3 attraction names with emoji]

**Dining**
- [City]: [1-2 restaurant names with type emoji]

**Trip Budget Estimate**
Estimated total: $[min]–$[max] ([N] nights · [N] stops)

**Practical Tips**
[toll warnings, seasonal notes, rest stop suggestions — omit if none apply]`
```

- [ ] **Step 4: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/system-prompt.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Run full test suite**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run
```

Expected: all existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add lib/claude-tools.ts __tests__/system-prompt.test.ts
git commit -m "feat: add structured output schema and grounding instructions to SYSTEM_PROMPT"
```

---

### Task 2: `search_restaurants` Tool + Type

**Files:**
- Modify: `lib/claude-tools.ts` — add `search_restaurants` to `agentTools`
- Modify: `types/index.ts` — add `SearchRestaurantsResult`
- Test: `__tests__/search-restaurants-tool.test.ts`

**Interfaces:**
- Consumes: existing `overpassQuery()`, `resolveCityCoords()`, `Attraction` type
- Produces:
  ```typescript
  // In types/index.ts:
  export interface SearchRestaurantsResult {
    restaurants: Attraction[]
    city: string
  }
  // In agentTools:
  search_restaurants: tool({ ... execute: async ({ city }) => SearchRestaurantsResult })
  ```

- [ ] **Step 1: Add `SearchRestaurantsResult` to `types/index.ts`**

Append after `SearchSurroundingsResult` (around line 171):

```typescript
export interface SearchRestaurantsResult {
  restaurants: Attraction[]
  city: string
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/search-restaurants-tool.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/search-restaurants-tool.test.ts
```

Expected: FAIL — `search_restaurants` does not exist yet

- [ ] **Step 4: Add `search_restaurants` to `agentTools` in `lib/claude-tools.ts`**

Add before the `render_ui` tool (around line 715), inside `agentTools`:

```typescript
  search_restaurants: tool({
    description:
      'Search for restaurants and dining options near a stop city. ' +
      'Call once per stop AFTER search_hotels completes. ' +
      'Uses OpenStreetMap data — returns top dining spots (restaurants, cafes, bars) within 5 km.',
    parameters: z.object({
      city: z.string().describe('City name — use the exact canonical name from suggest_route_stops'),
    }),
    execute: async ({ city }) => {
      const coords = await resolveCityCoords(city)
      if (!coords) return { restaurants: [], city }

      const { lat, lng } = coords
      const radius = 5000 // 5 km

      // OSM dining query — same mirror-racing pattern as other Overpass calls
      const ql = `
[out:json][timeout:12];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub|bistro"](around:${radius},${lat},${lng});
);
out center 20;`

      const elements = await overpassQuery(ql)

      const restaurants: Attraction[] = elements
        .filter(el => el.tags?.name)
        .slice(0, 8)
        .map(el => {
          const elLat = el.lat ?? el.center?.lat ?? lat
          const elLng = el.lon ?? el.center?.lon ?? lng
          const amenity = el.tags?.amenity ?? 'restaurant'
          return {
            id: String(el.id),
            name: el.tags!.name!,
            category: amenity,
            address: [
              el.tags?.['addr:housenumber'],
              el.tags?.['addr:street'],
              el.tags?.['addr:city'],
            ].filter(Boolean).join(' ') || city,
            coordinates: { lat: elLat, lng: elLng },
            description: el.tags?.cuisine ? `Cuisine: ${el.tags.cuisine}` : undefined,
            website: el.tags?.website,
          }
        })

      return { restaurants, city }
    },
  }),
```

- [ ] **Step 5: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/search-restaurants-tool.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Run full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run && npm run build 2>&1 | tail -10
```

Expected: all tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add lib/claude-tools.ts types/index.ts __tests__/search-restaurants-tool.test.ts
git commit -m "feat: add search_restaurants tool and SearchRestaurantsResult type"
```

---

### Task 3: RestaurantCard + Dispatcher Wiring

**Files:**
- Create: `components/chat-ui/RestaurantCard.tsx`
- Modify: `components/chat-ui/ChatToolResultRenderer.tsx` — add `search_restaurants` case
- Test: `__tests__/chat-ui/RestaurantCard.test.tsx`

**Interfaces:**
- Consumes:
  ```typescript
  import type { SearchRestaurantsResult } from '@/types'
  interface Props { result: SearchRestaurantsResult }
  ```
- Produces: `<RestaurantCard result={...} />` rendered by `ChatToolResultRenderer`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/chat-ui/RestaurantCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RestaurantCard from '@/components/chat-ui/RestaurantCard'
import type { SearchRestaurantsResult, Attraction } from '@/types'

const makeRestaurants = (n: number): Attraction[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Restaurant ${i + 1}`,
    category: i % 3 === 0 ? 'cafe' : i % 3 === 1 ? 'fast_food' : 'restaurant',
    address: 'Nashville, TN',
    coordinates: { lat: 36.1, lng: -86.7 },
  }))

describe('RestaurantCard', () => {
  it('renders city name in header', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(2), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/Dining · Nashville/i)).toBeInTheDocument()
  })

  it('renders at most 6 restaurants when given more', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(9), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getAllByText(/Restaurant \d+/).length).toBe(6)
  })

  it('shows overflow count when more than 6 restaurants', () => {
    const result: SearchRestaurantsResult = { restaurants: makeRestaurants(9), city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument()
  })

  it('shows empty state when no restaurants', () => {
    const result: SearchRestaurantsResult = { restaurants: [], city: 'Nashville' }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText(/No dining spots found near Nashville/i)).toBeInTheDocument()
  })

  it('renders category emoji for cafe', () => {
    const result: SearchRestaurantsResult = {
      restaurants: [{ id: '1', name: 'Corner Cafe', category: 'cafe', address: '', coordinates: { lat: 0, lng: 0 } }],
      city: 'Nashville',
    }
    render(<RestaurantCard result={result} />)
    expect(screen.getByText('☕')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/chat-ui/RestaurantCard.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `components/chat-ui/RestaurantCard.tsx`**

```typescript
'use client'
import type { SearchRestaurantsResult } from '@/types'

interface Props {
  result: SearchRestaurantsResult
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  fast_food: '🍔',
  food_court: '🍱',
  bar: '🍺',
  pub: '🍺',
  bistro: '🥘',
}

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '🍴'
}

export default function RestaurantCard({ result }: Props) {
  const { restaurants, city } = result
  const displayed = restaurants.slice(0, 6)
  const overflow = restaurants.length - displayed.length

  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50 overflow-hidden text-sm mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5">
        <span className="text-base">🍽️</span>
        <span className="font-semibold">Dining · {city}</span>
        <span className="ml-auto text-orange-200 text-xs">{restaurants.length} spot{restaurants.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {displayed.length === 0 ? (
          <p className="text-orange-600 text-center py-2">No dining spots found near {city}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {displayed.map(r => (
                <div key={r.id} className="bg-white rounded-lg border border-orange-100 px-3 py-2">
                  <div className="text-lg leading-none mb-1">{categoryEmoji(r.category)}</div>
                  <p className="font-medium text-gray-900 text-xs leading-snug line-clamp-2">{r.name}</p>
                  <p className="text-orange-600 text-[11px] mt-0.5 capitalize">{r.category.replace('_', ' ')}</p>
                  {r.description && (
                    <p className="text-gray-400 text-[10px] mt-0.5 line-clamp-1">{r.description}</p>
                  )}
                </div>
              ))}
            </div>
            {overflow > 0 && (
              <p className="text-center text-orange-500 text-[11px] mt-2">
                +{overflow} more · click a stop on the map to explore
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add `search_restaurants` case to `ChatToolResultRenderer.tsx`**

Open `components/chat-ui/ChatToolResultRenderer.tsx`. Add the import and case:

```typescript
// Add import at the top alongside other card imports:
import RestaurantCard from './RestaurantCard'
import type { SearchRestaurantsResult } from '@/types'
```

In the switch statement, add before the `default` case:

```typescript
case 'search_restaurants':
  return <RestaurantCard result={toolInvocation.result as SearchRestaurantsResult} />
```

- [ ] **Step 5: Run tests to verify GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/chat-ui/RestaurantCard.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 6: Run full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run && npm run build 2>&1 | tail -5
```

Expected: all tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add components/chat-ui/RestaurantCard.tsx components/chat-ui/ChatToolResultRenderer.tsx __tests__/chat-ui/RestaurantCard.test.tsx
git commit -m "feat: add RestaurantCard and wire search_restaurants into chat dispatcher"
```

---

### Task 4: Trip Style Preference Chips

**Files:**
- Create: `components/TripStylePicker.tsx`
- Modify: `contexts/TripContext.tsx` — add `tripStyles` state, pass in `useChat` body, expose via context
- Modify: `components/ChatPanel.tsx` — show `TripStylePicker` when no messages
- Modify: `app/api/chat/route.ts` — read `tripStyles` from body, inject into system prompt
- Test: `__tests__/TripStylePicker.test.tsx`

**Interfaces:**
- `TripStylePicker` props:
  ```typescript
  interface TripStylePickerProps {
    selectedStyles: string[]
    onToggle: (style: string) => void
  }
  ```
- TripContext additions:
  ```typescript
  tripStyles: string[]
  setTripStyles: (styles: string[]) => void   // or toggleTripStyle
  ```

- [ ] **Step 1: Write the failing tests**

Create `__tests__/TripStylePicker.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TripStylePicker from '@/components/TripStylePicker'

describe('TripStylePicker', () => {
  it('renders all 6 style chips', () => {
    render(<TripStylePicker selectedStyles={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/Budget/i)).toBeInTheDocument()
    expect(screen.getByText(/Luxury/i)).toBeInTheDocument()
    expect(screen.getByText(/Family/i)).toBeInTheDocument()
    expect(screen.getByText(/Adventure/i)).toBeInTheDocument()
    expect(screen.getByText(/Foodie/i)).toBeInTheDocument()
    expect(screen.getByText(/Romantic/i)).toBeInTheDocument()
  })

  it('calls onToggle with the style label when a chip is clicked', () => {
    const onToggle = vi.fn()
    render(<TripStylePicker selectedStyles={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByText(/Budget/i))
    expect(onToggle).toHaveBeenCalledWith('Budget')
  })

  it('shows selected chip with distinct styling', () => {
    render(<TripStylePicker selectedStyles={['Adventure']} onToggle={vi.fn()} />)
    const chip = screen.getByText(/Adventure/i).closest('button')
    expect(chip?.className).toMatch(/bg-blue-600|ring-2|selected/i)
  })

  it('does not show selected styling for unselected chips', () => {
    render(<TripStylePicker selectedStyles={['Adventure']} onToggle={vi.fn()} />)
    const chip = screen.getByText(/Budget/i).closest('button')
    expect(chip?.className).not.toMatch(/bg-blue-600/)
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/TripStylePicker.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `components/TripStylePicker.tsx`**

```typescript
'use client'

const TRIP_STYLES = [
  { label: 'Budget', emoji: '💰' },
  { label: 'Luxury', emoji: '✨' },
  { label: 'Family', emoji: '👨‍👩‍👧' },
  { label: 'Adventure', emoji: '🏕️' },
  { label: 'Foodie', emoji: '🍜' },
  { label: 'Romantic', emoji: '💑' },
]

interface TripStylePickerProps {
  selectedStyles: string[]
  onToggle: (style: string) => void
}

export default function TripStylePicker({ selectedStyles, onToggle }: TripStylePickerProps) {
  return (
    <div className="px-3 pb-2">
      <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Trip style (optional)</p>
      <div className="flex flex-wrap gap-1.5">
        {TRIP_STYLES.map(({ label, emoji }) => {
          const isSelected = selectedStyles.includes(label)
          return (
            <button
              key={label}
              type="button"
              onClick={() => onToggle(label)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/TripStylePicker.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 5: Add `tripStyles` to `TripContext.tsx`**

Read `contexts/TripContext.tsx` to find the `TripContextValue` interface and `useState` declarations.

In the `TripContextValue` interface, add:
```typescript
tripStyles: string[]
toggleTripStyle: (style: string) => void
```

In the provider component body, add state (near other `useState` calls):
```typescript
const [tripStyles, setTripStyles] = useState<string[]>([])

const toggleTripStyle = useCallback((style: string) => {
  setTripStyles(prev =>
    prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
  )
}, [])
```

In the `useChat` call, add `body` option so `tripStyles` is sent with every request:
```typescript
const { messages, input, handleSubmit, handleInputChange, isLoading, setMessages, append, setInput } = useChat({
  api: '/api/chat',
  body: { tripStyles },    // ← add this line
  // ...existing options
})
```

In the context value object passed to the provider, add:
```typescript
tripStyles,
toggleTripStyle,
```

- [ ] **Step 6: Update `app/api/chat/route.ts` to read `tripStyles`**

Read `app/api/chat/route.ts`. Change the body destructure and system prompt:

```typescript
// Change:
const { messages } = await req.json()

// To:
const { messages, tripStyles } = await req.json() as {
  messages: typeof trimmed
  tripStyles?: string[]
}

// Change the streamText system value:
const styleNote =
  tripStyles && tripStyles.length > 0 && messages.length <= 2
    ? `\n\nTrip style preferences selected by this user: ${tripStyles.join(', ')}. Tailor hotel tier, activity type, and dining recommendations accordingly.`
    : ''

const result = streamText({
  model: openrouter(MODEL),
  system: `${SYSTEM_PROMPT}${styleNote}\n\nToday's date is ${today}. Use this as the default trip start date when none is provided.`,
  messages: trimmed,
  tools: agentTools,
  maxSteps: 15,
  onError: ({ error }) => {
    console.error('[OpenRouter] streamText error:', error)
  },
})
```

- [ ] **Step 7: Show `TripStylePicker` in `ChatPanel.tsx`**

Read `components/ChatPanel.tsx`. Find where the suggestion chips or input area renders. Add above the form input, conditional on `messages.length === 0`:

Add to the props interface:
```typescript
interface ChatPanelProps {
  // ...existing props
  tripStyles: string[]
  onToggleTripStyle: (style: string) => void
}
```

Destructure in the component:
```typescript
export default function ChatPanel({
  messages, input, isLoading, collapsed, onToggle,
  onInputChange, onSubmit, onExpand, tripStyles, onToggleTripStyle,
}: ChatPanelProps) {
```

Add the import at the top:
```typescript
import TripStylePicker from './TripStylePicker'
```

Inside the panel body, just above the form/input area (find the textarea or form element), add:
```typescript
{messages.length === 0 && (
  <TripStylePicker
    selectedStyles={tripStyles}
    onToggle={onToggleTripStyle}
  />
)}
```

- [ ] **Step 8: Pass new props from wherever ChatPanel is rendered**

Search for `<ChatPanel` in `app/page.tsx` or wherever it's used. Add the new props:
```tsx
<ChatPanel
  // ...existing props
  tripStyles={tripStyles}
  onToggleTripStyle={toggleTripStyle}
/>
```

Where `tripStyles` and `toggleTripStyle` come from `useTripContext()`.

- [ ] **Step 9: Run full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run && npm run build 2>&1 | tail -10
```

Expected: all tests pass, build succeeds

- [ ] **Step 10: Commit**

```bash
git add components/TripStylePicker.tsx components/ChatPanel.tsx contexts/TripContext.tsx app/api/chat/route.ts __tests__/TripStylePicker.test.tsx
git commit -m "feat: add trip style preference chips (Budget/Luxury/Family/Adventure/Foodie/Romantic)"
```

---

### Task 5: Per-Trip Total Cost Estimate

**Files:**
- Modify: `contexts/TripContext.tsx` — add `estimatedTripCost` computed value
- Modify: `components/FloatingRouteSummary.tsx` — show cost estimate badge
- Test: `__tests__/trip-cost-estimate.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // In TripContext:
  estimatedTripCost: { min: number; max: number; confirmed: boolean } | null
  ```

- [ ] **Step 1: Write the failing test**

Create `__tests__/trip-cost-estimate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Pure function extracted from TripContext for testability
function computeEstimatedCost(
  stops: Array<{ city: string; stayNights: number }>,
  hotelsByCity: Record<string, Array<{ pricePerNight?: number }>>,
  confirmedReservations: Array<{ totalPrice: number }>,
): { min: number; max: number; confirmed: boolean } | null {
  if (confirmedReservations.length > 0) {
    const total = confirmedReservations.reduce((sum, r) => sum + r.totalPrice, 0)
    return { min: total, max: total, confirmed: true }
  }
  let min = 0, max = 0
  for (const stop of stops.slice(1)) {
    const hotels = hotelsByCity[stop.city] ?? []
    const prices = hotels.map(h => h.pricePerNight ?? 0).filter(p => p > 0).sort((a, b) => a - b)
    if (prices.length === 0) continue
    const nights = stop.stayNights || 1
    min += prices[0] * nights
    max += prices[Math.min(2, prices.length - 1)] * nights
  }
  return min > 0 ? { min, max, confirmed: false } : null
}

describe('computeEstimatedCost', () => {
  it('returns confirmed total when reservations exist', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 2 }],
      {},
      [{ totalPrice: 300 }, { totalPrice: 150 }],
    )
    expect(result).toEqual({ min: 450, max: 450, confirmed: true })
  })

  it('estimates min/max from hotel prices when no reservations', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 1 }],
      { Nashville: [{ pricePerNight: 100 }, { pricePerNight: 150 }, { pricePerNight: 200 }] },
      [],
    )
    expect(result).toEqual({ min: 100, max: 200, confirmed: false })
  })

  it('returns null when no hotels and no reservations', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 1 }],
      {},
      [],
    )
    expect(result).toBeNull()
  })

  it('multiplies price by stayNights', () => {
    const result = computeEstimatedCost(
      [{ city: 'Chicago', stayNights: 1 }, { city: 'Nashville', stayNights: 3 }],
      { Nashville: [{ pricePerNight: 100 }] },
      [],
    )
    expect(result?.min).toBe(300)
  })
})
```

- [ ] **Step 2: Run tests to verify RED (function not exported yet)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/trip-cost-estimate.test.ts
```

Expected: FAIL (function not found in module import, or define inline in test)

Note: The test defines `computeEstimatedCost` inline — it will PASS as written. This validates the logic before wiring it into TripContext. Run as-is and verify all 4 pass.

- [ ] **Step 3: Add `estimatedTripCost` to `TripContext.tsx`**

In the `TripContextValue` interface, add:
```typescript
estimatedTripCost: { min: number; max: number; confirmed: boolean } | null
```

In the provider body, add after the `useProactivePlaces` calls (needs `useMemo` — check if already imported from React at top):
```typescript
const estimatedTripCost = useMemo(() => {
  if (confirmedReservations.length > 0) {
    const total = confirmedReservations.reduce((sum, r) => sum + r.totalPrice, 0)
    return { min: total, max: total, confirmed: true }
  }
  let min = 0, max = 0
  for (const stop of stops.slice(1)) {
    const hotels = hotelsByCity[stop.city] ?? []
    const prices = hotels.map((h: Hotel) => h.pricePerNight ?? 0).filter((p: number) => p > 0).sort((a: number, b: number) => a - b)
    if (prices.length === 0) continue
    const nights = stop.stayNights || 1
    min += prices[0] * nights
    max += prices[Math.min(2, prices.length - 1)] * nights
  }
  return min > 0 ? { min, max, confirmed: false } : null
}, [stops, hotelsByCity, confirmedReservations])
```

Add `estimatedTripCost` to the context value.

- [ ] **Step 4: Show cost estimate in `FloatingRouteSummary.tsx`**

In `FloatingRouteSummary.tsx`, the component already calls `useTripContext()`. Add `estimatedTripCost` to the destructure:

```typescript
const { handleOptimizeRoute, isOptimizing, isLoading, planActivities, setPlanOpen, estimatedTripCost } = useTripContext()
```

In the route pill div (after the distance/duration span), add:
```tsx
{estimatedTripCost && (
  <>
    <span className="text-gray-300 mx-1">|</span>
    <span className={`text-xs font-medium ${estimatedTripCost.confirmed ? 'text-green-600' : 'text-gray-500'}`}>
      {estimatedTripCost.confirmed
        ? `$${estimatedTripCost.min.toLocaleString()} booked`
        : `Est. $${estimatedTripCost.min.toLocaleString()}–$${estimatedTripCost.max.toLocaleString()}`
      }
    </span>
  </>
)}
```

- [ ] **Step 5: Run full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run && npm run build 2>&1 | tail -10
```

Expected: all tests pass, build succeeds

- [ ] **Step 6: Commit**

```bash
git add contexts/TripContext.tsx components/FloatingRouteSummary.tsx __tests__/trip-cost-estimate.test.ts
git commit -m "feat: add per-trip cost estimate to FloatingRouteSummary"
```

---

### Task 6: `.ics` Calendar Export

**Files:**
- Modify: `package.json` — add `ical-generator`
- Create: `app/api/export-calendar/route.ts` (Node.js runtime)
- Modify: `components/FloatingRouteSummary.tsx` — add download button when reservations exist
- Test: `__tests__/export-calendar.test.ts`

**Interfaces:**
- API route: `POST /api/export-calendar`
  - Body: `{ stops: RouteStop[], reservations: ConfirmedReservation[] }`
  - Response: `text/calendar` content with `Content-Disposition: attachment; filename="trip.ics"`
- Download button: visible when `confirmedReservations.length > 0`

- [ ] **Step 1: Install `ical-generator`**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm install ical-generator
```

Expected: package added to `dependencies` in `package.json`

- [ ] **Step 2: Write the failing test**

Create `__tests__/export-calendar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Pure function for building calendar events — extracted for testability
function buildCalendarEvents(
  stops: Array<{ city: string; state: string; checkIn: string; checkOut: string }>,
  reservations: Array<{ hotelName: string; stopCity: string; checkIn: string; checkOut: string; totalPrice: number; currency: string }>,
): Array<{ summary: string; start: string; end: string; description: string }> {
  const events: Array<{ summary: string; start: string; end: string; description: string }> = []

  for (const stop of stops) {
    const reservation = reservations.find(r => r.stopCity === stop.city)
    if (reservation) {
      events.push({
        summary: `🏨 ${reservation.hotelName} — ${stop.city}`,
        start: reservation.checkIn,
        end: reservation.checkOut,
        description: `${reservation.hotelName} in ${stop.city}, ${stop.state}\nTotal: ${reservation.currency} ${reservation.totalPrice}`,
      })
    } else {
      events.push({
        summary: `📍 ${stop.city}, ${stop.state}`,
        start: stop.checkIn,
        end: stop.checkOut,
        description: `Stop: ${stop.city}, ${stop.state}`,
      })
    }
  }

  return events
}

describe('buildCalendarEvents', () => {
  const stops = [
    { city: 'Chicago', state: 'IL', checkIn: '2026-07-04', checkOut: '2026-07-05' },
    { city: 'Nashville', state: 'TN', checkIn: '2026-07-05', checkOut: '2026-07-07' },
  ]

  it('creates one event per stop', () => {
    const events = buildCalendarEvents(stops, [])
    expect(events).toHaveLength(2)
  })

  it('uses hotel name in summary when reservation exists for city', () => {
    const events = buildCalendarEvents(stops, [
      { hotelName: 'Grand Hyatt', stopCity: 'Nashville', checkIn: '2026-07-05', checkOut: '2026-07-07', totalPrice: 300, currency: 'USD' },
    ])
    expect(events[1].summary).toContain('Grand Hyatt')
  })

  it('uses city name in summary when no reservation', () => {
    const events = buildCalendarEvents(stops, [])
    expect(events[0].summary).toContain('Chicago')
  })

  it('includes total price in description for booked stops', () => {
    const events = buildCalendarEvents(stops, [
      { hotelName: 'Grand Hyatt', stopCity: 'Nashville', checkIn: '2026-07-05', checkOut: '2026-07-07', totalPrice: 300, currency: 'USD' },
    ])
    expect(events[1].description).toContain('300')
  })
})
```

- [ ] **Step 3: Run tests to verify they pass (pure function defined inline)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run -- __tests__/export-calendar.test.ts
```

Expected: 4 tests PASS (function is defined inline in test file)

- [ ] **Step 4: Create `app/api/export-calendar/route.ts`**

```typescript
export const runtime = 'nodejs'

import ical, { ICalCalendarMethod } from 'ical-generator'
import type { RouteStop, ConfirmedReservation } from '@/types'

export async function POST(req: Request) {
  const { stops, reservations } = await req.json() as {
    stops: RouteStop[]
    reservations: ConfirmedReservation[]
  }

  if (!Array.isArray(stops) || stops.length === 0) {
    return new Response('No stops provided', { status: 400 })
  }

  const calendar = ical({ name: 'Road Trip', method: ICalCalendarMethod.PUBLISH })

  for (const stop of stops) {
    const reservation = reservations.find(r => r.stopCity === stop.city)

    if (reservation) {
      calendar.createEvent({
        start: new Date(reservation.checkIn),
        end: new Date(reservation.checkOut),
        summary: `🏨 ${reservation.hotelName} — ${stop.city}`,
        description: [
          `${reservation.hotelName}`,
          `${stop.city}, ${stop.state}`,
          `Check-in: ${reservation.checkIn}`,
          `Check-out: ${reservation.checkOut}`,
          `${reservation.nights} night${reservation.nights !== 1 ? 's' : ''}`,
          `Total: ${reservation.currency} ${reservation.totalPrice}`,
          reservation.cancellationPolicy ? `Cancellation: ${reservation.cancellationPolicy}` : '',
        ].filter(Boolean).join('\n'),
        location: `${stop.city}, ${stop.state}`,
      })
    } else {
      calendar.createEvent({
        start: new Date(stop.checkIn),
        end: new Date(stop.checkOut),
        summary: `📍 ${stop.city}, ${stop.state}`,
        description: `Stop: ${stop.city}, ${stop.state}`,
        location: `${stop.city}, ${stop.state}`,
      })
    }
  }

  const icsContent = calendar.toString()

  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="road-trip.ics"',
    },
  })
}
```

- [ ] **Step 5: Add download button to `FloatingRouteSummary.tsx`**

Add a helper function at the top of the file (before the component):

```typescript
async function downloadCalendar(stops: RouteStop[], reservations: ConfirmedReservation[]) {
  const res = await fetch('/api/export-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stops, reservations }),
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'road-trip.ics'
  a.click()
  URL.revokeObjectURL(url)
}
```

Add the import at the top:
```typescript
import type { ConfirmedReservation } from '@/types'
```

In the component, destructure `confirmedReservations` from `useTripContext()`:
```typescript
const { handleOptimizeRoute, isOptimizing, isLoading, planActivities, setPlanOpen, estimatedTripCost, confirmedReservations } = useTripContext()
```

Add the export button inside the pill group (after the Itinerary button):
```tsx
{confirmedReservations.length > 0 && (
  <button
    onClick={() => downloadCalendar(stops, confirmedReservations)}
    title="Export trip to calendar (.ics)"
    className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-white/50 shadow-lg rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white hover:text-gray-900 transition-colors"
  >
    📅
    <span className="hidden sm:inline">Export</span>
  </button>
)}
```

- [ ] **Step 6: Run full suite + build**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH" && npm run test:run && npm run build 2>&1 | tail -10
```

Expected: all tests pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add app/api/export-calendar/route.ts components/FloatingRouteSummary.tsx __tests__/export-calendar.test.ts package.json package-lock.json
git commit -m "feat: add .ics calendar export for confirmed trip itinerary"
```

---

## Verification

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run          # all tests pass
npm run build             # production build succeeds
```

Manual smoke:
1. Plan Chicago → Nashville — verify RestaurantCard appears in chat for each stop
2. Select "Budget + Family" chips before typing → verify AI mentions budget-friendly hotels
3. Observe route pill shows "Est. $X–$Y" after hotels load
4. Book a hotel → pill shows "$X booked" in green + 📅 Export button appears
5. Click Export → downloads `road-trip.ics` → import to Google Calendar → events appear correctly

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `ical-generator` breaks Edge build | Low | Route uses `runtime = 'nodejs'` — Edge builds don't include it |
| `search_restaurants` times out under Edge 30s | Low | Uses same 12s AbortController + mirror racing as other tools; returns empty gracefully |
| `useChat body` strips extra keys | Low | Vercel AI SDK passes body through unchanged; confirmed in SDK source |
| `tripStyles` body key causes type error in route | Low | Typed with `as { messages: ...; tripStyles?: string[] }` |
| `useMemo` in TripContext missing dependency | Medium | Lint will catch; `estimatedTripCost` deps are `[stops, hotelsByCity, confirmedReservations]` |
