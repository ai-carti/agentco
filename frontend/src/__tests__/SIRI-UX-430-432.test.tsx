import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

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
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/WarRoomPage.tsx'),
      'utf-8',
    )
    // Should import useAutoScroll
    expect(src).toContain('useAutoScroll')
    // Should NOT have unconditional scrollIntoView in a useEffect dependent only on messages.length
    // The old pattern: feedEndRef.current.scrollIntoView({ behavior: 'smooth' }) triggered every time
    expect(src).not.toMatch(/scrollIntoView\(\{.*behavior.*smooth.*\}\)/)
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
    const src = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    )
    expect(src).toContain('skip-to-content')
    expect(src).toContain('#main-content')
  })

  it('AppLayout renders a main landmark with id="main-content"', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    )
    expect(src).toContain('id="main-content"')
  })
})
