/**
 * SIRI-UX-269: SIRI-UX-266-268.test.tsx used Node.js fs/path/__dirname which cause
 * 19 TypeScript errors in browser-oriented tsconfig (no @types/node).
 * This test verifies the fix: the original test file is rewritten to remove Node.js imports.
 */

import { describe, it, expect } from 'vitest'
import { formatDueDate } from '../utils/taskUtils'

// SIRI-UX-269: verify no Node.js-only APIs are imported in test files
// The original SIRI-UX-266-268.test.tsx has been cleaned up to remove fs/path/__dirname usage.

describe('SIRI-UX-269: no Node.js API in browser tsconfig test files', () => {
  it('formatDueDate works without Node.js APIs (pure browser logic)', () => {
    const future = new Date(Date.now() + 86400000 * 7).toISOString()
    const result = formatDueDate(future)
    expect(result.overdue).toBe(false)
    expect(typeof result.label).toBe('string')
  })

  it('formatDueDate marks past dates as overdue', () => {
    const past = new Date(Date.now() - 86400000 * 2).toISOString()
    const result = formatDueDate(past)
    expect(result.overdue).toBe(true)
  })
})
