/**
 * SIRI-UX-419: warRoomStore — mockMsgCounter — module-level mutable counter leaks between tests.
 * `let mockMsgCounter = 0` at module level does not reset between test files unless reset() is called.
 * Fix: reset() action must reset mockMsgCounter to 0 so tests calling getNextMockEvent see a clean slate.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useWarRoomStore, getNextMockEvent } from '../store/warRoomStore'

const MOCK_AGENTS = [
  { id: 'a1', name: 'Alpha', role: 'CEO', status: 'idle' as const, avatar: '👔', level: 0 },
  { id: 'a2', name: 'Beta', role: 'CPO', status: 'running' as const, avatar: '🎯', level: 1 },
]

beforeEach(() => {
  // Call reset() before each test — this is the prescribed fix
  useWarRoomStore.getState().reset()
})

describe('SIRI-UX-419: mockMsgCounter resets via reset() action', () => {
  it('getNextMockEvent produces id mock-interval-1 after reset()', () => {
    const event = getNextMockEvent(MOCK_AGENTS)
    expect(event.message.id).toBe('mock-interval-1')
  })

  it('calling reset() between invocations resets the counter back to 1', () => {
    // Advance counter
    getNextMockEvent(MOCK_AGENTS)
    getNextMockEvent(MOCK_AGENTS)

    // Reset via store action
    useWarRoomStore.getState().reset()

    // Counter should be back to 0 → next id is mock-interval-1
    const event = getNextMockEvent(MOCK_AGENTS)
    expect(event.message.id).toBe('mock-interval-1')
  })

  it('counter is NOT contaminated by prior test — reset() in beforeEach guarantees clean state', () => {
    // If mockMsgCounter leaked from previous test it would not be 0 here
    // But because beforeEach calls reset(), counter should always start at 0
    const first = getNextMockEvent(MOCK_AGENTS)
    expect(first.message.id).toBe('mock-interval-1')
  })
})
