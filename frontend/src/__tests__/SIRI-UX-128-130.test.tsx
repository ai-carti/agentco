/**
 * SIRI-UX-128: expandedMessages Set not reset on companyId change
 * SIRI-UX-130: FilterBar buttons should use role="menuitemcheckbox" not role="menuitem"
 */
import React, { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

// ---- helpers ----

const LONG_CONTENT = 'A'.repeat(130) // > 120 chars — triggers expand/collapse

const TASKS = [
  { id: 't1', title: 'Task one', status: 'todo' as const, assignee_id: 'a1', assignee_name: 'Alice', priority: 'high' as const },
]
const AGENTS = [
  { id: 'a1', name: 'Alice', role: 'Dev', status: 'idle' as const },
]

function renderKanban() {
  useAgentStore.setState({ tasks: TASKS, agents: AGENTS })
  return render(
    <ToastProvider>
      <KanbanBoard companyId="c1" />
    </ToastProvider>,
  )
}

// ============================
// SIRI-UX-128
// ============================
describe('SIRI-UX-128: expandedMessages reset on companyId change', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWarRoomStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * This test verifies that when the component is unmounted (company changed)
   * and remounted with a new companyId, the expandedMessages set is empty.
   * This documents the fix: useEffect([companyId]) resets expandedMessages.
   */
  it('expandedMessages is empty on fresh mount — messages with same ID appear collapsed', () => {
    // First render: comp-1
    const { unmount } = render(
      <MemoryRouter initialEntries={['/companies/comp-1/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    act(() => { vi.advanceTimersByTime(100) })

    // Add a long message and expand it
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-long-1',
        senderName: 'CEO',
        targetName: 'CTO',
        content: LONG_CONTENT,
        timestamp: new Date().toISOString(),
        type: 'task',
      })
    })

    // The outer div with role="button" is the expandable container
    const expandable = screen.getByRole('button', { name: /CEO/i })
    fireEvent.click(expandable)

    // After click, aria-expanded should be true
    expect(expandable.getAttribute('aria-expanded')).toBe('true')

    // Unmount (simulate navigating away from comp-1)
    unmount()
    useWarRoomStore.getState().reset()

    // Second render: comp-2 — expandedMessages should start empty
    render(
      <MemoryRouter initialEntries={['/companies/comp-2/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    act(() => { vi.advanceTimersByTime(100) })

    // Add same message id as before
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-long-1',
        senderName: 'CEO',
        targetName: 'CTO',
        content: LONG_CONTENT,
        timestamp: new Date().toISOString(),
        type: 'task',
      })
    })

    // The message must appear collapsed — expandedMessages was reset
    const expandable2 = screen.getByRole('button', { name: /CEO/i })
    expect(expandable2.getAttribute('aria-expanded')).toBe('false')
  })

  it('expandedMessages resets when companyId param changes via in-router navigation', () => {
    // Use a NavTrigger inside the router to trigger real navigation
    let navigateFn: ((path: string) => void) | null = null

    function NavCapture() {
      const { useNavigate } = require('react-router-dom')
      navigateFn = useNavigate()
      return null
    }

    render(
      <MemoryRouter initialEntries={['/companies/comp-A/warroom']}>
        <NavCapture />
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    act(() => { vi.advanceTimersByTime(100) })

    // Add long message and expand it in comp-A
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-long-2',
        senderName: 'CEO',
        targetName: 'CTO',
        content: LONG_CONTENT,
        timestamp: new Date().toISOString(),
        type: 'task',
      })
    })

    const expandable = screen.getByRole('button', { name: /CEO/i })
    fireEvent.click(expandable)
    expect(expandable.getAttribute('aria-expanded')).toBe('true')

    // Navigate to comp-B via router — same WarRoomPage instance, companyId param changes
    act(() => { navigateFn!('/companies/comp-B/warroom') })
    act(() => { vi.advanceTimersByTime(100) })

    // After reset, manually inject agents (simulates loadMockData running after navigation)
    // and add same message id in comp-B context
    act(() => {
      useWarRoomStore.getState().loadMockData()
      useWarRoomStore.getState().addMessage({
        id: 'msg-long-2',
        senderName: 'CEO',
        targetName: 'CTO',
        content: LONG_CONTENT,
        timestamp: new Date().toISOString(),
        type: 'task',
      })
    })

    // expandedMessages should have been cleared — message appears collapsed
    const expandable2 = screen.getByRole('button', { name: /CEO/i })
    expect(expandable2.getAttribute('aria-expanded')).toBe('false')
  })
})

// ============================
// SIRI-UX-130
// ============================
describe('SIRI-UX-130: FilterBar buttons use role="menuitemcheckbox"', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Agent filter options have role="menuitemcheckbox" not "menuitem"', () => {
    renderKanban()
    act(() => { vi.advanceTimersByTime(100) })

    const agentBtn = screen.getByTestId('filter-agent-btn')
    fireEvent.click(agentBtn)

    const agentOption = screen.getByTestId('filter-agent-option-a1')
    expect(agentOption.getAttribute('role')).toBe('menuitemcheckbox')
    expect(agentOption.getAttribute('role')).not.toBe('menuitem')
  })

  it('Priority filter options have role="menuitemcheckbox" not "menuitem"', () => {
    renderKanban()
    act(() => { vi.advanceTimersByTime(100) })

    const priorityBtn = screen.getByTestId('filter-priority-btn')
    fireEvent.click(priorityBtn)

    const priorityOption = screen.getByTestId('filter-priority-option-high')
    expect(priorityOption.getAttribute('role')).toBe('menuitemcheckbox')
    expect(priorityOption.getAttribute('role')).not.toBe('menuitem')
  })

  it('aria-checked is valid on role="menuitemcheckbox" elements', () => {
    renderKanban()
    act(() => { vi.advanceTimersByTime(100) })

    // Open agent filter and check that aria-checked is present with correct role
    const agentBtn = screen.getByTestId('filter-agent-btn')
    fireEvent.click(agentBtn)

    const agentOption = screen.getByTestId('filter-agent-option-a1')
    expect(agentOption.getAttribute('role')).toBe('menuitemcheckbox')
    // aria-checked should be present (it's valid on menuitemcheckbox)
    expect(agentOption.hasAttribute('aria-checked')).toBe(true)
  })
})
