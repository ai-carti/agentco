/**
 * SIRI-UX-146: runs array cap prevents unbounded growth
 * SIRI-UX-147: ws.onclose does NOT reconnect on 4001/4003
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const TOKEN = 'test-token'
const COMPANY_ID = 'co-1'

vi.mock('../store/authStore', () => ({
  useAuthStore: (sel: (s: { token: string }) => unknown) => sel({ token: TOKEN }),
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: { currentCompany: { id: string } }) => unknown) =>
    sel({ currentCompany: { id: COMPANY_ID } }),
}))

// Mock fetch — return empty runs
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
})

// Capture WS instances
type WsEventMap = {
  open?: () => void
  message?: (e: { data: string }) => void
  close?: (e: { code: number; wasClean: boolean }) => void
  error?: () => void
}
let wsInstances: (WsEventMap & { close: () => void; _closed: boolean })[] = []

class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; wasClean: boolean }) => void) | null = null
  onerror: (() => void) | null = null
  _closed = false

  constructor() {
    wsInstances.push(this as unknown as WsEventMap & { close: () => void; _closed: boolean })
  }

  close() {
    this._closed = true
  }
}
vi.stubGlobal('WebSocket', MockWebSocket)

import WarRoom from '../components/WarRoom'

describe('SIRI-UX-146: runs cap', () => {
  beforeEach(() => {
    wsInstances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('caps runs at 100 — evicts oldest when over limit', async () => {
    await act(async () => {
      render(<MemoryRouter><WarRoom /></MemoryRouter>)
    })

    // Trigger WS open
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => { ws.onopen?.() })

    // Send 110 run.started events
    await act(async () => {
      for (let i = 0; i < 110; i++) {
        ws.onmessage?.({
          data: JSON.stringify({
            type: 'run.started',
            run_id: `run-${i}`,
            agent_name: `Agent ${i}`,
            task_title: `Task ${i}`,
            status: 'running',
            started_at: new Date().toISOString(),
          }),
        })
      }
    })

    // Should show exactly 100 runs (oldest evicted), not 110
    const cards = screen.getAllByText(/Agent \d+/)
    expect(cards.length).toBeLessThanOrEqual(100)
    // First 10 should be evicted — Agent 0..9 gone, Agent 10..109 visible
    expect(screen.queryByText('Agent 0')).toBeNull()
    expect(screen.queryByText('Agent 9')).toBeNull()
    expect(screen.getByText('Agent 10')).toBeInTheDocument()
  })
})

describe('SIRI-UX-147: ws.onclose no reconnect on 4001/4003', () => {
  beforeEach(() => {
    wsInstances = []
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not reconnect when WS closes with code 4001 (unauthorized)', async () => {
    await act(async () => {
      render(<MemoryRouter><WarRoom /></MemoryRouter>)
    })

    const initialCount = wsInstances.length
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => { ws.onopen?.() })

    // Simulate 4001 close
    await act(async () => {
      ws.onclose?.({ code: 4001, wasClean: false })
    })

    // Advance timers to see if reconnect fires
    await act(async () => { vi.advanceTimersByTime(5000) })

    // Should NOT have created a new WS instance
    expect(wsInstances.length).toBe(initialCount)
  })

  it('does not reconnect when WS closes with code 4003 (forbidden)', async () => {
    await act(async () => {
      render(<MemoryRouter><WarRoom /></MemoryRouter>)
    })

    const initialCount = wsInstances.length
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => { ws.onopen?.() })

    await act(async () => {
      ws.onclose?.({ code: 4003, wasClean: false })
    })

    await act(async () => { vi.advanceTimersByTime(5000) })

    expect(wsInstances.length).toBe(initialCount)
  })
})
