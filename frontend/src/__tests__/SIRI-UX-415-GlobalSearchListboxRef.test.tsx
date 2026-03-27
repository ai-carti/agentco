/**
 * SIRI-UX-415: listboxRef is declared in GlobalSearch but never used anywhere.
 * The scrollIntoView effect reaches for document.getElementById instead of iterating
 * the ref's children — the ref is dead weight. This test verifies the listbox div
 * in the rendered DOM actually carries the id expected by the getElementById call,
 * so that keyboard navigation scroll works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.setState({
    agents: [{ id: 'a1', name: 'Alpha Agent', role: 'CEO', status: 'idle' }],
    tasks: [],
    currentCompany: { id: 'c1', name: 'Alpha Corp' },
    activeCompanyTab: null,
  })
})

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-415: GlobalSearch listbox items carry correct scroll-target ids', () => {
  it('renders search option elements with id=search-option-N so getElementById can find them', async () => {
    renderSearch()
    // open dialog
    fireEvent.click(screen.getByTestId('global-search-trigger'))

    const input = screen.getByTestId('global-search-input')
    // type enough to trigger results (>= 2 chars)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alpha' } })
      // wait for 200ms debounce
      await new Promise((r) => setTimeout(r, 250))
    })

    // At least one result should appear
    const results = document.querySelectorAll('[id^="search-option-"]')
    expect(results.length).toBeGreaterThan(0)

    // id must be "search-option-0" for the first result
    expect(document.getElementById('search-option-0')).not.toBeNull()
  })

  it('pressing ArrowDown activates first option (aria-selected=true)', async () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))

    const input = screen.getByTestId('global-search-input')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alpha' } })
      await new Promise((r) => setTimeout(r, 250))
    })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })

    const first = document.getElementById('search-option-0')
    expect(first?.getAttribute('aria-selected')).toBe('true')
  })
})
