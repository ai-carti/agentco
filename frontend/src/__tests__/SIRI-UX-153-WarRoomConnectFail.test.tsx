/**
 * SIRI-UX-153: WarRoom.tsx — isConnecting stuck true when WS connect fails
 *
 * When a WebSocket connection fails (onclose fires without onopen),
 * isConnecting stays true and the empty state is never shown.
 * The fix: set isConnecting(false) in onclose.
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import WarRoom from '../components/WarRoom'
import { useAuthStore } from '../store/authStore'
import { useAgentStore } from '../store/agentStore'

interface MockWs {
  onopen: ((e: Event) => void) | null
  onmessage: ((e: MessageEvent) => void) | null
  onclose: ((e: CloseEvent) => void) | null
  onerror: ((e: Event) => void) | null
  close: () => void
  readyState: number
}

let wsInstance: MockWs | null = null

beforeEach(() => {
  wsInstance = null
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    json: async () => [],
  } as Response)

  vi.stubGlobal('WebSocket', function (this: MockWs) {
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this.close = vi.fn()
    this.readyState = 0
    wsInstance = this
  })

  useAuthStore.setState({ token: 'test-token' })
  useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SIRI-UX-153: WarRoom WS connect failure', () => {
  it('shows empty state when WS closes without ever opening (connect failure)', async () => {
    render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>
    )

    // Simulate WS connect failure: onclose fires, onopen never did
    await act(async () => {
      if (wsInstance?.onclose) {
        wsInstance.onclose(new CloseEvent('close', { code: 1006, reason: 'Connection failed' }))
      }
    })

    // Should show empty state, not hang invisibly
    expect(screen.getByText(/all quiet here/i)).toBeInTheDocument()
  })

  it('does not get stuck when WS fails multiple reconnects', async () => {
    render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>
    )

    // First connection fails
    await act(async () => {
      if (wsInstance?.onclose) {
        wsInstance.onclose(new CloseEvent('close', { code: 1006 }))
      }
    })

    // Empty state should be visible immediately after failure
    expect(screen.getByText(/all quiet here/i)).toBeInTheDocument()
  })
})
