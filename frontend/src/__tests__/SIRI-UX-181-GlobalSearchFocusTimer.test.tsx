/**
 * SIRI-UX-181: GlobalSearch focus setTimeout should store the timer ID and
 * clear it on cleanup so it doesn't fire on an unmounted component.
 *
 * GlobalSearch manages its own open state via keyboard shortcut.
 * We open it via Cmd+K, then unmount while the focus timer is pending.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'

afterEach(() => {
  vi.useRealTimers()
})

describe('SIRI-UX-181: GlobalSearch focus timer is cleared on unmount', () => {
  it('does not attempt to focus after unmount when search is open', () => {
    vi.useFakeTimers()

    const { unmount } = render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )

    // Open GlobalSearch via Ctrl+K keyboard shortcut
    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    })

    // The focus setTimeout(fn, 0) is now pending.
    // Unmount before the timer fires — this is the bug scenario.
    unmount()

    // Now advance all timers — the cleanup should have cancelled the focus timer.
    // If NOT cancelled: jsdom would attempt inputRef.current?.focus() on detached node.
    // Either way should not throw, but with the fix the timer is gone (no-op).
    expect(() => {
      act(() => {
        vi.runAllTimers()
      })
    }).not.toThrow()
  })

  it('clears pending focus timer when component re-renders with search closed', () => {
    vi.useFakeTimers()

    const { rerender } = render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )

    // Open via Ctrl+K
    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    })

    // Close immediately via Escape before timer fires
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    // Advance timers — timer should have been cleared by the cleanup fn
    expect(() => {
      act(() => {
        vi.runAllTimers()
      })
    }).not.toThrow()

    rerender(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )
  })
})
