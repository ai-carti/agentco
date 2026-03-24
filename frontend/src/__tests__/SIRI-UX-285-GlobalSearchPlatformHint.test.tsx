/**
 * SIRI-UX-285: GlobalSearch trigger button shows hardcoded "Ctrl+K" even on macOS.
 * On macOS, the correct shortcut is ⌘K. The hint should be platform-adaptive.
 * Fix: detect navigator.platform/userAgentData and show ⌘K on Mac, Ctrl+K otherwise.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.setState({
    agents: [],
    tasks: [],
    currentCompany: null,
  })
})

const renderSearch = () =>
  render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )

describe('SIRI-UX-285: GlobalSearch keyboard hint is platform-adaptive', () => {
  it('shows ⌘K on macOS (navigator.platform = MacIntel)', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    renderSearch()
    const trigger = screen.getByTestId('global-search-trigger')
    expect(trigger).toHaveTextContent('⌘K')
    expect(trigger).not.toHaveTextContent('Ctrl+K')
  })

  it('shows Ctrl+K on non-Mac platforms (navigator.platform = Win32)', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    renderSearch()
    const trigger = screen.getByTestId('global-search-trigger')
    expect(trigger).toHaveTextContent('Ctrl+K')
  })
})
