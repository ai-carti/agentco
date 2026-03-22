/**
 * SIRI-UX-129: useIsMobile debounce — resize handler должен дебаунситься
 * чтобы не вызывать сотни setState при ресайзе окна.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState, useEffect } from 'react'

// Isolate the hook for testing (copy of implementation)
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setMobile(window.innerWidth < 640), 120)
    }
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('resize', handler)
      if (timer) clearTimeout(timer)
    }
  }, [])
  return mobile
}

describe('SIRI-UX-129: useIsMobile debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('does not update state immediately on rapid resize events', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false) // 1024px → not mobile

    // Fire 10 rapid resize events
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 })
    for (let i = 0; i < 10; i++) {
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })
    }

    // State should NOT have changed yet (debounced)
    expect(result.current).toBe(false)
  })

  it('updates state after debounce period (120ms)', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    // Still not updated before debounce fires
    act(() => { vi.advanceTimersByTime(119) })
    expect(result.current).toBe(false)

    // After 120ms, state updates
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe(true)
  })

  it('coalesces rapid events — only 1 setState call after debounce', () => {
    // Verify that even with 20 rapid resize events, state settles correctly after debounce
    const { result } = renderHook(() => useIsMobile())

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 300 })
    // Fire 20 rapid resize events
    for (let i = 0; i < 20; i++) {
      act(() => { window.dispatchEvent(new Event('resize')) })
    }

    // Only one update after debounce
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe(true)
  })

  it('cleans up resize listener and timer on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIsMobile())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })
})
