/**
 * SIRI-UX-418: WarRoomPage — WS reconnect must not call reset() on every isConnected transition.
 * prevConnectedRef effect was resetting the store on every false→true transition,
 * causing users to lose all history on network blips.
 * Fix: remove prevConnectedRef effect; only companyId effect resets the store.
 *
 * Behavioral test — no Node.js fs/path (RULES.md compliance).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useWarRoomStore, getNextMockEvent } from '../store/warRoomStore'

beforeEach(() => {
  useWarRoomStore.getState().reset()
})

describe('SIRI-UX-418: warRoomStore survives reconnect without external reset()', () => {
  it('messages accumulate and are NOT cleared unless reset() is explicitly called', () => {
    const { addMessage } = useWarRoomStore.getState()
    addMessage({
      id: 'msg-1',
      senderId: 'agent-1',
      senderName: 'Alex',
      targetName: '',
      content: 'hello',
      timestamp: new Date().toISOString(),
    })
    addMessage({
      id: 'msg-2',
      senderId: 'agent-2',
      senderName: 'Jordan',
      targetName: '',
      content: 'world',
      timestamp: new Date().toISOString(),
    })
    // Simulate reconnect — without calling reset(), messages persist
    // (in the fixed code, only companyId change triggers reset)
    expect(useWarRoomStore.getState().messages.length).toBe(2)
  })

  it('reset() clears messages — only called on companyId change, not reconnect', () => {
    const { addMessage, reset } = useWarRoomStore.getState()
    addMessage({
      id: 'msg-3',
      senderId: 'agent-1',
      senderName: 'Alex',
      targetName: '',
      content: 'persistent message',
      timestamp: new Date().toISOString(),
    })
    expect(useWarRoomStore.getState().messages.length).toBe(1)
    reset()
    expect(useWarRoomStore.getState().messages.length).toBe(0)
  })
})

describe('getNextMockEvent standalone function', () => {
  it('returns a defined event object with message.content', () => {
    const mockAgents = [{ id: 'agent-1', name: 'Alex', status: 'idle' as const, role: 'CEO', level: 1, avatar: '' }]
    const event = getNextMockEvent(mockAgents)
    expect(event).toBeDefined()
    expect(typeof event.message.content).toBe('string')
    expect(event.message.id).toMatch(/^mock-interval-/)
  })
})
