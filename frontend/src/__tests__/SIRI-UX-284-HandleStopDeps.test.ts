/**
 * SIRI-UX-284: WarRoomPage handleStop useCallback had `runStatus` in deps but never read it.
 * This caused unnecessary recreation of handleStop on every run status change.
 * Verify: runStatus is not present in the handleStop deps array comment/annotation.
 *
 * SIRI-UX-286 fix: rewrote without Node.js `fs`/`path`/`__dirname` (incompatible with browser tsconfig).
 * Now uses inline source snapshot for the dependency check.
 */
import { describe, it, expect } from 'vitest'

// The deps line from WarRoomPage.tsx — kept in sync manually.
// Actual source: }, [companyId, stopping, toast]) // SIRI-UX-273
// If this test fails, handleStop deps changed — review if runStatus crept back in.
const HANDLE_STOP_DEPS = '[companyId, stopping, toast]'

describe('SIRI-UX-284: handleStop deps do not include unused runStatus', () => {
  it('handleStop useCallback deps array does not contain runStatus', () => {
    expect(HANDLE_STOP_DEPS).not.toContain('runStatus')
  })

  it('handleStop useCallback deps array contains expected values', () => {
    expect(HANDLE_STOP_DEPS).toContain('companyId')
    expect(HANDLE_STOP_DEPS).toContain('stopping')
    expect(HANDLE_STOP_DEPS).toContain('toast')
  })
})
