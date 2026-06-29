'use client'
import type { SearchSurroundingsResult } from '@/types'
export default function SurroundingsCard({ result }: { result: SearchSurroundingsResult }) {
  return <div data-testid="surroundings">{result.city}</div>
}
