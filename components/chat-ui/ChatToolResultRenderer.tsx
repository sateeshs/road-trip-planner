'use client'

import type { ToolInvocationPart } from '@/types'
import type { SuggestRouteStopsResult, SearchHotelsResult, SearchAttractionsResult, SearchSurroundingsResult, SearchRestaurantsResult, RenderUiResult } from '@/types'
import RouteSummaryCard from './RouteSummaryCard'
import HotelResultsCard from './HotelResultsCard'
import AttractionGridCard from './AttractionGridCard'
import SurroundingsCard from './SurroundingsCard'
import RestaurantCard from './RestaurantCard'
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
      return <RouteSummaryCard result={result as SuggestRouteStopsResult} />

    case 'search_hotels':
      return <HotelResultsCard result={result as SearchHotelsResult} />

    case 'search_attractions':
      return <AttractionGridCard result={result as SearchAttractionsResult} />

    case 'search_restaurants':
      return <RestaurantCard result={result as SearchRestaurantsResult} />

    case 'explore_surroundings':
      return <SurroundingsCard result={result as SearchSurroundingsResult} />

    case 'render_ui':
      return <DynamicUICard result={result as RenderUiResult} />

    default:
      return null
  }
}
