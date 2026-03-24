// SIRI-UX-238: formatTimeHMS and truncate must be exported from taskUtils
import { describe, it, expect } from 'vitest'
import { formatTimeHMS, truncate } from '../utils/taskUtils'

describe('SIRI-UX-238: taskUtils shared utilities', () => {
  describe('formatTimeHMS', () => {
    it('formats ISO string into HH:MM:SS time string', () => {
      // Use a fixed date so the test is deterministic across locales
      const iso = '2024-01-15T14:30:45.000Z'
      const result = formatTimeHMS(iso)
      // Should contain digits and colons (time format)
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/)
    })

    it('returns a non-empty string for valid ISO', () => {
      const result = formatTimeHMS(new Date().toISOString())
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('truncate', () => {
    it('returns text unchanged when within limit', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('truncates and appends ellipsis when over limit', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })

    it('returns text unchanged when exactly at limit', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('handles empty string', () => {
      expect(truncate('', 5)).toBe('')
    })
  })
})
