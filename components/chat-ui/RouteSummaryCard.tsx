'use client'
import type { SuggestRouteStopsResult } from '@/types'
export default function RouteSummaryCard({ result }: { result: SuggestRouteStopsResult }) {
  return <div data-testid="route-summary">{result.stops.map(s => <span key={s.city}>{s.city}</span>)}</div>
}
