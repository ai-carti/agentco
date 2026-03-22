/**
 * SIRI-UX-145: WarRoom.tsx isConnecting stuck true when !token || !companyId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock stores
vi.mock('../store/authStore', () => ({
  useAuthStore: (sel: (s: { token: string | null }) => unknown) =>
    sel({ token: null }), // no token
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: { currentCompany: null }) => unknown) =>
    sel({ currentCompany: null }),
}))

// Mock WebSocket — should NOT be called when no token
const MockWS = vi.fn()
vi.stubGlobal('WebSocket', MockWS)

import WarRoom from '../components/WarRoom'

describe('SIRI-UX-145: WarRoom isConnecting', () => {
  beforeEach(() => {
    MockWS.mockClear()
  })

  it('does NOT show infinite spinner when token and companyId are absent', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <WarRoom />
        </MemoryRouter>
      )
    })

    // WebSocket should not be created without token
    expect(MockWS).not.toHaveBeenCalled()
    // Should NOT be stuck in connecting (spinner) state
    expect(screen.queryByText(/connecting/i)).toBeNull()
    // Should show the empty state instead
    expect(screen.getByText(/all quiet here/i)).toBeInTheDocument()
  })
})
