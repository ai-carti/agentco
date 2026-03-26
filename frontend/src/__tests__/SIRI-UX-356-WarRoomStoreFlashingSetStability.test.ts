/**
 * SIRI-UX-356: warRoomStore — updateAgentStatus always creates new Set for flashingAgents
 * even when shouldFlash=false. Since WarRoomPage uses useShallow, Object.is(prev, next) === false
 * for every agent status update triggers a re-render of the whole page.
 * Fix: return existing state.flashingAgents reference when no new flash is needed.
 */
import { describe, it, expect } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'

describe('SIRI-UX-356: flashingAgents Set stability in updateAgentStatus', () => {
  it('returns same flashingAgents reference when shouldFlash is false', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()

    // Start at idle (not thinking/running) → shouldFlash=false
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'idle')
    const before = useWarRoomStore.getState().flashingAgents

    // Update to another non-flash status: idle→thinking (should not flash)
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'thinking')
    const after = useWarRoomStore.getState().flashingAgents

    // Same reference = no unnecessary re-render
    expect(after).toBe(before)
  })

  it('returns NEW flashingAgents reference when shouldFlash is true (thinking→done)', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()

    // agent-1 starts as 'thinking' per MOCK_AGENTS
    const before = useWarRoomStore.getState().flashingAgents

    // thinking→done triggers flash
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'done')
    const after = useWarRoomStore.getState().flashingAgents

    // New reference + contains agent-1
    expect(after).not.toBe(before)
    expect(after.has('agent-1')).toBe(true)
  })

  it('clearFlash — returns same reference if agent not in set (no-op)', () => {
    useWarRoomStore.getState().reset()
    const before = useWarRoomStore.getState().flashingAgents

    // Clear an agent that is NOT flashing — no-op
    useWarRoomStore.getState().clearFlash('agent-999')
    const after = useWarRoomStore.getState().flashingAgents

    expect(after).toBe(before)
  })
})
