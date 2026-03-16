import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SkeletonCard from '../components/SkeletonCard'

describe('UX-016: SkeletonCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- Variant: agent ---
  it('renders agent skeleton with avatar circle (48px) and text lines', () => {
    render(<SkeletonCard variant="agent" />)
    const card = screen.getByTestId('skeleton-agent')
    expect(card).toBeInTheDocument()
    // avatar circle
    const avatar = card.querySelector('[data-testid="skeleton-avatar"]')
    expect(avatar).toBeInTheDocument()
    // text lines (at least 2 + 1 badge)
    const lines = card.querySelectorAll('[data-testid="skeleton-line"]')
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  // --- Variant: task ---
  it('renders task skeleton with title line, description line, and avatar+badge row', () => {
    render(<SkeletonCard variant="task" />)
    const card = screen.getByTestId('skeleton-task')
    expect(card).toBeInTheDocument()
    const lines = card.querySelectorAll('[data-testid="skeleton-line"]')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // avatar in row
    const avatar = card.querySelector('[data-testid="skeleton-avatar"]')
    expect(avatar).toBeInTheDocument()
  })

  // --- Variant: company ---
  it('renders company skeleton with icon (40px) and text lines', () => {
    render(<SkeletonCard variant="company" />)
    const card = screen.getByTestId('skeleton-company')
    expect(card).toBeInTheDocument()
    const icon = card.querySelector('[data-testid="skeleton-icon"]')
    expect(icon).toBeInTheDocument()
    const lines = card.querySelectorAll('[data-testid="skeleton-line"]')
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  // --- Shimmer animation ---
  it('has shimmer animation style on skeleton elements', () => {
    render(<SkeletonCard variant="agent" />)
    const card = screen.getByTestId('skeleton-agent')
    const shimmerEl = card.querySelector('[data-testid="skeleton-line"]') as HTMLElement
    expect(shimmerEl).toBeInTheDocument()
    // Check animation property is set
    expect(shimmerEl.style.animation).toContain('shimmer')
  })

  // --- Count prop ---
  it('renders specified count of skeleton cards', () => {
    render(<SkeletonCard variant="agent" count={3} />)
    const cards = screen.getAllByTestId('skeleton-agent')
    expect(cards).toHaveLength(3)
  })

  it('renders default count of 1 when count not specified', () => {
    render(<SkeletonCard variant="task" />)
    const cards = screen.getAllByTestId('skeleton-task')
    expect(cards).toHaveLength(1)
  })

  // --- Timeout: 5 seconds → error state ---
  it('shows error state after 5 seconds timeout', () => {
    render(<SkeletonCard variant="agent" />)
    expect(screen.queryByText(/took too long/i)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText(/took too long/i)).toBeInTheDocument()
  })

  it('does not show error state before 5 seconds', () => {
    render(<SkeletonCard variant="company" />)

    act(() => {
      vi.advanceTimersByTime(4999)
    })

    expect(screen.queryByText(/took too long/i)).not.toBeInTheDocument()
  })

  // --- Layout: no shift (same dimensions as real cards) ---
  it('agent skeleton card has consistent card styling (background, border-radius)', () => {
    render(<SkeletonCard variant="agent" />)
    const card = screen.getByTestId('skeleton-agent')
    expect(card.style.background).toBe('rgb(31, 41, 55)')
    expect(card.style.borderRadius).toBe('8px')
  })

  it('task skeleton card has consistent card styling', () => {
    render(<SkeletonCard variant="task" />)
    const card = screen.getByTestId('skeleton-task')
    expect(card.style.background).toBe('rgb(31, 41, 55)')
    expect(card.style.borderRadius).toBe('8px')
  })
})
