/**
 * SIRI-UX-284: WarRoomPage handleStop useCallback had `runStatus` in deps but never read it.
 * This caused unnecessary recreation of handleStop on every run status change.
 * Verify: runStatus is not present in handleStop deps by checking the source.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('SIRI-UX-284: handleStop deps do not include unused runStatus', () => {
  it('WarRoomPage handleStop useCallback does not list runStatus in its deps array', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/WarRoomPage.tsx'),
      'utf-8'
    )
    // Match the deps array line that follows the handleStop body
    // The pattern: }, [companyId, stopping, runStatus, toast]) or similar
    // We want to ensure runStatus is NOT in the handleStop useCallback deps
    const handleStopBlock = src.split('const handleStop = useCallback')[1]?.split('}, [')[1]?.split('])')[0]
    // handleStopBlock is the deps list string e.g. "companyId, stopping, toast"
    expect(handleStopBlock).toBeDefined()
    expect(handleStopBlock).not.toContain('runStatus')
  })
})
