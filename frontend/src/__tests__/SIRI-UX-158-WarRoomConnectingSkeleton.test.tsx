/**
 * SIRI-UX-158: WarRoom — show skeleton while isConnecting=true
 *
 * Previously: isConnecting=true + runs=[] → blank area (no UI at all).
 * Fix: render SkeletonCard when isConnecting && runs.length === 0.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import WarRoom from '../components/WarRoom'

// Mock stores so component has a valid token + company (triggers WS connect)
vi.mock('../store/authStore', () => ({
  useAuthStore: (sel: (s: { token: string }) => unknown) => sel({ token: 'tok' }),
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: { currentCompany: { id: string } }) => unknown) =>
    sel({ currentCompany: { id: 'c1' } }),
}))

function renderWarRoom() {
  return render(
    <MemoryRouter>
      <WarRoom />
    </MemoryRouter>
  )
}

describe('SIRI-UX-158: WarRoom connecting skeleton', () => {
  let wsMock: { onopen?: () => void; onclose?: () => void; onmessage?: () => void; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    wsMock = { close: vi.fn() }
    vi.spyOn(globalThis, 'WebSocket').mockImplementation(() => wsMock as unknown as WebSocket)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows skeleton cards while connecting (before onopen fires)', () => {
    renderWarRoom()
    // isConnecting starts true; onopen never fires in this test → skeleton visible
    const skeletons = document.querySelectorAll('[data-testid^="skeleton"]')
    // SkeletonCard renders divs with animate-pulse — verify something rendered
    // WarRoom heading always present
    expect(screen.getByText('War Room')).toBeInTheDocument()
    // Empty state should NOT be shown while connecting
    expect(screen.queryByText('All quiet here')).not.toBeInTheDocument()
    // Some skeleton content should exist
    expect(skeletons.length > 0 || document.querySelector('.animate-pulse')).toBeTruthy()
  })
})
