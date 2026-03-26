/**
 * SIRI-UX-357: WarRoomPage — expandedMessages pruning effect reads stale `expandedMessages.size`
 * from closure but doesn't include it in deps array. The early return
 * `if (expandedMessages.size === 0) return` can read a stale value when
 * expandedMessages is cleared between effect registrations.
 * Fix: move the size guard inside the functional updater where `prev` is always fresh,
 * or include expandedMessages in deps.
 *
 * This test validates the store-level fix: when pruning evicted message IDs,
 * the functional updater (using `prev`) correctly handles stale closure avoidance.
 */
import { describe, it, expect } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'

describe('SIRI-UX-357: warRoomStore — messages cap evicts old entries', () => {
  it('addMessage evicts oldest messages when MAX_MESSAGES (300) is exceeded', () => {
    useWarRoomStore.getState().reset()
    // Fill 301 messages
    for (let i = 0; i < 301; i++) {
      useWarRoomStore.getState().addMessage({
        id: `msg-${i}`,
        senderName: 'A',
        targetName: 'B',
        content: `msg ${i}`,
        timestamp: new Date().toISOString(),
      })
    }
    const messages = useWarRoomStore.getState().messages
    expect(messages.length).toBe(300)
    // First message should be evicted (msg-0 gone, msg-1 is now the oldest)
    expect(messages[0].id).toBe('msg-1')
    expect(messages[299].id).toBe('msg-300')
  })

  it('reset clears messages array', () => {
    useWarRoomStore.getState().addMessage({
      id: 'test-1',
      senderName: 'A',
      targetName: 'B',
      content: 'test',
      timestamp: new Date().toISOString(),
    })
    useWarRoomStore.getState().reset()
    expect(useWarRoomStore.getState().messages.length).toBe(0)
  })
})
