import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWarRoomSocket } from '../hooks/useWarRoomSocket'
import { useWarRoomStore } from '../store/warRoomStore'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null

  static instances: MockWebSocket[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  triggerMessage(data: unknown) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) })
    this.onmessage?.(event)
  }

  triggerClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED
    const event = new CloseEvent('close', { code, wasClean: code === 1000 })
    this.onclose?.(event)
  }

  triggerError() {
    this.onerror?.(new Event('error'))
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code: 1000, wasClean: true }))
  }

  send(_data: string) {}
}

beforeEach(() => {
  vi.useFakeTimers()
  MockWebSocket.instances = []
  // @ts-ignore
  global.WebSocket = MockWebSocket
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useWarRoomSocket', () => {
  it('connects to correct WebSocket URL', () => {
    renderHook(() => useWarRoomSocket('run-123'))
    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0].url).toMatch(/ws:\/\/.+:8000\/ws\/runs\/run-123\/events/)
  })

  it('returns isConnected=false initially', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    expect(result.current.isConnected).toBe(false)
  })

  it('returns isConnected=true after open', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    expect(result.current.isConnected).toBe(true)
  })

  it('returns isConnected=false after close', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => { MockWebSocket.instances[0].triggerClose() })
    expect(result.current.isConnected).toBe(false)
  })

  it('returns events array', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    expect(Array.isArray(result.current.events)).toBe(true)
  })

  it('adds event to events array on message', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'evt-1',
        senderId: 'agent-1',
        senderName: 'CEO',
        targetId: 'agent-2',
        targetName: 'Dev',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      })
    })
    expect(result.current.events.length).toBe(1)
    expect(result.current.events[0].id).toBe('evt-1')
  })

  it('updates warRoomStore on message event (adds to feed)', () => {
    renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-ws-1',
        senderId: 'agent-1',
        senderName: 'CEO',
        targetId: 'agent-2',
        targetName: 'Dev',
        content: 'Task assigned',
        timestamp: new Date().toISOString(),
      })
    })
    const msgs = useWarRoomStore.getState().messages
    expect(msgs.some((m) => m.id === 'msg-ws-1')).toBe(true)
  })

  it('updates agent status in store on agent_status event', () => {
    // Pre-load agents
    act(() => { useWarRoomStore.getState().loadMockData() })
    renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'agent_status',
        agentId: 'agent-1',
        status: 'done',
      })
    })
    const agent = useWarRoomStore.getState().agents.find((a) => a.id === 'agent-1')
    expect(agent?.status).toBe('done')
  })

  it('sets error on error event', () => {
    const { result } = renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].triggerError() })
    expect(result.current.error).toBeTruthy()
  })

  it('reconnects with exponential backoff on close', () => {
    renderHook(() => useWarRoomSocket('run-1'))
    const ws1 = MockWebSocket.instances[0]
    act(() => { ws1.open() })
    act(() => { ws1.triggerClose(1006) })

    // After 1s backoff, should reconnect
    act(() => { vi.advanceTimersByTime(1000) })
    expect(MockWebSocket.instances.length).toBe(2)
  })

  it('uses exponential backoff: 1s, 2s, 4s', () => {
    renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => { MockWebSocket.instances[0].triggerClose(1006) })

    // 1st reconnect at 1000ms
    act(() => { vi.advanceTimersByTime(1000) })
    expect(MockWebSocket.instances.length).toBe(2)

    // 2nd disconnect → reconnect at 2000ms
    act(() => { MockWebSocket.instances[1].open() })
    act(() => { MockWebSocket.instances[1].triggerClose(1006) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(MockWebSocket.instances.length).toBe(3)

    // 3rd disconnect → reconnect at 4000ms
    act(() => { MockWebSocket.instances[2].open() })
    act(() => { MockWebSocket.instances[2].triggerClose(1006) })
    act(() => { vi.advanceTimersByTime(4000) })
    expect(MockWebSocket.instances.length).toBe(4)
  })

  it('does not reconnect on clean close (code 1000)', () => {
    renderHook(() => useWarRoomSocket('run-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => { MockWebSocket.instances[0].triggerClose(1000) })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('closes WebSocket on unmount', () => {
    const closeSpy = vi.fn()
    const { unmount } = renderHook(() => useWarRoomSocket('run-1'))
    MockWebSocket.instances[0].close = closeSpy
    unmount()
    expect(closeSpy).toHaveBeenCalled()
  })
})
