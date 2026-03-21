/**
 * SIRI-UX-126: unit tests for payload validation in useWarRoomSocket
 * Validates that malformed `message` events (missing id or non-string content)
 * are silently dropped and never reach addMessage / warRoomStore.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWarRoomSocket } from '../hooks/useWarRoomSocket'
import { useWarRoomStore } from '../store/warRoomStore'

// ── Minimal MockWebSocket ─────────────────────────────────────────────────────
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
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
  globalThis.WebSocket = MockWebSocket
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ── SIRI-UX-126: payload validation guard ────────────────────────────────────
describe('SIRI-UX-126: useWarRoomSocket payload validation for message events', () => {
  it('ignores message event with missing id — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        // id is absent
        content: 'Hello world',
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('ignores message event with id=null — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: null,
        content: 'Hello world',
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('ignores message event with non-string content (number) — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-bad',
        content: 42, // number, not string
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('ignores message event with content=undefined — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-no-content',
        // content absent
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('ignores message event with content=null — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-null-content',
        content: null,
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('ignores message event with content=object — store stays empty', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-obj-content',
        content: { text: 'nested' },
        senderId: 'agent-1',
        senderName: 'Alex',
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
  })

  it('accepts valid message event with id and string content', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    act(() => {
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-valid',
        content: 'Valid message',
        senderId: 'agent-1',
        senderName: 'Alex',
        targetId: 'agent-2',
        targetName: 'Bob',
        timestamp: new Date().toISOString(),
      })
    })
    expect(useWarRoomStore.getState().messages).toHaveLength(1)
    expect(useWarRoomStore.getState().messages[0].id).toBe('msg-valid')
    expect(useWarRoomStore.getState().messages[0].content).toBe('Valid message')
  })

  it('accepts multiple valid messages and ignores interleaved malformed ones', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })

    act(() => {
      // valid
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-1',
        content: 'First',
        senderId: 'a', senderName: 'A', targetId: 'b', targetName: 'B',
        timestamp: new Date().toISOString(),
      })
    })
    act(() => {
      // malformed — no id
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        content: 'Second (bad)',
        senderId: 'a', senderName: 'A',
      })
    })
    act(() => {
      // valid
      MockWebSocket.instances[0].triggerMessage({
        type: 'message',
        id: 'msg-3',
        content: 'Third',
        senderId: 'a', senderName: 'A', targetId: 'b', targetName: 'B',
        timestamp: new Date().toISOString(),
      })
    })

    const msgs = useWarRoomStore.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0].id).toBe('msg-1')
    expect(msgs[1].id).toBe('msg-3')
  })

  it('does not throw on malformed message event', () => {
    renderHook(() => useWarRoomSocket('comp-1'))
    act(() => { MockWebSocket.instances[0].open() })
    expect(() => {
      act(() => {
        MockWebSocket.instances[0].triggerMessage({
          type: 'message',
          // completely missing id and content
        })
      })
    }).not.toThrow()
  })
})
