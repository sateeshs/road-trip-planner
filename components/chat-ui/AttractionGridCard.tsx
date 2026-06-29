'use client'
import type { SearchAttractionsResult } from '@/types'
export default function AttractionGridCard({ result }: { result: SearchAttractionsResult }) {
  return <div data-testid="attraction-grid">{result.city}</div>
}
