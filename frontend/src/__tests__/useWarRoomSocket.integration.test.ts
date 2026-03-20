/**
 * FE-001 — useWarRoomSocket Integration Smoke Test
 *
 * Uses a fake WebSocket implementation via globalThis.WebSocket mock.
 * Verifies connection URL, event handling, and reconnect behaviour.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'

// ─── Fake WebSocket ───────────────────────────────────────────────────────────

type WsListener = (event: unknown) => void

class FakeWebSocket {
  url: string
  readyState: number = 0 // CONNECTING

  onopen: WsListener | null = null
  onmessage: WsListener | null = null
  onerror: WsListener | null = null
  onclose: WsListener | null = null

  static OPEN = 1
  static CLOSED = 3

  // Registry so tests can grab the latest instance
  static instances: FakeWebSocket[] = []
  static get last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  }

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  /** Simulate server accepting the connection */
  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  /** Simulate receiving a message from the server */
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  /** Simulate a clean server-initiated close (code 1000) */
  triggerCleanClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code: 1000, wasClean: true })
  }

  /** Simulate an unclean disconnect (network drop, etc.) */
  triggerUncleanClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code: 1006, wasClean: false })
  }

  /** Simulate a socket-level error */
  triggerError() {
    this.onerror?.({})
  }

  close() {
    if (this.readyState !== FakeWebSocket.CLOSED) {
      this.readyState = FakeWebSocket.CLOSED
      this.onclose?.({ code: 1000, wasClean: true })
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function importHook() {
  // Dynamic import so module-level URL constant is re-evaluated per test when needed
  return import('../hooks/useWarRoomSocket').then((m) => m.useWarRoomSocket)
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  // Install fake WebSocket globally (no global. — only globalThis.)
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useWarRoomSocket — FE-001 integration smoke test', () => {
  it('connects to the correct WebSocket URL derived from VITE_API_URL', async () => {
    const useWarRoomSocket = await importHook()
    const { unmount } = renderHook(() => useWarRoomSocket('company-42'))

    // Hook should have created a WebSocket immediately
    expect(FakeWebSocket.instances).toHaveLength(1)

    // URL must be the WS equivalent of the API base URL + the events path
    const wsUrl = FakeWebSocket.last.url
    expect(wsUrl).toMatch(/^wss?:\/\//)
    expect(wsUrl).toContain('/ws/companies/company-42/events')

    unmount()
  })

  it('isConnected becomes true when WebSocket opens', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    expect(result.current.isConnected).toBe(false)

    act(() => { FakeWebSocket.last.triggerOpen() })

    expect(result.current.isConnected).toBe(true)
    unmount()
  })

  it('handles llm_token event — stored in events array', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })

    const tokenEvent = { id: 'evt-1', type: 'llm_token', token: 'Hello', agentId: 'agent-1' }
    act(() => { FakeWebSocket.last.triggerMessage(tokenEvent) })

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].type).toBe('llm_token')
    expect(result.current.events[0].id).toBe('evt-1')
    unmount()
  })

  it('handles run.started event — stored in events array', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })

    const runStarted = { id: 'evt-2', type: 'run.started', runId: 'run-99', agentId: 'agent-2' }
    act(() => { FakeWebSocket.last.triggerMessage(runStarted) })

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].type).toBe('run.started')
    unmount()
  })

  it('handles run.completed event — stored in events array', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })

    const runCompleted = { id: 'evt-3', type: 'run.completed', runId: 'run-99', cost: 0.005 }
    act(() => { FakeWebSocket.last.triggerMessage(runCompleted) })

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].type).toBe('run.completed')
    unmount()
  })

  it('handles run.failed event — stored in events array', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })

    const runFailed = { id: 'evt-4', type: 'run.failed', runId: 'run-99', error: 'timeout' }
    act(() => { FakeWebSocket.last.triggerMessage(runFailed) })

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].type).toBe('run.failed')
    unmount()
  })

  it('accumulates multiple events in order', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })

    act(() => {
      FakeWebSocket.last.triggerMessage({ id: 'e1', type: 'run.started' })
      FakeWebSocket.last.triggerMessage({ id: 'e2', type: 'llm_token', token: 'Hi' })
      FakeWebSocket.last.triggerMessage({ id: 'e3', type: 'run.completed' })
    })

    expect(result.current.events).toHaveLength(3)
    expect(result.current.events.map((e) => e.type)).toEqual([
      'run.started',
      'llm_token',
      'run.completed',
    ])
    unmount()
  })

  it('isConnected becomes false when WebSocket disconnects', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })
    expect(result.current.isConnected).toBe(true)

    act(() => { FakeWebSocket.last.triggerUncleanClose() })
    expect(result.current.isConnected).toBe(false)

    unmount()
  })

  it('sets error state on WebSocket error', async () => {
    const useWarRoomSocket = await importHook()
    const { result, unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })
    act(() => { FakeWebSocket.last.triggerError() })

    expect(result.current.error).not.toBeNull()
    unmount()
  })

  it('reconnects after unclean disconnect (exponential backoff)', async () => {
    const useWarRoomSocket = await importHook()
    const { unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })
    const firstWs = FakeWebSocket.last

    // Simulate network drop
    act(() => { firstWs.triggerUncleanClose() })

    // Should schedule reconnect — advance timers past the 1s initial backoff
    act(() => { vi.advanceTimersByTime(1100) })

    // A second WebSocket instance should have been created
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2)
    expect(FakeWebSocket.last).not.toBe(firstWs)

    unmount()
  })

  it('does NOT reconnect after clean close (code 1000)', async () => {
    const useWarRoomSocket = await importHook()
    const { unmount } = renderHook(() => useWarRoomSocket('company-1'))

    act(() => { FakeWebSocket.last.triggerOpen() })
    act(() => { FakeWebSocket.last.triggerCleanClose() })

    // Advance well past backoff window
    act(() => { vi.advanceTimersByTime(5000) })

    // No new WebSocket should have been created
    expect(FakeWebSocket.instances).toHaveLength(1)

    unmount()
  })
})
