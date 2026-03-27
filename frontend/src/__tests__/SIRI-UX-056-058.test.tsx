/**
 * SIRI-UX-056: WarRoomPage activity feed messages keyboard accessibility
 * SIRI-UX-057: TaskDetailSidebar close button aria-label
 * SIRI-UX-058: AgentPage history items keyboard accessibility
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { useWarRoomStore } from '../store/warRoomStore'
import WarRoomPage from '../components/WarRoomPage'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import AgentPage from '../components/AgentPage'

// ----- SIRI-UX-056: WarRoomPage activity feed messages keyboard accessibility -----

describe('SIRI-UX-056: WarRoomPage feed messages keyboard accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useWarRoomStore.getState().reset()
    // SIRI-UX-222: loadMockData requires VITE_MOCK_WAR_ROOM flag — enable for tests that need agents
    vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  function renderWarRoom() {
    return render(
      <MemoryRouter initialEntries={['/companies/co1/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<ToastProvider><WarRoomPage /></ToastProvider>} />
        </Routes>
      </MemoryRouter>
    )
  }

  function addLongAndShortMessages() {
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-short',
        senderId: 'a1',
        senderName: 'CEO',
        targetId: 'a2',
        targetName: 'CFO',
        content: 'Short message',
        timestamp: new Date().toISOString(),
      })
      useWarRoomStore.getState().addMessage({
        id: 'msg-long',
        senderId: 'a1',
        senderName: 'CEO',
        targetId: 'a2',
        targetName: 'CFO',
        content: 'A'.repeat(150), // > 120 chars — triggers expand/collapse
        timestamp: new Date().toISOString(),
      })
    })
  }

  it('long messages have role="button" for keyboard accessibility', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    const longMsgEl = messages.find((el) => el.getAttribute('role') === 'button')
    expect(longMsgEl).toBeTruthy()
  })

  it('long messages have tabIndex=0', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    const longMsgEl = messages.find((el) => el.getAttribute('tabindex') === '0')
    expect(longMsgEl).toBeTruthy()
  })

  it('long messages have aria-expanded=false initially', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    const longMsgEl = messages.find((el) => el.getAttribute('aria-expanded') !== null)
    expect(longMsgEl).toBeTruthy()
    expect(longMsgEl?.getAttribute('aria-expanded')).toBe('false')
  })

  it('long message expands on Enter key press', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    const longMsgEl = messages.find((el) => el.getAttribute('role') === 'button') as HTMLElement
    expect(longMsgEl.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(longMsgEl, { key: 'Enter', code: 'Enter' })
    expect(longMsgEl.getAttribute('aria-expanded')).toBe('true')
  })

  it('long message collapses on second Enter key press', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    const longMsgEl = messages.find((el) => el.getAttribute('role') === 'button') as HTMLElement
    fireEvent.keyDown(longMsgEl, { key: 'Enter', code: 'Enter' })
    expect(longMsgEl.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(longMsgEl, { key: 'Enter', code: 'Enter' })
    expect(longMsgEl.getAttribute('aria-expanded')).toBe('false')
  })

  it('short messages do NOT have role="button"', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    addLongAndShortMessages()
    const messages = screen.getAllByTestId('feed-message')
    // At least one message should not have role=button (the short one)
    const nonButtonMsg = messages.find((el) => el.getAttribute('role') !== 'button')
    expect(nonButtonMsg).toBeTruthy()
  })
})

// ----- SIRI-UX-057: TaskDetailSidebar close button aria-label -----

describe('SIRI-UX-057: TaskDetailSidebar close button aria-label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    })
  })

  const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    status: 'todo' as const,
    assignee_id: undefined,
    assignee_name: undefined,
  }

  function renderSidebar() {
    const onClose = vi.fn()
    render(
      <ToastProvider>
        <TaskDetailSidebar task={mockTask} companyId="co1" onClose={onClose} />
      </ToastProvider>
    )
    return { onClose }
  }

  it('close button has aria-label="Close task details"', () => {
    // SIRI-UX-411: updated from "Close" to "Close task details" for descriptive label
    renderSidebar()
    const closeBtn = screen.getByTestId('sidebar-close-btn')
    expect(closeBtn).toHaveAttribute('aria-label', 'Close task details')
  })

  it('close button is accessible by aria-label role query', () => {
    renderSidebar()
    // SIRI-UX-411: label updated to "Close task details". Both the backdrop div and the
    // close button share this label, so use getAllByRole to avoid "multiple elements" error.
    const closeBtns = screen.getAllByRole('button', { name: 'Close task details' })
    const closeBtn = closeBtns.find((el) => el.tagName === 'BUTTON')
    expect(closeBtn).toBeInTheDocument()
  })
})

// ----- SIRI-UX-058: AgentPage history items keyboard accessibility -----

describe('SIRI-UX-058: AgentPage history items keyboard accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockFetchesWithHistory() {
    const historyItem = {
      id: 'task-h1',
      title: 'Completed Task',
      status: 'done',
      description: 'Task description here',
      created_at: '2026-01-01T00:00:00Z',
    }
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [historyItem] })
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'a1', name: 'Alice', role: 'Engineer', model: 'gpt-4o', system_prompt: '' }),
      })
    })
  }

  function renderAgentPage() {
    return render(
      <MemoryRouter initialEntries={['/companies/co1/agents/a1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('history items have role="button" for keyboard accessibility', async () => {
    mockFetchesWithHistory()
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })
    const historyItem = screen.getByText('Completed Task').closest('[role="button"]')
    expect(historyItem).toBeTruthy()
  })

  it('history items have tabIndex=0', async () => {
    mockFetchesWithHistory()
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })
    const historyItem = screen.getByText('Completed Task').closest('[tabindex="0"]')
    expect(historyItem).toBeTruthy()
  })

  it('history item has aria-expanded=false initially', async () => {
    mockFetchesWithHistory()
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })
    const historyItem = screen.getByText('Completed Task').closest('[role="button"]') as HTMLElement
    expect(historyItem.getAttribute('aria-expanded')).toBe('false')
  })

  it('history item expands on Enter key and shows description', async () => {
    mockFetchesWithHistory()
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })
    const historyItem = screen.getByText('Completed Task').closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(historyItem, { key: 'Enter', code: 'Enter' })
    expect(historyItem.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Task description here')).toBeInTheDocument()
  })

  it('history item expands on Space key', async () => {
    mockFetchesWithHistory()
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })
    const historyItem = screen.getByText('Completed Task').closest('[role="button"]') as HTMLElement
    fireEvent.keyDown(historyItem, { key: ' ', code: 'Space' })
    expect(historyItem.getAttribute('aria-expanded')).toBe('true')
  })
})
