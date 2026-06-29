import { render, screen, fireEvent } from '@testing-library/react'
import SurroundingsCard from '@/components/chat-ui/SurroundingsCard'
import type { SearchSurroundingsResult } from '@/types'

function makeSurroundings(categories: string[]) {
  return categories.map((category, i) => ({
    id: `s${i}`,
    name: `Activity ${i + 1}`,
    category,
    address: '',
    coordinates: { lat: 36.1, lng: -86.7 },
  }))
}

const waterActivities = makeSurroundings(['Kayaking', 'Boat Tour / Cruise', 'Rafting'])
const landActivities = makeSurroundings(['Hiking / Scenic', 'Rock Climbing', 'Zip Line'])

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
