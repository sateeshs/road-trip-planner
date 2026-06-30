# Generative UI — Chat Rich Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render rich React UI components inline in the chat window for every AI tool result, and add a `render_ui` tool so the AI can explicitly request a visual summary card.

**Architecture:** Two rendering paths added to `ChatPanel` and `ChatModal`: (A) auto-render a card for each completed tool invocation in `messages[].parts`; (B) a new `render_ui` tool that lets the AI explicitly pick a component. Both paths use a single `ChatToolResultRenderer` dispatcher. No backend streaming changes — the Edge route and `useChat` pipeline are untouched.

**Tech Stack:** Next.js 15.5, React 19, TypeScript, Tailwind CSS v4, Vercel AI SDK 4.x (`useChat`), Vitest + @testing-library/react (added here), Zod.

## Global Constraints

- Tool results in AI SDK 4.x come through as `parts[{ type: 'tool-invocation', toolInvocation: { state: 'result', ... } }]` — NOT `type: 'tool-result'`
- All map state (stops, hotels, attractions) continues via `TripContext` unchanged — chat UI is additive only
- Edge runtime stays `streamText` — no RSC / `streamUI` migration
- Tailwind CSS v4 syntax (no `@apply`, use utility classes directly)
- Files max 400 lines; components max 50-line render functions
- `'use client'` directive at line 1 for all new components

---

## File Map

### New files
```
components/chat-ui/
  ChatToolResultRenderer.tsx   — dispatcher: iterates parts, picks card per toolName
  RouteSummaryCard.tsx         — suggest_route_stops result → stop list with times/distances
  HotelResultsCard.tsx         — search_hotels result → top 3 hotels per city
  AttractionGridCard.tsx       — search_attractions result → 2-col attraction grid
  SurroundingsCard.tsx         — explore_surroundings result → grouped activity chips
  DynamicUICard.tsx            — render_ui result → dispatches to sub-renderers

__tests__/chat-ui/
  ChatToolResultRenderer.test.tsx
  RouteSummaryCard.test.tsx
  HotelResultsCard.test.tsx
  AttractionGridCard.test.tsx
  SurroundingsCard.test.tsx
  DynamicUICard.test.tsx

vitest.config.ts               — new test config
vitest.setup.ts                — @testing-library/jest-dom setup
```

### Modified files
```
components/ChatPanel.tsx       — add ChatToolResultRenderer in message render loop
components/ChatModal.tsx       — add ChatToolResultRenderer in visibleMessages filter + render
lib/claude-tools.ts            — add render_ui tool + SYSTEM_PROMPT addition
package.json                   — add vitest, @testing-library/react, @testing-library/jest-dom, jsdom
```

---

## Task 1: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (add devDependencies + scripts)

**Interfaces:**
- Produces: `npm test` runs Vitest in watch mode; `npm run test:run` runs once

- [ ] **Step 1: Install test dependencies**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages added to `node_modules`, `package.json` devDependencies updated.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test scripts to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Verify setup works**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run
```

Expected: `No test files found` or passes (0 test files is fine here).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "chore: add Vitest + Testing Library test infrastructure"
```

---

## Task 2: Shared Types for Tool Result Parts

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `ToolInvocationPart`, `ToolResultOf<T>` — used by all card components and `ChatToolResultRenderer`

- [ ] **Step 1: Write failing test**

Create `__tests__/chat-ui/types.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — expect failure**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/types.test.ts
```

Expected: FAIL — `ToolInvocationPart` not exported from `@/types`.

- [ ] **Step 3: Add types to `types/index.ts`**

Append to `types/index.ts`:

```typescript
// ─── AI SDK tool-invocation part types ─────────────────────────────────────

export interface ToolInvocationPart {
  type: 'tool-invocation'
  toolInvocation: {
    toolName: string
    toolCallId: string
    state: 'call' | 'partial-call' | 'result'
    result?: unknown
    args?: unknown
  }
}

// Return shapes from each AI tool — used by chat-ui card components

export interface SuggestRouteStopsResult {
  stops: RouteStop[]
  routeGeometry: RouteGeometry | null
  totalDistance: string | null
  totalDuration: string | null
  message: string
}

export interface SearchAttractionsResult {
  attractions: Attraction[]
  city: string
}

export interface SearchHotelsResult {
  hotels: Hotel[]
  city: string
  checkIn: string
  checkOut: string
}

export interface SearchSurroundingsResult {
  surroundings: Attraction[]
  city: string
  activities: string[]
}

export interface RenderUiResult {
  component: 'route_summary' | 'hotel_comparison' | 'day_plan' | 'booking_confirmed' | 'trip_stats'
  title: string
  data: Record<string, unknown>
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add types/index.ts __tests__/chat-ui/types.test.ts
git commit -m "feat: add tool-invocation part types for generative UI"
```

---

## Task 3: ChatToolResultRenderer — Dispatcher Component

**Files:**
- Create: `components/chat-ui/ChatToolResultRenderer.tsx`
- Create: `__tests__/chat-ui/ChatToolResultRenderer.test.tsx`

**Interfaces:**
- Consumes: `ToolInvocationPart` from `@/types`
- Produces: `<ChatToolResultRenderer part={...} />` — renders the correct card or null

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/ChatToolResultRenderer.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import ChatToolResultRenderer from '@/components/chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'

function makePart(toolName: string, result: unknown): ToolInvocationPart {
  return {
    type: 'tool-invocation',
    toolInvocation: { toolName, toolCallId: 'id-1', state: 'result', result },
  }
}

describe('ChatToolResultRenderer', () => {
  it('renders nothing for in-progress tool calls (state=call)', () => {
    const part: ToolInvocationPart = {
      type: 'tool-invocation',
      toolInvocation: { toolName: 'search_hotels', toolCallId: 'id-1', state: 'call' },
    }
    const { container } = render(<ChatToolResultRenderer part={part} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for unknown tool names', () => {
    const part = makePart('unknown_tool', {})
    const { container } = render(<ChatToolResultRenderer part={part} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a card for search_hotels with valid result', () => {
    const part = makePart('search_hotels', { hotels: [], city: 'Chicago', checkIn: '2026-07-01', checkOut: '2026-07-02' })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })

  it('renders a card for search_attractions with valid result', () => {
    const part = makePart('search_attractions', { attractions: [], city: 'Nashville' })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Nashville/i)).toBeInTheDocument()
  })

  it('renders a card for suggest_route_stops with valid result', () => {
    const part = makePart('suggest_route_stops', {
      stops: [
        { city: 'Chicago', state: 'IL', coordinates: { lat: 41.8, lng: -87.6 }, stayNights: 0, checkIn: '', checkOut: '' },
        { city: 'Nashville', state: 'TN', coordinates: { lat: 36.1, lng: -86.7 }, stayNights: 1, checkIn: '', checkOut: '' },
      ],
      totalDistance: '476 miles', totalDuration: '7h 10m', routeGeometry: null, message: '',
    })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })

  it('renders a card for explore_surroundings with valid result', () => {
    const part = makePart('explore_surroundings', { surroundings: [], city: 'Pigeon Forge', activities: [] })
    render(<ChatToolResultRenderer part={part} />)
    expect(screen.getByText(/Pigeon Forge/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/ChatToolResultRenderer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/chat-ui/ChatToolResultRenderer.tsx`**

```typescript
'use client'

import type { ToolInvocationPart } from '@/types'
import RouteSummaryCard from './RouteSummaryCard'
import HotelResultsCard from './HotelResultsCard'
import AttractionGridCard from './AttractionGridCard'
import SurroundingsCard from './SurroundingsCard'
import DynamicUICard from './DynamicUICard'

interface Props {
  part: ToolInvocationPart
}

export default function ChatToolResultRenderer({ part }: Props) {
  const { toolInvocation } = part
  if (toolInvocation.state !== 'result') return null

  const result = toolInvocation.result

  switch (toolInvocation.toolName) {
    case 'suggest_route_stops':
      return <RouteSummaryCard result={result as import('@/types').SuggestRouteStopsResult} />

    case 'search_hotels':
      return <HotelResultsCard result={result as import('@/types').SearchHotelsResult} />

    case 'search_attractions':
      return <AttractionGridCard result={result as import('@/types').SearchAttractionsResult} />

    case 'explore_surroundings':
      return <SurroundingsCard result={result as import('@/types').SearchSurroundingsResult} />

    case 'render_ui':
      return <DynamicUICard result={result as import('@/types').RenderUiResult} />

    default:
      return null
  }
}
```

- [ ] **Step 4: Create stub files so imports resolve** (other card components — full implementations come in later tasks)

Create `components/chat-ui/RouteSummaryCard.tsx`:
```typescript
'use client'
import type { SuggestRouteStopsResult } from '@/types'
export default function RouteSummaryCard({ result }: { result: SuggestRouteStopsResult }) {
  return <div data-testid="route-summary">{result.stops.map(s => <span key={s.city}>{s.city}</span>)}</div>
}
```

Create `components/chat-ui/HotelResultsCard.tsx`:
```typescript
'use client'
import type { SearchHotelsResult } from '@/types'
export default function HotelResultsCard({ result }: { result: SearchHotelsResult }) {
  return <div data-testid="hotel-results">{result.city}</div>
}
```

Create `components/chat-ui/AttractionGridCard.tsx`:
```typescript
'use client'
import type { SearchAttractionsResult } from '@/types'
export default function AttractionGridCard({ result }: { result: SearchAttractionsResult }) {
  return <div data-testid="attraction-grid">{result.city}</div>
}
```

Create `components/chat-ui/SurroundingsCard.tsx`:
```typescript
'use client'
import type { SearchSurroundingsResult } from '@/types'
export default function SurroundingsCard({ result }: { result: SearchSurroundingsResult }) {
  return <div data-testid="surroundings">{result.city}</div>
}
```

Create `components/chat-ui/DynamicUICard.tsx`:
```typescript
'use client'
import type { RenderUiResult } from '@/types'
export default function DynamicUICard({ result }: { result: RenderUiResult }) {
  return <div data-testid="dynamic-ui">{result.title}</div>
}
```

- [ ] **Step 5: Run — expect pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/ChatToolResultRenderer.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/chat-ui/ __tests__/chat-ui/ChatToolResultRenderer.test.tsx
git commit -m "feat: add ChatToolResultRenderer dispatcher with stub cards"
```

---

## Task 4: RouteSummaryCard

**Files:**
- Modify: `components/chat-ui/RouteSummaryCard.tsx` (replace stub)
- Create: `__tests__/chat-ui/RouteSummaryCard.test.tsx`

**Interfaces:**
- Consumes: `SuggestRouteStopsResult` from `@/types`
- Produces: Card showing stop list, per-leg drive time/distance/highway, total trip stats

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/RouteSummaryCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import RouteSummaryCard from '@/components/chat-ui/RouteSummaryCard'
import type { SuggestRouteStopsResult } from '@/types'

const baseResult: SuggestRouteStopsResult = {
  stops: [
    { city: 'Chicago', state: 'IL', coordinates: { lat: 41.8, lng: -87.6 }, stayNights: 0, checkIn: '2026-07-01', checkOut: '2026-07-01', driveTimeFromPrevious: undefined, driveDistanceFromPrevious: undefined, roadName: undefined, hasToll: false },
    { city: 'Indianapolis', state: 'IN', coordinates: { lat: 39.7, lng: -86.1 }, stayNights: 1, checkIn: '2026-07-01', checkOut: '2026-07-02', driveTimeFromPrevious: '2h 50m', driveDistanceFromPrevious: '182 miles', roadName: 'I-65 S', hasToll: false },
    { city: 'Nashville', state: 'TN', coordinates: { lat: 36.1, lng: -86.7 }, stayNights: 2, checkIn: '2026-07-02', checkOut: '2026-07-04', driveTimeFromPrevious: '3h 10m', driveDistanceFromPrevious: '186 miles', roadName: 'I-65 S', hasToll: true },
  ],
  routeGeometry: null,
  totalDistance: '368 miles',
  totalDuration: '6h 0m',
  message: '',
}

describe('RouteSummaryCard', () => {
  it('renders all stop city names', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
    expect(screen.getByText(/Indianapolis/i)).toBeInTheDocument()
    expect(screen.getByText(/Nashville/i)).toBeInTheDocument()
  })

  it('shows drive time and distance for legs that have them', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/2h 50m/)).toBeInTheDocument()
    expect(screen.getByText(/182 miles/)).toBeInTheDocument()
  })

  it('shows toll warning for toll legs', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/toll/i)).toBeInTheDocument()
  })

  it('shows total distance and duration', () => {
    render(<RouteSummaryCard result={baseResult} />)
    expect(screen.getByText(/368 miles/)).toBeInTheDocument()
    expect(screen.getByText(/6h 0m/)).toBeInTheDocument()
  })

  it('renders gracefully with a single stop', () => {
    const result: SuggestRouteStopsResult = {
      ...baseResult,
      stops: [baseResult.stops[0]],
      totalDistance: null,
      totalDuration: null,
    }
    render(<RouteSummaryCard result={result} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/RouteSummaryCard.test.tsx
```

Expected: FAIL — stub renders only city names, missing drive time/toll tests.

- [ ] **Step 3: Implement `RouteSummaryCard.tsx`**

```typescript
'use client'

import type { SuggestRouteStopsResult } from '@/types'

interface Props {
  result: SuggestRouteStopsResult
}

const STOP_ICONS = ['🚗', '📍', '📍', '📍', '📍', '🏁']

export default function RouteSummaryCard({ result }: Props) {
  const { stops, totalDistance, totalDuration } = result

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🗺️</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Route Summary</span>
      </div>

      <div className="px-4 py-3 space-y-0">
        {stops.map((stop, idx) => (
          <div key={stop.city}>
            {/* Leg info (drive time from previous) */}
            {idx > 0 && (stop.driveTimeFromPrevious || stop.driveDistanceFromPrevious) && (
              <div className="flex items-center gap-2 py-1.5 pl-3.5">
                <div className="w-px h-4 bg-blue-200 ml-1" />
                <span className="text-[11px] text-gray-500">
                  {[stop.driveTimeFromPrevious, stop.driveDistanceFromPrevious].filter(Boolean).join(' · ')}
                  {stop.roadName && (
                    <span className="ml-1.5 text-blue-600 font-medium">via {stop.roadName}</span>
                  )}
                </span>
                {stop.hasToll && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">
                    toll
                  </span>
                )}
              </div>
            )}

            {/* Stop row */}
            <div className="flex items-center gap-2.5 py-1">
              <span className="text-base w-6 text-center flex-none">
                {idx === 0 ? '🚗' : idx === stops.length - 1 ? '🏁' : `${idx}`}
              </span>
              <div>
                <span className="text-sm font-semibold text-gray-900">{stop.city}</span>
                <span className="text-xs text-gray-400 ml-1">{stop.state}</span>
                {stop.stayNights > 0 && (
                  <span className="text-[11px] text-gray-400 ml-2">
                    {stop.stayNights} night{stop.stayNights !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(totalDistance || totalDuration) && (
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 bg-gray-50/60">
          <span className="text-[11px] text-gray-500 font-medium">Total</span>
          {totalDistance && <span className="text-xs text-gray-700 font-semibold">{totalDistance}</span>}
          {totalDuration && <span className="text-xs text-gray-700 font-semibold">{totalDuration}</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect all pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/RouteSummaryCard.test.tsx
```

Expected: All 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/chat-ui/RouteSummaryCard.tsx __tests__/chat-ui/RouteSummaryCard.test.tsx
git commit -m "feat: add RouteSummaryCard for suggest_route_stops results"
```

---

## Task 5: HotelResultsCard

**Files:**
- Modify: `components/chat-ui/HotelResultsCard.tsx` (replace stub)
- Create: `__tests__/chat-ui/HotelResultsCard.test.tsx`

**Interfaces:**
- Consumes: `SearchHotelsResult` from `@/types`
- Produces: Card with top 3 hotels, star rating, price, amenity tags

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/HotelResultsCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import HotelResultsCard from '@/components/chat-ui/HotelResultsCard'
import type { SearchHotelsResult } from '@/types'

const hotels = [
  { hotelId: 'h1', name: 'Grand Hyatt', starRating: 4, pricePerNight: 189, currency: 'USD', amenities: ['wifi', 'pool', 'parking'], address: '123 Main St', coordinates: { lat: 41.8, lng: -87.6 } },
  { hotelId: 'h2', name: 'Budget Inn', starRating: 2, pricePerNight: 65, currency: 'USD', amenities: ['wifi'], address: '456 Oak Ave', coordinates: { lat: 41.82, lng: -87.62 } },
  { hotelId: 'h3', name: 'The Marriott', starRating: 3, pricePerNight: 130, currency: 'USD', amenities: ['wifi', 'gym'], address: '789 Park Blvd', coordinates: { lat: 41.81, lng: -87.61 } },
  { hotelId: 'h4', name: 'Ritz Carlton', starRating: 5, pricePerNight: 420, currency: 'USD', amenities: ['spa', 'pool', 'concierge'], address: '1 Luxury Dr', coordinates: { lat: 41.79, lng: -87.59 } },
]

const result: SearchHotelsResult = {
  hotels,
  city: 'Chicago',
  checkIn: '2026-07-01',
  checkOut: '2026-07-02',
}

describe('HotelResultsCard', () => {
  it('shows city name in header', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument()
  })

  it('shows at most 3 hotels', () => {
    render(<HotelResultsCard result={result} />)
    // 4 hotels provided, only 3 should appear
    expect(screen.queryByText('Ritz Carlton')).not.toBeInTheDocument()
    expect(screen.getByText('Grand Hyatt')).toBeInTheDocument()
  })

  it('shows price per night', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getByText(/\$65/)).toBeInTheDocument()
  })

  it('shows empty state when no hotels', () => {
    render(<HotelResultsCard result={{ ...result, hotels: [] }} />)
    expect(screen.getByText(/No hotels found/i)).toBeInTheDocument()
  })

  it('shows amenity tags', () => {
    render(<HotelResultsCard result={result} />)
    expect(screen.getByText(/wifi/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/HotelResultsCard.test.tsx
```

Expected: FAIL — stub doesn't render hotels list.

- [ ] **Step 3: Implement `HotelResultsCard.tsx`**

```typescript
'use client'

import type { SearchHotelsResult, Hotel } from '@/types'

interface Props {
  result: SearchHotelsResult
}

function StarRating({ stars }: { stars?: number }) {
  const filled = Math.round(stars ?? 0)
  return (
    <span className="text-amber-400 text-xs" aria-label={`${filled} stars`}>
      {'★'.repeat(filled)}{'☆'.repeat(Math.max(0, 5 - filled))}
    </span>
  )
}

function HotelRow({ hotel }: { hotel: Hotel }) {
  const topAmenities = (hotel.amenities ?? []).slice(0, 3)
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{hotel.name}</p>
          <StarRating stars={hotel.starRating} />
        </div>
        {hotel.pricePerNight && (
          <div className="text-right flex-none">
            <p className="text-sm font-bold text-gray-900">${hotel.pricePerNight}</p>
            <p className="text-[10px] text-gray-400">per night</p>
          </div>
        )}
      </div>
      {topAmenities.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {topAmenities.map(a => (
            <span key={a} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full capitalize">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HotelResultsCard({ result }: Props) {
  const { hotels, city } = result
  const topHotels = [...hotels].sort((a, b) => (a.pricePerNight ?? 999) - (b.pricePerNight ?? 999)).slice(0, 3)

  return (
    <div className="bg-white border border-green-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-green-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🏨</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Hotels · {city}</span>
      </div>

      <div className="px-4">
        {topHotels.length === 0 ? (
          <p className="py-4 text-sm text-gray-400 text-center">No hotels found near {city}</p>
        ) : (
          topHotels.map(h => <HotelRow key={h.hotelId} hotel={h} />)
        )}
      </div>

      {topHotels.length > 0 && (
        <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">Click a stop on the map to book · Prices per night</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect all pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/HotelResultsCard.test.tsx
```

Expected: All 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/chat-ui/HotelResultsCard.tsx __tests__/chat-ui/HotelResultsCard.test.tsx
git commit -m "feat: add HotelResultsCard for search_hotels results"
```

---

## Task 6: AttractionGridCard

**Files:**
- Modify: `components/chat-ui/AttractionGridCard.tsx` (replace stub)
- Create: `__tests__/chat-ui/AttractionGridCard.test.tsx`

**Interfaces:**
- Consumes: `SearchAttractionsResult` from `@/types`
- Produces: 2-column grid of up to 6 attractions with category emoji and name

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/AttractionGridCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import AttractionGridCard from '@/components/chat-ui/AttractionGridCard'
import type { SearchAttractionsResult } from '@/types'

function makeAttractions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    name: `Attraction ${i + 1}`,
    category: i % 2 === 0 ? 'Museum' : 'Park',
    address: `${i} Main St`,
    coordinates: { lat: 36.1 + i * 0.01, lng: -86.7 + i * 0.01 },
  }))
}

describe('AttractionGridCard', () => {
  it('shows city name', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(3), city: 'Nashville' }} />)
    expect(screen.getByText(/Nashville/i)).toBeInTheDocument()
  })

  it('renders up to 6 attractions', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(10), city: 'Nashville' }} />)
    expect(screen.getByText('Attraction 6')).toBeInTheDocument()
    expect(screen.queryByText('Attraction 7')).not.toBeInTheDocument()
  })

  it('renders all when fewer than 6', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(4), city: 'Nashville' }} />)
    expect(screen.getByText('Attraction 4')).toBeInTheDocument()
  })

  it('shows empty state when no attractions', () => {
    render(<AttractionGridCard result={{ attractions: [], city: 'Nashville' }} />)
    expect(screen.getByText(/No attractions found/i)).toBeInTheDocument()
  })

  it('shows category labels', () => {
    render(<AttractionGridCard result={{ attractions: makeAttractions(2), city: 'Nashville' }} />)
    expect(screen.getByText('Museum')).toBeInTheDocument()
    expect(screen.getByText('Park')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/AttractionGridCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `AttractionGridCard.tsx`**

```typescript
'use client'

import type { SearchAttractionsResult, Attraction } from '@/types'

interface Props {
  result: SearchAttractionsResult
}

const CATEGORY_EMOJI: Record<string, string> = {
  museum: '🏛️', 'art gallery': '🖼️', park: '🌳', viewpoint: '👁️',
  'scenic viewpoint': '👁️', zoo: '🦁', aquarium: '🐠', 'theme park': '🎢',
  waterfall: '💧', beach: '🏖️', 'mountain peak': '⛰️', monument: '🗿',
  memorial: '🕊️', castle: '🏰', theatre: '🎭', cinema: '🎬',
  'nature reserve': '🌿', garden: '🌸',
}

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '🎯'
}

function AttractionTile({ attraction }: { attraction: Attraction }) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-amber-50/50 rounded-xl border border-amber-100/70">
      <span className="text-xl flex-none">{categoryEmoji(attraction.category)}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{attraction.name}</p>
        <p className="text-[10px] text-amber-600 mt-0.5">{attraction.category}</p>
      </div>
    </div>
  )
}

export default function AttractionGridCard({ result }: Props) {
  const { attractions, city } = result
  const displayed = attractions.slice(0, 6)

  return (
    <div className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-amber-500 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🎯</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Attractions · {city}</span>
      </div>

      <div className="p-3">
        {displayed.length === 0 ? (
          <p className="py-3 text-sm text-gray-400 text-center">No attractions found near {city}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayed.map(a => <AttractionTile key={a.id} attraction={a} />)}
          </div>
        )}
      </div>

      {attractions.length > 6 && (
        <div className="px-4 py-2 border-t border-amber-50 bg-amber-50/40">
          <p className="text-[10px] text-amber-600">+{attractions.length - 6} more · click a stop on the map</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect all pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/AttractionGridCard.test.tsx
```

Expected: All 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/chat-ui/AttractionGridCard.tsx __tests__/chat-ui/AttractionGridCard.test.tsx
git commit -m "feat: add AttractionGridCard for search_attractions results"
```

---

## Task 7: SurroundingsCard

**Files:**
- Modify: `components/chat-ui/SurroundingsCard.tsx` (replace stub)
- Create: `__tests__/chat-ui/SurroundingsCard.test.tsx`

**Interfaces:**
- Consumes: `SearchSurroundingsResult` from `@/types`
- Produces: Activity chips grouped by Water / Land / Other; collapse/expand toggle above 8 items

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/SurroundingsCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import SurroundingsCard from '@/components/chat-ui/SurroundingsCard'
import type { SearchSurroundingsResult } from '@/types'

function makeSurroundings(categories: string[]) {
  return categories.map((category, i) => ({
    id: `s${i}`, name: `Activity ${i + 1}`, category,
    address: '', coordinates: { lat: 36.1, lng: -86.7 },
  }))
}

const waterActivities = makeSurroundings(['Kayaking', 'Boat Tour / Cruise', 'Rafting'])
const landActivities  = makeSurroundings(['Hiking / Scenic', 'Rock Climbing', 'Zip Line'])

describe('SurroundingsCard', () => {
  it('shows city name', () => {
    render(<SurroundingsCard result={{ surroundings: waterActivities, city: 'Gatlinburg', activities: [] }} />)
    expect(screen.getByText(/Gatlinburg/i)).toBeInTheDocument()
  })

  it('renders Water group for water activities', () => {
    render(<SurroundingsCard result={{ surroundings: waterActivities, city: 'Gatlinburg', activities: [] }} />)
    expect(screen.getByText('💧 Water')).toBeInTheDocument()
  })

  it('renders Land group for land activities', () => {
    render(<SurroundingsCard result={{ surroundings: landActivities, city: 'Gatlinburg', activities: [] }} />)
    expect(screen.getByText('🥾 Land')).toBeInTheDocument()
  })

  it('shows empty state when no surroundings', () => {
    render(<SurroundingsCard result={{ surroundings: [], city: 'Gatlinburg', activities: [] }} />)
    expect(screen.getByText(/No outdoor activities/i)).toBeInTheDocument()
  })

  it('shows show-all toggle when more than 8 activities', () => {
    const many = makeSurroundings(Array(10).fill('Hiking / Scenic'))
    render(<SurroundingsCard result={{ surroundings: many, city: 'Gatlinburg', activities: [] }} />)
    expect(screen.getByText(/Show all/i)).toBeInTheDocument()
  })

  it('expands all activities when show-all is clicked', () => {
    const many = makeSurroundings(Array(10).fill('Hiking / Scenic'))
    render(<SurroundingsCard result={{ surroundings: many, city: 'Gatlinburg', activities: [] }} />)
    fireEvent.click(screen.getByText(/Show all/i))
    expect(screen.getByText(/Show less/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/SurroundingsCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `SurroundingsCard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { SearchSurroundingsResult, Attraction } from '@/types'

interface Props {
  result: SearchSurroundingsResult
}

const WATER_KEYWORDS = /kayak|canoe|paddle|boat|cruise|sail|raft|swim|water|fishing|marina/i
const LAND_KEYWORDS  = /hike|hiking|trail|climb|zip|scenic|horse|atv|cycle|camp|ski|nature|park|waterfall|peak|cave/i

function groupActivities(surroundings: Attraction[]): { water: Attraction[]; land: Attraction[]; other: Attraction[] } {
  const water: Attraction[] = []
  const land: Attraction[] = []
  const other: Attraction[] = []
  for (const s of surroundings) {
    const cat = s.category + ' ' + s.name
    if (WATER_KEYWORDS.test(cat)) water.push(s)
    else if (LAND_KEYWORDS.test(cat)) land.push(s)
    else other.push(s)
  }
  return { water, land, other }
}

function ActivityChip({ activity }: { activity: Attraction }) {
  return (
    <span className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full truncate max-w-[160px]">
      {activity.name}
    </span>
  )
}

function ActivityGroup({ label, items }: { label: string; items: Attraction[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(a => <ActivityChip key={a.id} activity={a} />)}
      </div>
    </div>
  )
}

const COLLAPSE_THRESHOLD = 8

export default function SurroundingsCard({ result }: Props) {
  const { surroundings, city } = result
  const [expanded, setExpanded] = useState(false)

  const displayed = expanded ? surroundings : surroundings.slice(0, COLLAPSE_THRESHOLD)
  const { water, land, other } = groupActivities(displayed)
  const hasMore = surroundings.length > COLLAPSE_THRESHOLD

  return (
    <div className="bg-white border border-teal-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-teal-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">🌲</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">Outdoor · {city}</span>
      </div>

      <div className="p-4">
        {surroundings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">No outdoor activities found near {city}</p>
        ) : (
          <>
            <ActivityGroup label="💧 Water" items={water} />
            <ActivityGroup label="🥾 Land" items={land} />
            <ActivityGroup label="✨ Other" items={other} />
          </>
        )}
      </div>

      {hasMore && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            {expanded ? 'Show less ↑' : `Show all ${surroundings.length} activities ↓`}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect all pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/SurroundingsCard.test.tsx
```

Expected: All 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/chat-ui/SurroundingsCard.tsx __tests__/chat-ui/SurroundingsCard.test.tsx
git commit -m "feat: add SurroundingsCard for explore_surroundings results"
```

---

## Task 8: DynamicUICard (Approach B)

**Files:**
- Modify: `components/chat-ui/DynamicUICard.tsx` (replace stub)
- Create: `__tests__/chat-ui/DynamicUICard.test.tsx`

**Interfaces:**
- Consumes: `RenderUiResult` from `@/types`
- Produces: Dispatches to trip_stats / booking_confirmed / day_plan / route_summary / hotel_comparison sub-renderers; unknown → generic info card

- [ ] **Step 1: Write failing tests**

Create `__tests__/chat-ui/DynamicUICard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import DynamicUICard from '@/components/chat-ui/DynamicUICard'
import type { RenderUiResult } from '@/types'

describe('DynamicUICard', () => {
  it('renders trip_stats with distance and duration', () => {
    const result: RenderUiResult = {
      component: 'trip_stats',
      title: 'Your 3-Day Trip',
      data: { totalDistance: '540 miles', totalDuration: '8h 30m', stopCount: 3, estimatedCost: '$650' },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText('Your 3-Day Trip')).toBeInTheDocument()
    expect(screen.getByText(/540 miles/)).toBeInTheDocument()
    expect(screen.getByText(/8h 30m/)).toBeInTheDocument()
  })

  it('renders booking_confirmed with hotel name and dates', () => {
    const result: RenderUiResult = {
      component: 'booking_confirmed',
      title: 'Booking Confirmed!',
      data: { hotelName: 'Grand Hyatt', checkIn: '2026-07-01', checkOut: '2026-07-03', nights: 2, totalPrice: 378, currency: 'USD' },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText(/Grand Hyatt/i)).toBeInTheDocument()
    expect(screen.getByText(/\$378/)).toBeInTheDocument()
  })

  it('renders a generic info card for unknown component types', () => {
    // TypeScript won't allow invalid enum values directly — cast for test
    const result = { component: 'unknown_type', title: 'Something Else', data: { foo: 'bar' } } as unknown as RenderUiResult
    render(<DynamicUICard result={result} />)
    expect(screen.getByText('Something Else')).toBeInTheDocument()
  })

  it('renders day_plan with activities', () => {
    const result: RenderUiResult = {
      component: 'day_plan',
      title: 'Day 1 — Chicago',
      data: { day: 1, city: 'Chicago', activities: ['Visit the Bean', 'Lunch at Millennium Park', 'Art Institute'] },
    }
    render(<DynamicUICard result={result} />)
    expect(screen.getByText('Day 1 — Chicago')).toBeInTheDocument()
    expect(screen.getByText('Visit the Bean')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/DynamicUICard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `DynamicUICard.tsx`**

```typescript
'use client'

import type { RenderUiResult } from '@/types'

interface Props {
  result: RenderUiResult
}

function TripStatsCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-blue-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">📊</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {data.totalDistance && (
          <div><p className="text-[10px] text-gray-400 uppercase tracking-wide">Distance</p><p className="text-sm font-bold text-gray-900">{String(data.totalDistance)}</p></div>
        )}
        {data.totalDuration && (
          <div><p className="text-[10px] text-gray-400 uppercase tracking-wide">Drive Time</p><p className="text-sm font-bold text-gray-900">{String(data.totalDuration)}</p></div>
        )}
        {data.stopCount && (
          <div><p className="text-[10px] text-gray-400 uppercase tracking-wide">Stops</p><p className="text-sm font-bold text-gray-900">{String(data.stopCount)}</p></div>
        )}
        {data.estimatedCost && (
          <div><p className="text-[10px] text-gray-400 uppercase tracking-wide">Est. Cost</p><p className="text-sm font-bold text-gray-900">{String(data.estimatedCost)}</p></div>
        )}
      </div>
    </div>
  )
}

function BookingConfirmedCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const total = typeof data.totalPrice === 'number' ? `$${data.totalPrice}` : String(data.totalPrice ?? '')
  return (
    <div className="bg-white border border-green-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-green-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">✅</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {data.hotelName && <p className="text-sm font-bold text-gray-900">{String(data.hotelName)}</p>}
        {(data.checkIn || data.checkOut) && (
          <p className="text-xs text-gray-500">{String(data.checkIn ?? '')} → {String(data.checkOut ?? '')}</p>
        )}
        {data.nights && <p className="text-xs text-gray-500">{String(data.nights)} nights</p>}
        {data.totalPrice && <p className="text-sm font-bold text-green-700">{total} total</p>}
      </div>
    </div>
  )
}

function DayPlanCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const activities = Array.isArray(data.activities) ? data.activities as string[] : []
  return (
    <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-purple-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">📅</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[10px] text-purple-400 font-bold mt-0.5">{i + 1}.</span>
            <p className="text-sm text-gray-800">{activity}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenericInfoCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden my-2">
      <div className="bg-gray-700 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">ℹ️</span>
        <span className="text-white text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-4 py-3">
        <pre className="text-[11px] text-gray-600 whitespace-pre-wrap overflow-auto max-h-32">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default function DynamicUICard({ result }: Props) {
  const { component, title, data } = result

  switch (component) {
    case 'trip_stats':
      return <TripStatsCard title={title} data={data} />
    case 'booking_confirmed':
      return <BookingConfirmedCard title={title} data={data} />
    case 'day_plan':
      return <DayPlanCard title={title} data={data} />
    case 'route_summary':
    case 'hotel_comparison':
      return <GenericInfoCard title={title} data={data} />
    default:
      return <GenericInfoCard title={title} data={data} />
  }
}
```

- [ ] **Step 4: Run — expect all pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run -- __tests__/chat-ui/DynamicUICard.test.tsx
```

Expected: All 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add components/chat-ui/DynamicUICard.tsx __tests__/chat-ui/DynamicUICard.test.tsx
git commit -m "feat: add DynamicUICard for render_ui tool (Approach B)"
```

---

## Task 9: `render_ui` Tool + SYSTEM_PROMPT

**Files:**
- Modify: `lib/claude-tools.ts`

**Interfaces:**
- Produces: `render_ui` tool in `agentTools`; `RenderUiResult` returned from execute
- Consumes: `tool` from `ai`, `z` from `zod` (both already imported)

- [ ] **Step 1: Find insertion point in `lib/claude-tools.ts`**

```bash
grep -n "build_booking_summary\|export const agentTools\|agentTools = {" /home/yeteesh/__myworkarea/projects/genai/road-trip-planner/lib/claude-tools.ts | tail -10
```

Locate the line where `agentTools` is exported and where `build_booking_summary` tool closes.

- [ ] **Step 2: Add `render_ui` tool**

In `lib/claude-tools.ts`, inside the `agentTools` object after `build_booking_summary`, add:

```typescript
  render_ui: tool({
    description:
      'Render a rich UI component in the chat window when a visual summary would be more ' +
      'helpful than text. Call this AFTER other tools have already fetched data. ' +
      'Do NOT call this to fetch data — only to present data already returned by other tools.',
    parameters: z.object({
      component: z.enum(['route_summary', 'hotel_comparison', 'day_plan', 'booking_confirmed', 'trip_stats'])
        .describe('Which UI component to display'),
      title: z.string()
        .describe('Short heading for the card, e.g. "Your 2-Day Trip" or "Booking Confirmed!"'),
      data: z.record(z.unknown())
        .describe('Component-specific payload from prior tool results'),
    }),
    execute: async ({ component, title, data }) => ({ component, title, data }),
  }),
```

- [ ] **Step 3: Add SYSTEM_PROMPT guidance**

In `lib/claude-tools.ts`, append to the `SYSTEM_PROMPT` string (before the closing backtick):

```
GENERATIVE UI — after completing the full tool sequence, call render_ui:
- After suggest_route_stops + search_hotels + search_attractions + explore_surroundings: call render_ui with component='trip_stats', title='Your Trip', data={ totalDistance, totalDuration, stopCount: stops.length }.
- After build_booking_summary succeeds: call render_ui with component='booking_confirmed', title='Booking Confirmed!', data={ hotelName, checkIn, checkOut, nights, totalPrice, currency }.
- If user asks for a day-by-day breakdown: call render_ui with component='day_plan', title='Day N — CityName', data={ day, city, activities: ['activity 1', 'activity 2', ...] }.
- Never call render_ui before other data-fetching tools have run.
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/claude-tools.ts
git commit -m "feat: add render_ui tool and SYSTEM_PROMPT guidance (Approach B)"
```

---

## Task 10: Wire `ChatPanel.tsx`

**Files:**
- Modify: `components/ChatPanel.tsx`

**Interfaces:**
- Consumes: `ChatToolResultRenderer` from `@/components/chat-ui/ChatToolResultRenderer`
- Consumes: `ToolInvocationPart` from `@/types`

- [ ] **Step 1: Add import to `ChatPanel.tsx`**

At the top of `components/ChatPanel.tsx`, after existing imports, add:

```typescript
import ChatToolResultRenderer from './chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'
```

- [ ] **Step 2: Replace the message render loop**

In `ChatPanel.tsx`, find the `messages.map(m => { ... })` block (lines 118–155). Replace the inner assistant message rendering with:

```typescript
{messages.map(m => {
  // Extract displayable text from AI SDK 4.x parts
  const textContent = (() => {
    const p = (m as { parts?: Array<{ type: string; text?: string }> }).parts
    if (p) {
      const t = p.filter(x => x.type === 'text').map(x => x.text ?? '').join('')
      if (t.trim()) return t
    }
    return typeof m.content === 'string' ? m.content : ''
  })()

  // Extract completed tool-invocation parts for rich UI rendering
  const toolResultParts = (() => {
    const p = (m as { parts?: ToolInvocationPart[] }).parts ?? []
    return p.filter(
      (part): part is ToolInvocationPart =>
        part.type === 'tool-invocation' && part.toolInvocation?.state === 'result'
    )
  })()

  // Skip messages with nothing to show
  if (!textContent.trim() && toolResultParts.length === 0 && m.role !== 'user') return null

  return (
    <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {m.role !== 'user' && (
        <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-sm">
          🤖
        </div>
      )}
      <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex-1'}`}>
        {m.role === 'user' ? (
          <div className="bg-blue-600 text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm whitespace-pre-wrap">
            {textContent || m.content}
          </div>
        ) : (
          <div>
            {/* Rich UI cards for tool results */}
            {toolResultParts.map(part => (
              <ChatToolResultRenderer key={part.toolInvocation.toolCallId} part={part} />
            ))}
            {/* Text response */}
            {textContent.trim() && (
              <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200/80 shadow-sm px-4 py-3">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-2">
                  AI Assistant
                </p>
                <AssistantMarkdown content={textContent} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Verify dev server runs**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/ChatPanel.tsx
git commit -m "feat: wire ChatToolResultRenderer into ChatPanel message loop"
```

---

## Task 11: Wire `ChatModal.tsx`

**Files:**
- Modify: `components/ChatModal.tsx`

**Interfaces:**
- Consumes: `ChatToolResultRenderer` from `@/components/chat-ui/ChatToolResultRenderer`
- Consumes: `ToolInvocationPart` from `@/types`

- [ ] **Step 1: Add imports to `ChatModal.tsx`**

```typescript
import ChatToolResultRenderer from './chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'
```

- [ ] **Step 2: Update `visibleMessages` filter to include messages with tool results**

Replace the current `visibleMessages` filter (lines 75–80):

```typescript
const visibleMessages = messages.filter(m => {
  if (m.role === 'user') return true
  const text = getMessageText(m as Parameters<typeof getMessageText>[0])
  const steps = getToolSteps(m as Parameters<typeof getToolSteps>[0])
  const hasToolResults = ((m as { parts?: ToolInvocationPart[] }).parts ?? [])
    .some(p => p.type === 'tool-invocation' && p.toolInvocation?.state === 'result')
  return text.trim().length > 0 || steps.length > 0 || hasToolResults
})
```

- [ ] **Step 3: Add tool result rendering inside assistant card**

In the assistant card render block (after `{steps.length > 0 && !text && (...)}` and before `{text ? (...) : (...)}` ), add:

```typescript
{/* Rich UI cards for completed tool results */}
{((m as { parts?: ToolInvocationPart[] }).parts ?? [])
  .filter((p): p is ToolInvocationPart =>
    p.type === 'tool-invocation' && p.toolInvocation?.state === 'result'
  )
  .map(part => (
    <ChatToolResultRenderer key={part.toolInvocation.toolCallId} part={part} />
  ))
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Full build check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 6: Run all tests**

```bash
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/ChatModal.tsx
git commit -m "feat: wire ChatToolResultRenderer into ChatModal"
```

---

## Post-Implementation Smoke Test

Manual verification steps (no automated test needed — E2E scope):

1. `npm run dev` → plan a trip "Chicago to Nashville 2 days"
2. Verify in ChatPanel: RouteSummaryCard, AttractionGridCard x2, HotelResultsCard x2, SurroundingsCard x2 appear
3. Verify DynamicUICard (trip_stats) appears at the end of the AI response
4. Open ChatModal (expand button) → verify same rich UI cards appear
5. Ask "show me a day by day plan" → verify DynamicUICard with day_plan renders
6. Book a hotel → verify DynamicUICard with booking_confirmed renders
7. Plan a trip with no hotels in a small city → verify HotelResultsCard shows empty state
