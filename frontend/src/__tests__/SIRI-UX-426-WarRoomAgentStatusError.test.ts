// SIRI-UX-426: WarRoomAgentStatus must include 'error' to match backend AgentStatus
import { describe, it, expect } from 'vitest'
import type { WarRoomAgentStatus } from '../store/warRoomStore'

describe('SIRI-UX-426 — WarRoomAgentStatus includes error', () => {
  it("'error' is a valid WarRoomAgentStatus value", () => {
    const status: WarRoomAgentStatus = 'error'
    expect(status).toBe('error')
  })

  it('all expected statuses are valid WarRoomAgentStatus values', () => {
    const statuses: WarRoomAgentStatus[] = ['idle', 'thinking', 'running', 'done', 'error']
    expect(statuses).toHaveLength(5)
    expect(statuses).toContain('error')
  })
})
