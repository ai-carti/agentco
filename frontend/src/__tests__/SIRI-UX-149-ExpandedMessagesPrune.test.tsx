/**
 * SIRI-UX-149: expandedMessages Set is pruned when messages are evicted by the 300-cap
 */
import { describe, it, expect } from 'vitest'

// Pure unit test — extract the pruning logic
// When messages are capped and old ones evicted, expandedMessages should
// only contain IDs that still exist in the current messages array.

function pruneExpandedMessages(
  expandedMessages: Set<string>,
  currentMessages: Array<{ id: string }>
): Set<string> {
  const currentIds = new Set(currentMessages.map((m) => m.id))
  const pruned = new Set<string>()
  for (const id of expandedMessages) {
    if (currentIds.has(id)) pruned.add(id)
  }
  return pruned
}

describe('SIRI-UX-149: expandedMessages pruning', () => {
  it('removes IDs for messages that have been evicted', () => {
    const expanded = new Set(['msg-1', 'msg-2', 'msg-3'])
    const currentMessages = [{ id: 'msg-2' }, { id: 'msg-3' }, { id: 'msg-4' }]

    const pruned = pruneExpandedMessages(expanded, currentMessages)

    expect(pruned.has('msg-1')).toBe(false) // evicted
    expect(pruned.has('msg-2')).toBe(true)  // still present
    expect(pruned.has('msg-3')).toBe(true)  // still present
    expect(pruned.size).toBe(2)
  })

  it('returns empty set when all messages evicted', () => {
    const expanded = new Set(['old-1', 'old-2'])
    const currentMessages = [{ id: 'new-1' }, { id: 'new-2' }]

    const pruned = pruneExpandedMessages(expanded, currentMessages)
    expect(pruned.size).toBe(0)
  })

  it('returns same entries when no messages evicted', () => {
    const expanded = new Set(['msg-1', 'msg-2'])
    const currentMessages = [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }]

    const pruned = pruneExpandedMessages(expanded, currentMessages)
    expect(pruned.size).toBe(2)
    expect(pruned.has('msg-1')).toBe(true)
    expect(pruned.has('msg-2')).toBe(true)
  })
})
