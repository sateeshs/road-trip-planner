'use client'
import type { SearchHotelsResult } from '@/types'
export default function HotelResultsCard({ result }: { result: SearchHotelsResult }) {
  return <div data-testid="hotel-results">{result.city}</div>
}
