/**
 * SIRI-UX-288: GlobalSearch — active item does not scroll into view on ArrowDown/ArrowUp.
 * The listbox has maxHeight:360/overflowY:auto. When activeIndex changes via keyboard,
 * the active DOM element must call scrollIntoView({ block: 'nearest' }).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

// Provide enough results to require scrolling
const AGENTS = Array.from({ length: 10 }, (_, i) => ({
  id: `agent-${i}`,
  name: `Agent ${i}`,
  role: 'worker',
  model: 'gpt-4',
  status: 'idle' as const,
  company_id: 'c1',
  system_prompt: '',
  last_task_at: null,
  created_at: new Date().toISOString(),
}))

beforeEach(() => {
  useAgentStore.setState({
    agents: AGENTS,
    tasks: [],
    currentCompany: { id: 'c1', name: 'TestCo' },
  })
})

const renderSearch = () =>
  render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )

describe('SIRI-UX-288: GlobalSearch scrolls active item into view on keyboard navigation', () => {
  it('calls scrollIntoView on the active option element when ArrowDown is pressed', async () => {
    // Mock scrollIntoView — not implemented in jsdom
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    renderSearch()

    // Open search
    const trigger = screen.getByTestId('global-search-trigger')
    fireEvent.click(trigger)

    // Type to get results
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Agent' } })

    // Wait for debounced query (300ms default) — use a short wait
    await new Promise((r) => setTimeout(r, 400))

    // Press ArrowDown to navigate
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // scrollIntoView should have been called on the active item
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
