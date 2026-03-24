/**
 * SIRI-UX-264: GlobalSearch — no JS onMouseEnter for hover
 * SIRI-UX-265: No JS onFocus/onBlur borderColor mutations in input components
 *
 * CSS handles hover and focus styles; JS handlers removed.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )
}

beforeEach(() => {
  useAgentStore.setState({
    agents: [
      { id: 'a1', name: 'Alice', role: 'Developer', status: 'idle' as const },
      { id: 'a2', name: 'Bob', role: 'DevOps', status: 'running' as const },
    ],
    tasks: [],
    currentCompany: { id: 'c1', name: 'Acme Corp' },
  })
  vi.useFakeTimers()
  mockNavigate.mockClear()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('SIRI-UX-264: GlobalSearch result items use CSS classes for hover', () => {
  it('search result items have .search-result-item CSS class (CSS hover via stylesheet)', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })

    const results = screen.getAllByRole('option')
    expect(results.length).toBeGreaterThan(0)
    results.forEach(item => {
      expect(item.classList.contains('search-result-item')).toBe(true)
    })
  })

  it('active search result has .search-result-item--active class', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const active = screen.getByTestId('search-result-active')
    expect(active.classList.contains('search-result-item--active')).toBe(true)
  })

  it('keyboard navigation still works after removing JS mouseenter handler', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByTestId('search-result-active')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalled()
  })
})
