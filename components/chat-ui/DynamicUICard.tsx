'use client'
import type { RenderUiResult } from '@/types'
export default function DynamicUICard({ result }: { result: RenderUiResult }) {
  return <div data-testid="dynamic-ui">{result.title}</div>
}
