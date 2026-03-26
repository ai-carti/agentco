/**
 * SIRI-UX-375: ws.onerror must set isConnected=false
 *
 * When a WebSocket error fires, `onerror` was only setting `error` state
 * but NOT calling `setIsConnected(false)`. This means there's a window
 * between onerror and onclose where isConnected=true + error is set,
 * causing WarRoomPage to show the ws-error-banner while LIVE badge is
 * still active — a contradiction that confuses users.
 *
 * Fix: add `setIsConnected(false)` at the start of `ws.onerror`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('SIRI-UX-375: useWarRoomSocket — onerror sets isConnected to false', () => {
  let MockWebSocket: ReturnType<typeof vi.fn>
  let wsInstances: { onerror: ((e: Event) => void) | null; onopen: (() => void) | null; close: ReturnType<typeof vi.fn> }[]

  beforeEach(() => {
    wsInstances = []
    MockWebSocket = vi.fn().mockImplementation(() => {
      const instance = {
        onopen: null as (() => void) | null,
        onmessage: null,
        onerror: null as ((e: Event) => void) | null,
        onclose: null,
        close: vi.fn(),
        readyState: 0,
      }
      wsInstances.push(instance)
      return instance
    })
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets isConnected=false when onerror fires (even before onclose)', async () => {
    // Import dynamically to get fresh module
    const { renderHook } = await import('@testing-library/react')
    const { act } = await import('@testing-library/react')
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')

    let result: ReturnType<typeof renderHook<ReturnType<typeof useWarRoomSocket>, { companyId: string }>>

    await act(async () => {
      result = renderHook(
        ({ companyId }) => useWarRoomSocket(companyId),
        { initialProps: { companyId: 'test-company' } }
      )
    })

    // Simulate open so isConnected becomes true
    await act(async () => {
      wsInstances[0]?.onopen?.()
    })

    expect(result!.result.current.isConnected).toBe(true)

    // Now fire onerror without firing onclose
    await act(async () => {
      wsInstances[0]?.onerror?.(new Event('error'))
    })

    // After onerror, isConnected should be false and error should be set
    expect(result!.result.current.isConnected).toBe(false)
    expect(result!.result.current.error).toBe('WebSocket error')
  })
})
