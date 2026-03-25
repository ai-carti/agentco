/**
 * SIRI-UX-293: KanbanBoard runError paragraph must have role="alert"
 *
 * runError appears dynamically — without role="alert" screen readers don't announce it.
 * Pattern: same fix as AuthPage (SIRI-UX-283) and WarRoomPage (SIRI-UX-289).
 */
import { describe, it, expect } from 'vitest'

// We test by reading the source — the pattern check is simplest and avoids
// complex fetch mocking for a structural lint-style test.
const modules = import.meta.glob('../components/KanbanBoard.tsx', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../components/KanbanBoard.tsx'] as string

describe('SIRI-UX-293: runError has role="alert"', () => {
  it('run-error paragraph has role="alert"', () => {
    // The run-error p element must have role="alert"
    expect(src).toMatch(/data-testid=\{`run-error-\$\{task\.id\}`\}/)
    // Check that role="alert" appears near the run-error testid
    const runErrorIdx = src.indexOf('data-testid={`run-error-${task.id}`}')
    const snippet = src.slice(Math.max(0, runErrorIdx - 30), runErrorIdx + 100)
    expect(snippet).toMatch(/role="alert"/)
  })
})

// Component smoke test: verify error boundary doesn't swallow the role
describe('SIRI-UX-293: KanbanBoard imports fine', () => {
  it('source file contains role="alert" on run-error paragraph', () => {
    // Structural check: role="alert" should appear before the runError content
    const idx = src.indexOf('run-error-${task.id}')
    expect(idx).toBeGreaterThan(-1)
    // Find the surrounding paragraph tag
    const regionStart = src.lastIndexOf('<p', idx)
    const regionEnd = src.indexOf('</p>', idx)
    const pTag = src.slice(regionStart, regionEnd + 4)
    expect(pTag).toMatch(/role="alert"/)
  })
})
