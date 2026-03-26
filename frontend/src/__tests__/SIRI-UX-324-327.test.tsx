/**
 * SIRI-UX-324: AuthPage "Forgot password?" — accessible disabled button
 * SIRI-UX-325: WarRoomPage — empty feed message varies by runStatus
 * SIRI-UX-326: GlobalSearch — no duplicate data-testid="global-search-trigger"
 * SIRI-UX-327: formatTimeHMS — invalid ISO guard returns '--:--:--'
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { formatTimeHMS } from '../utils/taskUtils'
import { useWarRoomStore } from '../store/warRoomStore'
import { useAgentStore } from '../store/agentStore'
import AuthPage from '../components/AuthPage'
import WarRoomPage from '../components/WarRoomPage'

// ──────────────────────────────────────────────────────────────
// SIRI-UX-327: formatTimeHMS guard
// ──────────────────────────────────────────────────────────────
describe('SIRI-UX-327: formatTimeHMS invalid ISO guard', () => {
  it('returns "--:--:--" for an invalid ISO string', () => {
    expect(formatTimeHMS('not-a-date')).toBe('--:--:--')
  })

  it('returns "--:--:--" for empty string', () => {
    expect(formatTimeHMS('')).toBe('--:--:--')
  })

  it('returns a valid time string for a valid ISO', () => {
    const result = formatTimeHMS('2026-03-25T10:00:00.000Z')
    expect(result).not.toBe('--:--:--')
    // Should be a time format (contains ":")
    expect(result).toMatch(/:/)
  })
})

// ──────────────────────────────────────────────────────────────
// SIRI-UX-324: AuthPage — "Forgot password?" is a button
// ──────────────────────────────────────────────────────────────
describe('SIRI-UX-324: AuthPage forgot-password accessible', () => {
  it('renders forgot password as a disabled button (keyboard accessible)', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    )
    const btn = screen.getByTestId('forgot-password-btn')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
  })
})

// ──────────────────────────────────────────────────────────────
// SIRI-UX-326: GlobalSearch — no duplicate testid
// ──────────────────────────────────────────────────────────────
import GlobalSearch from '../components/GlobalSearch'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('SIRI-UX-326: GlobalSearch — no duplicate global-search-trigger', () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      tasks: [],
      currentCompany: { id: 'c1', name: 'Test Corp' },
    })
  })

  it('has exactly one global-search-trigger element in closed state', () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )
    const triggers = screen.getAllByTestId('global-search-trigger')
    expect(triggers).toHaveLength(1)
  })

  it('has no global-search-trigger element when dialog is open (overlay replaces it)', () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    // Dialog is now open — trigger button is gone, overlay is visible
    expect(screen.queryByTestId('global-search-overlay')).toBeInTheDocument()
    // No duplicate testid — previous bug was hidden button still rendered
    const triggers = screen.queryAllByTestId('global-search-trigger')
    expect(triggers).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────
// SIRI-UX-325: WarRoomPage — empty feed message by runStatus
// ──────────────────────────────────────────────────────────────
describe('SIRI-UX-325: WarRoomPage empty feed message by runStatus', () => {
  beforeEach(() => {
    useWarRoomStore.setState({
      agents: [
        { id: 'a1', name: 'CEO', role: 'Chief Executive Officer', status: 'idle', avatar: '👔', level: 0 },
      ],
      messages: [],
      cost: 0,
      runStatus: 'idle',
      flashingAgents: new Set(),
    })
  })

  it('shows "Waiting for agent activity..." when runStatus is idle', () => {
    useWarRoomStore.setState({ runStatus: 'idle', messages: [] })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <WarRoomPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Waiting for agent activity/)).toBeInTheDocument()
  })

  it('shows stopped message when runStatus is stopped', () => {
    useWarRoomStore.setState({ runStatus: 'stopped', messages: [] })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <WarRoomPage />
      </MemoryRouter>
    )
    // activity-feed empty state shows stop-specific message
    expect(screen.getByText('⏹ Run stopped — no activity recorded')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for agent activity/)).not.toBeInTheDocument()
  })

  it('shows completed message when runStatus is done', () => {
    useWarRoomStore.setState({ runStatus: 'done', messages: [] })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <WarRoomPage />
      </MemoryRouter>
    )
    expect(screen.getByText('✓ Run completed — all messages shown')).toBeInTheDocument()
  })

  it('shows failed message when runStatus is failed', () => {
    useWarRoomStore.setState({ runStatus: 'failed', messages: [] })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <WarRoomPage />
      </MemoryRouter>
    )
    expect(screen.getByText('✗ Run failed — no messages were sent')).toBeInTheDocument()
  })
})
