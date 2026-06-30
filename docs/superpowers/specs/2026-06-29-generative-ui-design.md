# Generative UI for Road Trip Planner Chat

**Date:** 2026-06-29
**Status:** Approved
**Approach:** A (auto-render tool results) + B (AI-driven `render_ui` tool)

---

## Background

Inspired by the A2UI / Hashbrown pattern (Angular) described in:
https://www.angulararchitects.io/en/blog/generative-ui-for-ai-assistants-component-control-and-structured-output-with-hashbrown/

The core idea: instead of the chat window showing only text, the AI selects and renders rich
interactive UI components inline in the conversation — the AI acts as a dynamic router.

### Why Not `streamUI` (Vercel AI SDK RSC)?

`streamUI` is the Vercel-native generative UI primitive. It was ruled out because:
- Marked **experimental / not recommended for production** in 2025 docs
- Requires **RSC Server Actions** — incompatible with the current `Edge Route + useChat + streamText` pipeline
- Migration would require rewriting `/api/chat/route.ts` and replacing `useChat` with `useUIState + useActions`
- High risk to a working streaming pipeline for marginal benefit

### Chosen Approach

**Approach A — Auto-render tool results:**
Vercel AI SDK 4.x already puts tool results in `messages[n].parts` with `type='tool-result'`.
The current render loop skips these (returns null for non-text assistant messages).
We intercept them and render rich React components instead.

**Approach B — `render_ui` tool:**
A new AI tool whose sole purpose is emitting a component spec (name + props).
The AI calls it when a visual summary would help the user (e.g. after booking,
after planning a full day, when user asks "show me a summary").
This is the closest equivalent to Hashbrown's `uiChatResource` on this stack —
the AI explicitly decides what to render, not just auto-detection.

Both run entirely client-side. No changes to the Edge streaming backend.

---

## Architecture

### Rendering Pipeline

```
messages[] (from useChat / TripContext)
  ├── parts[type='text']           → existing text bubble (unchanged)
  ├── parts[type='tool-result']
  │     ├── toolName='suggest_route_stops'   → RouteSummaryCard
  │     ├── toolName='search_hotels'         → HotelResultsCard
  │     ├── toolName='search_attractions'    → AttractionGridCard
  │     ├── toolName='explore_surroundings'  → SurroundingsCard
  │     └── toolName='render_ui'             → DynamicUICard (Approach B dispatcher)
  └── role='user'                  → existing user bubble (unchanged)
```

### Key Constraint

All map state updates (stops, hotels, attractions, surroundings) continue via `TripContext`
exactly as before. The chat UI layer is **purely additive** — it renders data already
flowing through the system, never fetches its own data.

---

## New Files

```
components/
  chat-ui/
    ChatToolResultRenderer.tsx   — dispatcher: reads toolName → picks card component
    RouteSummaryCard.tsx         — itinerary stops, drive times, toll warnings
    HotelResultsCard.tsx         — top hotels per city, star/price, "View on map"
    AttractionGridCard.tsx       — attraction tiles with category icons
    SurroundingsCard.tsx         — outdoor activity chips grouped by category
    DynamicUICard.tsx            — Approach B dispatcher for render_ui tool results
```

### Files Modified

| File | Change |
|------|--------|
| `components/ChatPanel.tsx` | Import + use `ChatToolResultRenderer` for tool-result parts |
| `components/ChatModal.tsx` | Same — inherits rich UI automatically (same messages source) |
| `lib/claude-tools.ts` | Add `render_ui` tool definition |
| `lib/claude-tools.ts` | Append `render_ui` guidance to `SYSTEM_PROMPT` |

---

## Component Specifications

### `ChatToolResultRenderer`

Single dispatcher component. Reads `toolName` from a tool-result message part and renders
the appropriate card. Deduplicates by `toolCallId` so if the AI calls the same tool twice,
only the latest result renders.

```tsx
interface Props {
  part: ToolResultPart   // { type: 'tool-result', toolName, toolCallId, result }
}
```

Falls back to `null` (no render) for unknown tool names, so future tools don't break the UI.

### `RouteSummaryCard`

Triggered by: `suggest_route_stops` result.

Shows:
- Numbered stop list (origin → intermediates → destination)
- Drive time + distance per leg (e.g. "2h 35m · 145 mi")
- Highway badge per leg (e.g. "Via I-65 S")
- Toll warning badge if applicable
- Total trip distance + duration at bottom

### `HotelResultsCard`

Triggered by: `search_hotels` result.

Shows top 3 hotels for the city (sorted by price ascending):
- Hotel name + star rating (filled stars)
- Price per night
- Top 3 amenity tags (wifi, pool, parking, etc.)
- "View on map" button → calls `setSelectedStop` via TripContext to open StopBottomSheet

### `AttractionGridCard`

Triggered by: `search_attractions` result.

Shows up to 6 attractions in a 2-column grid:
- Category emoji icon + attraction name
- Category label (Museum, Park, Viewpoint, etc.)
- "View on map" button for the stop

### `SurroundingsCard`

Triggered by: `explore_surroundings` result.

Shows outdoor activities as grouped chips:
- Groups: Water (kayaking, cruise, boat_tour), Land (hiking, cycling, atv_rides), Air (zip_line, scenic_ride)
- Each chip shows activity name
- Collapse to top 8 if more than 8 activities, with "Show all" toggle

### `DynamicUICard` (Approach B)

Triggered by: `render_ui` tool result.

Dispatches to sub-renderers based on `component` field:

| component value | Renders |
|-----------------|---------|
| `route_summary` | Inline itinerary summary (compact RouteSummaryCard) |
| `hotel_comparison` | Side-by-side hotel options |
| `day_plan` | Day-by-day activity breakdown |
| `booking_confirmed` | Booking receipt card (hotel name, dates, price, cancellation) |
| `trip_stats` | Total distance, drive time, stop count, estimated cost |

Unknown component type → generic info card showing `title` + formatted JSON.

---

## Backend Change: `render_ui` Tool

### Tool Definition (lib/claude-tools.ts)

```ts
render_ui: tool({
  description: `Render a rich UI component in the chat window when a visual summary
    would be more helpful than text. Use this AFTER other tools have already fetched data.
    Do NOT use this to fetch data — only to present it visually.`,
  parameters: z.object({
    component: z.enum([
      'route_summary',
      'hotel_comparison',
      'day_plan',
      'booking_confirmed',
      'trip_stats',
    ]),
    title: z.string().describe('Short heading for the card, e.g. "Your 2-Day Trip"'),
    data: z.record(z.unknown()).describe('Component-specific payload from prior tool results'),
  }),
  execute: async ({ component, title, data }) => ({ component, title, data }),
})
```

### SYSTEM_PROMPT Addition

Append to the existing SYSTEM_PROMPT:

```
After completing the full tool sequence (suggest_route_stops → search_attractions →
search_hotels → explore_surroundings), call render_ui with component='trip_stats' to show
the user a visual trip summary.

Call render_ui with component='booking_confirmed' immediately after build_booking_summary
succeeds.

Call render_ui with component='day_plan' if the user asks for a day-by-day breakdown.

Never call render_ui to fetch or look up data. Only call it to present data that other
tools have already returned.
```

---

## Data Flow: End-to-End Example

```
User: "Plan a 2-day trip from Chicago to Nashville"

AI calls (in order):
  1. suggest_route_stops    → RouteSummaryCard renders in chat
  2. search_attractions x2  → AttractionGridCard x2 render in chat
  3. search_hotels x2       → HotelResultsCard x2 render in chat
  4. explore_surroundings x2 → SurroundingsCard x2 render in chat
  5. render_ui(trip_stats)  → DynamicUICard renders trip stats summary

Simultaneously (unchanged):
  - TripContext extracts same tool results → map pins, route line, StopBottomSheet data
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Tool result with 0 items | Card renders empty state: "No hotels found near Chicago" |
| Unknown `render_ui` component | DynamicUICard renders generic info card with title + JSON |
| AI calls same tool twice | Deduplicate by `toolCallId`; render only latest |
| Tool result data shape mismatch | Card catches at render time, shows fallback empty state |
| ChatModal vs ChatPanel | Both read from same `messages` in TripContext — rich UI appears in both automatically |

---

## Testing Plan

### Unit Tests

- `ChatToolResultRenderer` — mock each tool-result part, assert correct child renders
- `RouteSummaryCard` — various stop counts, toll flags, missing highway names
- `HotelResultsCard` — 0 hotels, 1 hotel, 3+ hotels; star ratings; missing amenities
- `AttractionGridCard` — 0, 1, 6, 10+ attractions (truncation)
- `SurroundingsCard` — grouping logic, collapse/expand toggle
- `DynamicUICard` — each component enum value, unknown component fallback

### Manual Smoke Test

1. Plan a 2-stop trip → verify all 4 auto-render cards appear in chat
2. Ask "show me a summary" → verify AI calls `render_ui` and card appears
3. Book a hotel → verify `booking_confirmed` card appears
4. Open ChatModal → verify same rich UI appears there too
5. Trigger empty result (no-coverage city) → verify empty state renders gracefully

---

## Out of Scope

- Streaming loading skeletons per card (can be added later)
- Interactive booking flow inside chat cards (hotel booking stays in StopBottomSheet)
- Photo/image fetching for attraction cards (OSM data has no images)
- `streamUI` / RSC migration (ruled out — experimental, high risk)
