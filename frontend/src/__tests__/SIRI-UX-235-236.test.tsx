/**
 * SIRI-UX-235: GlobalSearch overlay has role="dialog" + aria-modal="true"
 * SIRI-UX-236: SkeletonCard timeout error has role="alert"
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import SkeletonCard from '../components/SkeletonCard'
import { useAgentStore } from '../store/agentStore'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )
}

describe('SIRI-UX-235: GlobalSearch overlay dialog role', () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      tasks: [],
      currentCompany: { id: 'c1', name: 'Acme Corp' },
    })
  })

  it('search panel has role="dialog" when overlay is open', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('search dialog has aria-modal="true"', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('search dialog has aria-label="Search"', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Search')
  })
})

describe('SIRI-UX-236: SkeletonCard timeout error has role="alert"', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows role="alert" on timeout error after 5 seconds', () => {
    render(<SkeletonCard variant="agent" />)
    // Fast-forward past the 5s timeout
    act(() => { vi.advanceTimersByTime(5001) })
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/loading took too long/i)
  })
})
