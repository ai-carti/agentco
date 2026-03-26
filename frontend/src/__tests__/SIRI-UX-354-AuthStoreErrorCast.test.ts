/**
 * SIRI-UX-354: authStore — unsafe (err as Error).message cast
 * catch block receives `unknown`; if the thrown value is a plain string
 * or non-Error, `.message` will be `undefined`, silently clearing the error state.
 * Fix: use `err instanceof Error ? err.message : String(err)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../store/authStore'
import * as api from '../api/client'

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, isLoading: false, error: null, isInitialized: false })
  vi.restoreAllMocks()
})

describe('SIRI-UX-354: authStore error handling', () => {
  it('login — stores string error message when Error is thrown', async () => {
    vi.spyOn(api, 'login').mockRejectedValueOnce(new Error('Invalid credentials'))
    await useAuthStore.getState().login('a@b.com', 'wrong')
    expect(useAuthStore.getState().error).toBe('Invalid credentials')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('login — stores string representation when non-Error is thrown (string)', async () => {
    vi.spyOn(api, 'login').mockRejectedValueOnce('network failure')
    await useAuthStore.getState().login('a@b.com', 'pass')
    // Before fix: (err as Error).message would be undefined; after fix: 'network failure'
    expect(useAuthStore.getState().error).toBe('network failure')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('register — stores string error message when Error is thrown', async () => {
    vi.spyOn(api, 'register').mockRejectedValueOnce(new Error('Email taken'))
    await useAuthStore.getState().register('a@b.com', 'pass')
    expect(useAuthStore.getState().error).toBe('Email taken')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('register — stores string representation when non-Error is thrown (string)', async () => {
    vi.spyOn(api, 'register').mockRejectedValueOnce('quota exceeded')
    await useAuthStore.getState().register('a@b.com', 'pass')
    expect(useAuthStore.getState().error).toBe('quota exceeded')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})
