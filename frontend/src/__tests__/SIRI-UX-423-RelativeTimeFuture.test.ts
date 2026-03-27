/**
 * SIRI-UX-423: relativeTime() returns negative strings for future ISO timestamps.
 * If a task/run has started_at in the future (clock skew or server time mismatch),
 * diffMs is negative → sec is negative → output is e.g. "-5s ago" which is nonsense.
 * Fix: clamp to 0 so the minimum output is "0s ago".
 */
import { describe, it, expect } from 'vitest'
import { relativeTime } from '../utils/taskUtils'

describe('SIRI-UX-423: relativeTime — negative diff guard', () => {
  it('returns "0s ago" for a future timestamp 5 seconds ahead', () => {
    const futureIso = new Date(Date.now() + 5_000).toISOString()
    expect(relativeTime(futureIso)).toBe('0s ago')
  })

  it('returns "0s ago" for a future timestamp 1 hour ahead', () => {
    const futureIso = new Date(Date.now() + 3_600_000).toISOString()
    expect(relativeTime(futureIso)).toBe('0s ago')
  })

  it('still returns "?" for invalid ISO', () => {
    expect(relativeTime('not-a-date')).toBe('?')
  })

  it('still returns correct relative time for past timestamps', () => {
    const pastIso = new Date(Date.now() - 65_000).toISOString()
    expect(relativeTime(pastIso)).toBe('1m ago')
  })

  it('still returns correct relative time for a past 2-hour timestamp', () => {
    const pastIso = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(relativeTime(pastIso)).toBe('2h ago')
  })
})
