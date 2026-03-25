/**
 * SIRI-UX-294: WarRoomPage Stop button disabled condition must not be duplicated
 *
 * The condition `runStatus === 'idle' || runStatus === 'done' || ...` was repeated
 * twice verbatim. Fix: extract to const isStopDisabled.
 */
import { describe, it, expect } from 'vitest'

const modules = import.meta.glob('../components/WarRoomPage.tsx', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../components/WarRoomPage.tsx'] as string

describe('SIRI-UX-294: Stop button disabled condition is not duplicated', () => {
  it('isStopDisabled constant is declared', () => {
    expect(src).toMatch(/const isStopDisabled\s*=/)
  })

  it('raw condition string does not appear twice', () => {
    // The old duplicated condition
    const condition = "runStatus === 'idle' || runStatus === 'done' || runStatus === 'failed' || runStatus === 'stopped'"
    const occurrences = src.split(condition).length - 1
    // After fix, the condition should appear at most once (in the const declaration)
    expect(occurrences).toBeLessThanOrEqual(1)
  })

  it('Stop button uses isStopDisabled for disabled prop', () => {
    expect(src).toMatch(/disabled=\{.*isStopDisabled.*\}/)
  })
})
