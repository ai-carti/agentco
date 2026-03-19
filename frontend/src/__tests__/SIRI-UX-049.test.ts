import { describe, it, expect } from 'vitest'
import { getInitials, getAvatarColor, STATUS_COLORS, AVATAR_COLORS } from '../utils/taskUtils'

// SIRI-UX-049: shared task utilities
describe('SIRI-UX-049: taskUtils shared utilities', () => {
  describe('getInitials', () => {
    it('returns 2-char initials for two-word names', () => {
      expect(getInitials('John Doe')).toBe('JD')
    })

    it('returns first 2 chars for single-word name', () => {
      expect(getInitials('CEO')).toBe('CE')
    })

    it('handles extra whitespace', () => {
      expect(getInitials('  Alice  Bob  ')).toBe('AB')
    })
  })

  describe('getAvatarColor', () => {
    it('returns a color from AVATAR_COLORS array', () => {
      const color = getAvatarColor('CEO')
      expect(AVATAR_COLORS).toContain(color)
    })

    it('is deterministic for same name', () => {
      expect(getAvatarColor('Alice')).toBe(getAvatarColor('Alice'))
    })

    it('returns different colors for different names', () => {
      const colors = new Set(['CEO', 'CPO', 'SWE', 'CTO', 'CFO', 'COO', 'CMO', 'CRO'].map(getAvatarColor))
      expect(colors.size).toBeGreaterThan(1)
    })
  })

  describe('STATUS_COLORS', () => {
    it('has entries for all expected statuses', () => {
      expect(STATUS_COLORS.todo).toBeTruthy()
      expect(STATUS_COLORS.backlog).toBeTruthy()
      expect(STATUS_COLORS.in_progress).toBeTruthy()
      expect(STATUS_COLORS.done).toBeTruthy()
      expect(STATUS_COLORS.failed).toBeTruthy()
    })

    it('each status has bg and text properties', () => {
      Object.values(STATUS_COLORS).forEach((s) => {
        expect(s.bg).toBeTruthy()
        expect(s.text).toBeTruthy()
      })
    })
  })
})
