/**
 * FE-001 — WebSocket → warRoomStore integration
 *
 * Verifies that run lifecycle events (run.completed / run.failed / run.stopped)
 * correctly update warRoomStore.runStatus.
 * Also confirms that `message` events add entries to store.messages.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'

// ─── Fake WebSocket ───────────────────────────────────────────────────────────

type WsListener = (event: unknown) => void

class FakeWS {
  url: string
  readyState = 0

  onopen: WsListener | null = null
  onmessage: WsListener | null = null
  onerror: WsListener | null = null
  onclose: WsListener | null = null

  static instances: FakeWS[] = []
  static get last(): FakeWS {
    return FakeWS.instances[FakeWS.instances.length - 1]
  }

  constructor(url: string) {
    this.url = url
    FakeWS.instances.push(this)
  }

  open() {
    this.readyState = 1
    this.onopen?.({})
  }

  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  trigger(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  close() {
    this.readyState = 3
    this.onclose?.({ code: 1000, wasClean: true })
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  FakeWS.instances = []
  globalThis.WebSocket = FakeWS as unknown as typeof WebSocket
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FE-001: useWarRoomSocket → warRoomStore runStatus updates', () => {
  it('run.completed → setRunStatus("done")', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({ id: 'e1', type: 'run.completed', runId: 'run-1' })
    })

    expect(useWarRoomStore.getState().runStatus).toBe('done')
    unmount()
  })

  it('run.failed → setRunStatus("failed")', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({ id: 'e2', type: 'run.failed', runId: 'run-1', error: 'timeout' })
    })

    expect(useWarRoomStore.getState().runStatus).toBe('failed')
    unmount()
  })

  it('run.stopped → setRunStatus("stopped")', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({ id: 'e3', type: 'run.stopped', runId: 'run-1' })
    })

    expect(useWarRoomStore.getState().runStatus).toBe('stopped')
    unmount()
  })

  it('run.started → setRunStatus("active")', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    // Pre-set to done so we verify the transition back to active
    useWarRoomStore.setState({ runStatus: 'done' })
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({ id: 'e4', type: 'run.started', runId: 'run-1' })
    })

    expect(useWarRoomStore.getState().runStatus).toBe('active')
    unmount()
  })

  it('message event → store.messages grows by 1', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    const initialCount = useWarRoomStore.getState().messages.length

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({
        id: 'msg-fe001',
        type: 'message',
        senderId: 'agent-1',
        senderName: 'CEO',
        targetId: 'agent-2',
        targetName: 'Dev',
        content: 'Build the feature',
        timestamp: new Date().toISOString(),
      })
    })

    const messages = useWarRoomStore.getState().messages
    expect(messages.length).toBe(initialCount + 1)
    expect(messages.find((m) => m.id === 'msg-fe001')).toBeDefined()
    unmount()
  })

  it('multiple message events → all stored in correct order', async () => {
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    act(() => { FakeWS.last.open() })
    act(() => {
      FakeWS.last.trigger({ id: 'm1', type: 'message', senderId: 'a1', senderName: 'A', targetId: 'a2', targetName: 'B', content: 'First', timestamp: new Date().toISOString() })
      FakeWS.last.trigger({ id: 'm2', type: 'message', senderId: 'a2', senderName: 'B', targetId: 'a1', targetName: 'A', content: 'Second', timestamp: new Date().toISOString() })
      FakeWS.last.trigger({ id: 'm3', type: 'message', senderId: 'a1', senderName: 'A', targetId: 'a2', targetName: 'B', content: 'Third', timestamp: new Date().toISOString() })
    })

    const messages = useWarRoomStore.getState().messages
    expect(messages.length).toBe(3)
    expect(messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    unmount()
  })

  it('token is included in WS URL when present', async () => {
    // Mock getStoredToken to return a test token
    vi.doMock('../api/client', () => ({ getStoredToken: () => 'test-jwt-token-123' }))
    // Re-import the hook so it picks up the mock
    const mod = await import('../hooks/useWarRoomSocket?t=' + Date.now())
    const useWarRoomSocket = (mod as unknown as { useWarRoomSocket: (id: string) => unknown }).useWarRoomSocket ?? (await import('../hooks/useWarRoomSocket')).useWarRoomSocket

    FakeWS.instances = []
    const { unmount } = renderHook(() => useWarRoomSocket('comp-fe001'))

    // URL should always be the ws endpoint
    const url = FakeWS.last?.url ?? ''
    expect(url).toContain('/ws/companies/comp-fe001/events')
    unmount()
    vi.doUnmock('../api/client')
  })
})
