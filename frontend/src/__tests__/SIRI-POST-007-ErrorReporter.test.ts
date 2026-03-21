/**
 * SIRI-POST-007 — ErrorBoundary: structured error reporting (TDD)
 *
 * AC:
 * - dev: console.error plain format (unchanged)
 * - production, no DSN: structured console.error with JSON payload
 * - production + DSN: Sentry.captureException called
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

const { mockCaptureException, mockWithScope } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockWithScope: vi.fn((cb: (scope: unknown) => void) => cb({ setExtras: vi.fn() })),
}))

vi.mock('@sentry/react', () => ({
  captureException: mockCaptureException,
  withScope: mockWithScope,
  init: vi.fn(),
}))

import { reportError } from '../utils/errorReporter'

describe('SIRI-POST-007: errorReporter', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('dev mode: calls console.error with plain prefix (no JSON wrapping)', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_SENTRY_DSN', '')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('test error')
    reportError(error, { componentStack: '\n    at Broken\n    at App' })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy.mock.calls[0][0]).toBe('[ErrorBoundary] caught:')
    consoleSpy.mockRestore()
  })

  it('production without DSN: calls console.error with JSON payload', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', '')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('prod error')
    reportError(error, { componentStack: '\n    at Broken' })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy.mock.calls[0][0]).toBe('[ErrorBoundary]')

    const rawPayload = consoleSpy.mock.calls[0][1]
    expect(typeof rawPayload).toBe('string')
    const parsed = JSON.parse(rawPayload as string)
    expect(parsed).toMatchObject({
      level: 'error',
      message: 'prod error',
      componentStack: expect.any(String),
      timestamp: expect.any(String),
    })
    consoleSpy.mockRestore()
  })

  it('production without DSN: JSON payload has ISO timestamp', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', '')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('ts'), { componentStack: '' })

    const payload = JSON.parse(consoleSpy.mock.calls[0][1] as string)
    expect(() => new Date(payload.timestamp as string).toISOString()).not.toThrow()
    consoleSpy.mockRestore()
  })

  it('production without DSN: JSON payload includes error name', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', '')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new TypeError('type problem'), { componentStack: 'stack' })

    const payload = JSON.parse(consoleSpy.mock.calls[0][1] as string)
    expect(payload.name).toBe('TypeError')
    consoleSpy.mockRestore()
  })

  it('production with DSN: calls Sentry.captureException (not console.error)', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://fake@sentry.io/123')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('sentry error')
    reportError(error, { componentStack: '\n    at App' })

    expect(mockWithScope).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(error)
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('production with DSN: does not call console.error', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://fake@sentry.io/123')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('no log please'), { componentStack: '' })

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
