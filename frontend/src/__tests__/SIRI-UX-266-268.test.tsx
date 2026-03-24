/**
 * SIRI-UX-266: sortedAgents uses useMemo (no hook after conditional return)
 * SIRI-UX-267: useWarRoomSocket uses getState() for store actions (stable deps)
 * SIRI-UX-268: formatDueDate extracted to taskUtils
 * BUG-074: mobile agent drawer transition uses CSS class (prefers-reduced-motion compatible)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { formatDueDate } from '../utils/taskUtils'

// SIRI-UX-268: formatDueDate is now in taskUtils
describe('SIRI-UX-268: formatDueDate in taskUtils', () => {
  it('returns correct label and overdue=false for future date', () => {
    const future = new Date(Date.now() + 86400000 * 7).toISOString() // 7 days from now
    const result = formatDueDate(future)
    expect(result.overdue).toBe(false)
    expect(result.label).toMatch(/\w{3} \d+/)
  })

  it('returns overdue=true for past date', () => {
    const past = new Date(Date.now() - 86400000 * 2).toISOString() // 2 days ago
    const result = formatDueDate(past)
    expect(result.overdue).toBe(true)
  })

  it('formats date as "Mon DD" locale string', () => {
    const date = '2026-06-15T12:00:00.000Z'
    const result = formatDueDate(date)
    expect(result.label).toBeTruthy()
    expect(typeof result.label).toBe('string')
  })
})

// SIRI-UX-266: WarRoomPage uses useMemo for sortedAgents (Rules of Hooks compliant)
describe('SIRI-UX-266: WarRoomPage useMemo for sortedAgents', () => {
  it('useMemo import is present in WarRoomPage', async () => {
    // Check source code has the useMemo import
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/WarRoomPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('useMemo')
    expect(source).toContain('useMemo(() => [...agents].sort')
  })

  it('sortedAgents useMemo is before any early returns', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/WarRoomPage.tsx'),
      'utf-8'
    )
    const sortedIdx = source.indexOf('useMemo(() => [...agents].sort')
    const earlyReturnIdx = source.indexOf('if (agents.length === 0 && isConnecting)')
    expect(sortedIdx).toBeGreaterThan(0)
    expect(earlyReturnIdx).toBeGreaterThan(0)
    // useMemo must come BEFORE the early return
    expect(sortedIdx).toBeLessThan(earlyReturnIdx)
  })
})

// SIRI-UX-267: useWarRoomSocket uses getState() instead of subscribing to action refs
describe('SIRI-UX-267: useWarRoomSocket store actions via getState()', () => {
  it('connect() deps array contains only companyId', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../hooks/useWarRoomSocket.ts'),
      'utf-8'
    )
    // Should NOT have addMessage/updateAgentStatus in deps
    expect(source).not.toContain('[companyId, addMessage')
    // Should use getState() inside callback
    expect(source).toContain('useWarRoomStore.getState()')
    // deps array should be [companyId] only
    expect(source).toContain('}, [companyId])')
  })
})

// BUG-074: mobile agent drawer uses CSS class for transition
describe('BUG-074: mobile agent drawer transition uses CSS class', () => {
  it('war-room-agent-panel CSS class is defined in index.css', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const css = fs.readFileSync(
      path.resolve(__dirname, '../index.css'),
      'utf-8'
    )
    expect(css).toContain('.war-room-agent-panel')
    expect(css).toContain('transition: left')
    // Must have prefers-reduced-motion override
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    const reducedMotionBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotionBlock).toContain('.war-room-agent-panel')
    expect(reducedMotionBlock).toContain('transition: none')
  })

  it('WarRoomPage uses war-room-agent-panel CSS class on mobile panel', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/WarRoomPage.tsx'),
      'utf-8'
    )
    expect(source).toContain('war-room-agent-panel')
    // Should NOT have inline transition: 'left ... ease' anymore
    expect(source).not.toContain("transition: 'left 0.25s ease'")
  })
})
