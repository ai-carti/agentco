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

/**
 * BUG-081: warRoomStore.ts:updateAgentStatus — redundant Set creation when agentId
 * already in flashingAgents. If shouldFlash=true but agentId already in the set,
 * a new Set with identical contents was created. useShallow sees new ref → extra re-render.
 * Fix: guard `if (shouldFlash && state.flashingAgents.has(agentId)) return state;`
 */
describe('BUG-081: updateAgentStatus — no redundant Set when agentId already flashing', () => {
  it('returns same state reference when shouldFlash=true but agentId already in flashingAgents', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()

    // agent-1 starts as 'thinking' — trigger first flash (thinking→done)
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'done')
    expect(useWarRoomStore.getState().flashingAgents.has('agent-1')).toBe(true)

    // Manually set agent-1 back to thinking so a second flash can be attempted
    useWarRoomStore.setState((s) => ({
      agents: s.agents.map((a) => a.id === 'agent-1' ? { ...a, status: 'thinking' } : a),
    }))

    const setRefBefore = useWarRoomStore.getState().flashingAgents

    // Second thinking→done while agent-1 is ALREADY in flashingAgents
    // BUG-081 guard should return same state (same Set reference)
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'done')
    const setRefAfter = useWarRoomStore.getState().flashingAgents

    // Must be same reference — no new Set created
    expect(setRefAfter).toBe(setRefBefore)
  })

  it('still creates a new Set when a different agentId is added to flashingAgents', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()

    // agent-1 starts as 'thinking' — flash it first
    useWarRoomStore.getState().updateAgentStatus('agent-1', 'done')
    expect(useWarRoomStore.getState().flashingAgents.has('agent-1')).toBe(true)

    // agent-2 starts as 'running' — flash agent-2 (different id, not in set yet)
    const setRefBefore = useWarRoomStore.getState().flashingAgents
    useWarRoomStore.getState().updateAgentStatus('agent-2', 'done')
    const setRefAfter = useWarRoomStore.getState().flashingAgents

    // New Set must be created since agent-2 was not already in flashingAgents
    expect(setRefAfter).not.toBe(setRefBefore)
    expect(setRefAfter.has('agent-1')).toBe(true)
    expect(setRefAfter.has('agent-2')).toBe(true)
  })
})
