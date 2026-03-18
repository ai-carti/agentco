/**
 * SIRI-UX-012: LibraryPage should show SkeletonCard during loading, not plain "Loading…"
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LibraryPage from '../components/LibraryPage'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderLibrary() {
  return render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-012: LibraryPage skeleton loader', () => {
  it('does NOT show plain "Loading…" text during data fetch', () => {
    // Never resolves — stays in loading state
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    renderLibrary()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('shows SkeletonCard while loading', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    renderLibrary()
    // SkeletonCard renders task skeleton elements with data-testid="skeleton-task"
    expect(screen.getAllByTestId('skeleton-task').length).toBeGreaterThan(0)
  })
})
