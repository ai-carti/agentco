/**
 * Tests for SIRI-UX-125, SIRI-UX-126, SIRI-UX-127
 * Run: npm test -- --run SIRI-UX-125-127
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'
import type { FeedMessage } from '../store/warRoomStore'

// ──────────────────────────────────────────────────────────────────────────────
// SIRI-UX-125: addMessage must NOT increment cost
// In real WS mode, cost comes exclusively from llm_token → addCost(data.cost).
// addMessage double-counted cost by adding a fixed $0.0031 per message.
// ──────────────────────────────────────────────────────────────────────────────
describe('SIRI-UX-125: warRoomStore.addMessage does not mutate cost', () => {
  beforeEach(() => {
    useWarRoomStore.getState().reset()
  })

  it('cost stays 0 after addMessage when no addCost called', () => {
    const msg: FeedMessage = {
      id: 'msg-1',
      senderId: 'agent-1',
      senderName: 'Alex',
      targetId: 'agent-2',
      targetName: 'Jordan',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    }
    useWarRoomStore.getState().addMessage(msg)
    expect(useWarRoomStore.getState().cost).toBe(0)
  })

  it('cost reflects only addCost calls, not addMessage calls', () => {
    const msg: FeedMessage = {
      id: 'msg-2',
      senderId: 'agent-1',
      senderName: 'Alex',
      targetId: 'agent-2',
      targetName: 'Jordan',
      content: 'Another message',
      timestamp: new Date().toISOString(),
    }
    // Simulate real WS: llm_token adds real cost
    useWarRoomStore.getState().addCost(0.0054)
    // message event fires
    useWarRoomStore.getState().addMessage(msg)
    // Cost should be exactly what addCost set — no extra per-message charge
    expect(useWarRoomStore.getState().cost).toBe(0.0054)
  })

  it('multiple messages do not drift cost', () => {
    const makeMsg = (i: number): FeedMessage => ({
      id: `msg-${i}`,
      senderId: 'agent-1',
      senderName: 'Alex',
      targetId: 'agent-2',
      targetName: 'Jordan',
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    })
    for (let i = 0; i < 10; i++) {
      useWarRoomStore.getState().addMessage(makeMsg(i))
    }
    // No llm_token events → cost must remain 0
    expect(useWarRoomStore.getState().cost).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// SIRI-UX-126: addMessage correctly appends messages to state
// (complementary to SIRI-UX-125 — ensures fix doesn't break message storage)
// ──────────────────────────────────────────────────────────────────────────────
describe('SIRI-UX-126: addMessage still stores messages correctly', () => {
  beforeEach(() => {
    useWarRoomStore.getState().reset()
  })

  it('messages array grows after addMessage', () => {
    const msg: FeedMessage = {
      id: 'msg-ok',
      senderId: 's1',
      senderName: 'Sender',
      targetId: 't1',
      targetName: 'Target',
      content: 'Test content',
      timestamp: new Date().toISOString(),
    }
    expect(useWarRoomStore.getState().messages).toHaveLength(0)
    useWarRoomStore.getState().addMessage(msg)
    expect(useWarRoomStore.getState().messages).toHaveLength(1)
    expect(useWarRoomStore.getState().messages[0].content).toBe('Test content')
  })
})
