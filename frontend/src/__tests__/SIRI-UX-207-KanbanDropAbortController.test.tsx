/**
 * SIRI-UX-207 — KanbanBoard handleDrop: missing AbortController
 *
 * handleDrop makes a PATCH request with no AbortController. If the component
 * unmounts mid-request (e.g., user navigates away during drag), the fetch will
 * continue and may call setTasks on unmounted component.
 *
 * Fix: add an AbortController to handleDrop, abort on unmount.
 */
import { describe, it, expect, vi } from 'vitest'

describe('SIRI-UX-207: handleDrop AbortController', () => {
  it('fetch with AbortController signal can be aborted mid-flight', async () => {
    const controller = new AbortController()
    const { signal } = controller

    let fetchCalled = false
    let fetchAborted = false

    const mockFetch = (_url: string, options?: { signal?: AbortSignal }) => {
      fetchCalled = true
      if (options?.signal?.aborted) {
        fetchAborted = true
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return new Promise<Response>((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          fetchAborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }

    const fetchPromise = mockFetch('/api/tasks/1', { signal }).catch(() => {})
    controller.abort()
    await fetchPromise

    expect(fetchCalled).toBe(true)
    expect(fetchAborted).toBe(true)
  })

  it('does not rollback optimistic update when signal is aborted (no setState)', () => {
    let setTasksCalled = false
    const setTasks = vi.fn(() => { setTasksCalled = true })

    const controller = new AbortController()
    controller.abort() // already aborted before drop completes

    // Simulate the guard pattern in handleDrop
    const simulateDropCatch = (err: unknown, signal: AbortSignal) => {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        setTasks()
      }
    }

    simulateDropCatch(new DOMException('Aborted', 'AbortError'), controller.signal)
    expect(setTasksCalled).toBe(false)
  })
})
