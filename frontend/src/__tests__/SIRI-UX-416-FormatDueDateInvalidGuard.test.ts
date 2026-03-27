/**
 * SIRI-UX-416: taskUtils.formatDueDate — no guard for invalid date strings.
 * new Date('') and new Date('not-a-date') return Invalid Date.
 * Without a guard, label becomes "Invalid Date" and overdue=true (NaN < now is false in JS
 * but display text is broken). Fix: return a safe fallback when the date is invalid.
 */
import { describe, it, expect } from 'vitest'
import { formatDueDate } from '../utils/taskUtils'

describe('SIRI-UX-416: formatDueDate invalid-date guard', () => {
  it('returns label="?" and overdue=false for empty string', () => {
    const result = formatDueDate('')
    expect(result.label).not.toBe('Invalid Date')
    expect(result.label).toBe('?')
    expect(result.overdue).toBe(false)
  })

  it('returns label="?" for a non-date string', () => {
    const result = formatDueDate('not-a-date')
    expect(result.label).not.toBe('Invalid Date')
    expect(result.label).toBe('?')
  })

  it('still works for valid ISO dates', () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    const result = formatDueDate(future)
    expect(result.label).not.toBe('?')
    expect(result.overdue).toBe(false)
  })
})
