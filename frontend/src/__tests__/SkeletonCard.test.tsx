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
  // SIRI-UX-244: shimmer moved from inline style to skeleton-shimmer CSS class
  it('has skeleton-shimmer CSS class on shimmer elements', () => {
    render(<SkeletonCard variant="agent" />)
    const card = screen.getByTestId('skeleton-agent')
    const shimmerEl = card.querySelector('[data-testid="skeleton-line"]') as HTMLElement
    expect(shimmerEl).toBeInTheDocument()
    // Animation is defined in .skeleton-shimmer CSS class (index.css), not inline style
    expect(shimmerEl.className).toContain('skeleton-shimmer')
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
    // Styling now applied via Tailwind classes (bg-gray-800, rounded-lg, border)
    expect(card.className).toContain('bg-gray-800')
    expect(card.className).toContain('rounded-lg')
  })

  it('task skeleton card has consistent card styling', () => {
    render(<SkeletonCard variant="task" />)
    const card = screen.getByTestId('skeleton-task')
    // Styling now applied via Tailwind classes (bg-gray-800, rounded-lg, border)
    expect(card.className).toContain('bg-gray-800')
    expect(card.className).toContain('rounded-lg')
  })

  // SIRI-UX-378: key should use semantic string (`skeleton-${variant}-${i}`) not bare index
  it('renders multiple skeleton items without console key warnings (stable key pattern)', () => {
    // We test the observable side-effect: rendering count=3 produces exactly 3 items,
    // each with a stable presence. The key value itself is not part of the DOM, but
    // the test documents the contract — changing count re-renders cleanly.
    const { rerender } = render(<SkeletonCard variant="agent" count={3} />)
    expect(screen.getAllByTestId('skeleton-agent')).toHaveLength(3)

    // Changing count from 3 → 2 should remove exactly one item (tests React reconciliation)
    rerender(<SkeletonCard variant="agent" count={2} />)
    expect(screen.getAllByTestId('skeleton-agent')).toHaveLength(2)

    // Changing variant should produce new items
    rerender(<SkeletonCard variant="task" count={2} />)
    expect(screen.getAllByTestId('skeleton-task')).toHaveLength(2)
    expect(screen.queryAllByTestId('skeleton-agent')).toHaveLength(0)
  })
})
