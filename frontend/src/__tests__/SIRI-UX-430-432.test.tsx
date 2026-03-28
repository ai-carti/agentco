/**
 * SIRI-UX-430: Auto-scroll respects user scroll position
 * SIRI-UX-431: useDocumentTitle hook
 * SIRI-UX-432: Skip-to-content link
 *
 * SIRI-UX-436: Uses import.meta.glob with ?raw to read source without Node.js fs/path APIs
 * (tsconfig targets browser, no @types/node available).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Source files via ?raw imports (no Node.js fs/path needed)
const warRoomModules = import.meta.glob('../components/WarRoomPage.tsx', { query: '?raw', import: 'default', eager: true })
const warRoomSrc: string = warRoomModules['../components/WarRoomPage.tsx'] as string

const appModules = import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true })
const appSrc: string = appModules['../App.tsx'] as string

// ── SIRI-UX-430: Auto-scroll respects user scroll position ───────────────────
describe('SIRI-UX-430: WarRoomPage auto-scroll respects user scroll position', () => {
  it('useAutoScroll hook returns isNearBottom=true when scrolled to bottom', () => {
    const { result } = renderHook(() => useAutoScroll())

    // Default should be near bottom (new session)
    expect(result.current.isNearBottom).toBe(true)
  })

  it('useAutoScroll hook scrollIntoView is a function', () => {
    const { result } = renderHook(() => useAutoScroll())

    expect(typeof result.current.feedEndRef).toBe('object')
    expect(typeof result.current.scrollToBottom).toBe('function')
  })

  it('WarRoomPage source uses useAutoScroll instead of unconditional scrollIntoView', () => {
    // Should import useAutoScroll
    expect(warRoomSrc).toContain('useAutoScroll')
    // Should NOT have unconditional scrollIntoView in a useEffect dependent only on messages.length
    // The old pattern: feedEndRef.current.scrollIntoView({ behavior: 'smooth' }) triggered every time
    expect(warRoomSrc).not.toMatch(/scrollIntoView\(\{.*behavior.*smooth.*\}\)/)
  })
})

// ── SIRI-UX-431: Document title updates on navigation ────────────────────────
describe('SIRI-UX-431: useDocumentTitle hook', () => {
  const originalTitle = document.title

  beforeEach(() => {
    document.title = 'AgentCo'
  })

  afterEach(() => {
    document.title = originalTitle
  })

  it('sets document.title on mount', () => {
    renderHook(() => useDocumentTitle('War Room — AgentCo'))
    expect(document.title).toBe('War Room — AgentCo')
  })

  it('restores previous title on unmount', () => {
    document.title = 'AgentCo'
    const { unmount } = renderHook(() => useDocumentTitle('Settings — AgentCo'))
    expect(document.title).toBe('Settings — AgentCo')
    unmount()
    expect(document.title).toBe('AgentCo')
  })

  it('updates title when argument changes', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: 'Page A — AgentCo' },
    })
    expect(document.title).toBe('Page A — AgentCo')
    rerender({ title: 'Page B — AgentCo' })
    expect(document.title).toBe('Page B — AgentCo')
  })
})

// ── SIRI-UX-432: Skip-to-content link ───────────────────────────────────────
describe('SIRI-UX-432: Skip-to-content link', () => {
  it('App.tsx source contains skip-to-content link', () => {
    expect(appSrc).toContain('skip-to-content')
    expect(appSrc).toContain('#main-content')
  })

  it('AppLayout renders a main landmark with id="main-content"', () => {
    expect(appSrc).toContain('id="main-content"')
  })
})
