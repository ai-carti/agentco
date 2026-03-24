/**
 * SIRI-UX-290: TASK_LIMIT must be module-level (not inside component)
 * SIRI-UX-291: handleCreateAgent must be wrapped in useCallback
 *
 * We validate by reading the source and checking the patterns.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// NOTE: This test intentionally reads the source file to check structural patterns.
// We use readFileSync from Node.js — this runs in vitest (Node runtime), not browser.

const srcPath = resolve(__dirname, '../components/CompanyPage.tsx')
const src = readFileSync(srcPath, 'utf-8')

describe('SIRI-UX-290: TASK_LIMIT is module-level constant', () => {
  it('TASK_LIMIT is declared outside the component function', () => {
    // Module-level means it appears before "export default function CompanyPage"
    const taskLimitIndex = src.indexOf('const TASK_LIMIT')
    const componentIndex = src.indexOf('export default function CompanyPage')
    expect(taskLimitIndex).toBeGreaterThan(-1)
    expect(componentIndex).toBeGreaterThan(-1)
    expect(taskLimitIndex).toBeLessThan(componentIndex)
  })

  it('TASK_LIMIT is not re-declared inside the component body', () => {
    const componentBodyStart = src.indexOf('export default function CompanyPage')
    const bodySlice = src.slice(componentBodyStart)
    // Should not contain another const TASK_LIMIT inside component body
    expect(bodySlice).not.toMatch(/^\s*const TASK_LIMIT\s*=/m)
  })
})

describe('SIRI-UX-291: handleCreateAgent is wrapped in useCallback', () => {
  it('handleCreateAgent uses useCallback', () => {
    expect(src).toMatch(/handleCreateAgent\s*=\s*useCallback\s*\(/)
  })

  it('handleCreateAgent useCallback has dependency array', () => {
    // Find the closing deps array pattern — useCallback ends with ], [deps])
    // Since the function body spans multiple lines, we just check for the closing pattern
    expect(src).toMatch(/\}, \[id, toast\]\)/)
  })
})
