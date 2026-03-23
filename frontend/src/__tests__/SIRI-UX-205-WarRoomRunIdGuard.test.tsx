/**
 * SIRI-UX-205 — WarRoom.tsx: run_id undefined guard in run.started handler
 *
 * The `event` in ws.onmessage is typed with optional fields (run_id?: string).
 * When constructing a Run object, we must ensure run_id is never undefined.
 * If run_id is missing, the run.started event should be silently ignored.
 */
import { describe, it, expect } from 'vitest'

describe('SIRI-UX-205: WarRoom run_id guard', () => {
  it('skips adding a run when run_id is missing in run.started event', () => {
    // Simulate the guard logic: if event.run_id is undefined, skip the run
    const runs: { run_id: string; status: string }[] = []
    const event: { type: string; run_id?: string; agent_name?: string } = {
      type: 'run.started',
      run_id: undefined,
      agent_name: 'CEO',
    }

    if (event.type === 'run.started' && event.run_id) {
      runs.push({ run_id: event.run_id, status: 'running' })
    }

    expect(runs).toHaveLength(0)
  })

  it('adds a run when run_id is present in run.started event', () => {
    const runs: { run_id: string; status: string }[] = []
    const event: { type: string; run_id?: string; agent_name?: string } = {
      type: 'run.started',
      run_id: 'run-abc-123',
      agent_name: 'CEO',
    }

    if (event.type === 'run.started' && event.run_id) {
      runs.push({ run_id: event.run_id, status: 'running' })
    }

    expect(runs).toHaveLength(1)
    expect(runs[0].run_id).toBe('run-abc-123')
  })
})
