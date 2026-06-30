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
