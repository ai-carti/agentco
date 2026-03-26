/**
 * SIRI-UX-371: warRoomStore — prevStatuses field is dead code, should be removed.
 *
 * `prevStatuses` accumulated entries on every updateAgentStatus call but was
 * never read by any component or selector — pure memory overhead. Removing it
 * eliminates the object spread in updateAgentStatus and reduces store size.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useWarRoomStore } from '../store/warRoomStore'

describe('SIRI-UX-371: warRoomStore has no prevStatuses field', () => {
  beforeEach(() => {
    useWarRoomStore.getState().reset()
  })

  it('store state does not have prevStatuses key', () => {
    const state = useWarRoomStore.getState()
    expect('prevStatuses' in state).toBe(false)
  })

  it('updateAgentStatus works correctly without prevStatuses', () => {
    useWarRoomStore.getState().setAgents([
      { id: 'a1', name: 'Alex', role: 'CEO', status: 'thinking', avatar: '👔', level: 0 },
    ])
    useWarRoomStore.getState().updateAgentStatus('a1', 'done')
    const agent = useWarRoomStore.getState().agents.find((a) => a.id === 'a1')
    expect(agent?.status).toBe('done')
  })

  it('reset() does not include prevStatuses in state', () => {
    useWarRoomStore.getState().reset()
    const state = useWarRoomStore.getState()
    expect('prevStatuses' in state).toBe(false)
  })
})
