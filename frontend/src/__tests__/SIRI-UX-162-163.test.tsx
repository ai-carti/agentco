/**
 * SIRI-UX-162: history item without description — cursor/role fix
 * SIRI-UX-163: WarRoom initial REST fetch — AbortController fix
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'
import { ToastProvider } from '../context/ToastContext'

// ── AgentPage helpers ──────────────────────────────────────────────────────────

function renderAgentPage(agentId = 'agent-1', companyId = 'c1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── SIRI-UX-162 ───────────────────────────────────────────────────────────────

describe('SIRI-UX-162: history item cursor/role', () => {
  it('history item without description has cursor:default', async () => {
    const tasks = [
      { id: 't1', title: 'No-desc task', status: 'done', created_at: '2026-03-10T10:00:00Z' },
    ]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderAgentPage()
    await waitFor(() => expect(screen.getByText('No-desc task')).toBeInTheDocument())

    // Find the outermost div wrapping the history item (closest div with inline style)
    const titleEl = screen.getByText('No-desc task')
    // Walk up to find the item container (has padding style)
    let el: HTMLElement | null = titleEl
    while (el && !el.style?.cursor) {
      el = el.parentElement
    }
    expect(el?.style.cursor).toBe('default')
  })

  it('history item without description has no role="button"', async () => {
    const tasks = [
      { id: 't1', title: 'No-desc task', status: 'done', created_at: '2026-03-10T10:00:00Z' },
    ]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderAgentPage()
    await waitFor(() => expect(screen.getByText('No-desc task')).toBeInTheDocument())

    // There should be no role=button ancestor for this item
    const item = screen.getByText('No-desc task').closest('[role="button"]')
    expect(item).toBeNull()
  })

  it('history item without description has tabIndex != 0', async () => {
    const tasks = [
      { id: 't1', title: 'No-desc task', status: 'done', created_at: '2026-03-10T10:00:00Z' },
    ]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderAgentPage()
    await waitFor(() => expect(screen.getByText('No-desc task')).toBeInTheDocument())

    // Walk up to find the item container
    const titleEl = screen.getByText('No-desc task')
    let el: HTMLElement | null = titleEl
    while (el && !el.style?.cursor) {
      el = el.parentElement
    }
    // tabIndex should not be 0 (either -1, unset, or not present)
    expect(el?.tabIndex).not.toBe(0)
  })

  it('history item WITH description retains cursor:pointer and role="button"', async () => {
    const tasks = [
      { id: 't2', title: 'With-desc task', status: 'done', created_at: '2026-03-10T10:00:00Z', description: 'Some details' },
    ]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderAgentPage()
    await waitFor(() => expect(screen.getByText('With-desc task')).toBeInTheDocument())

    const item = screen.getByRole('button', { name: /With-desc task/i })
    expect(item).toBeTruthy()
    expect((item as HTMLElement).style.cursor).toBe('pointer')
  })
})

// ── SIRI-UX-163 ───────────────────────────────────────────────────────────────

describe('SIRI-UX-163: WarRoom initial fetch uses AbortController', () => {
  // BUG-070: reset module cache so AbortController mock applies to a fresh WarRoom import
  beforeEach(() => {
    vi.resetModules()
  })

  it('passes signal to the initial REST fetch', async () => {
    // Spy on AbortController
    const abortSpy = vi.fn()
    const origAC = globalThis.AbortController
    const mockSignal = { aborted: false }
    globalThis.AbortController = vi.fn().mockImplementation(() => ({
      signal: mockSignal,
      abort: abortSpy,
    })) as unknown as typeof AbortController

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    globalThis.fetch = fetchMock

    // Mock WebSocket to prevent real connection
    const origWS = globalThis.WebSocket
    globalThis.WebSocket = vi.fn().mockImplementation(() => ({
      onopen: null,
      onmessage: null,
      onclose: null,
      close: vi.fn(),
    })) as unknown as typeof WebSocket

    // Set up stores with token/companyId
    const { useAuthStore } = await import('../store/authStore')
    const { useAgentStore } = await import('../store/agentStore')
    const origToken = useAuthStore.getState().token
    const origCompany = useAgentStore.getState().currentCompany
    useAuthStore.setState({ token: 'test-token' } as any)
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } } as any)

    const { default: WarRoom } = await import('../components/WarRoom')

    render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/runs'),
        expect.objectContaining({ signal: mockSignal }),
      )
    })

    // Restore
    useAuthStore.setState({ token: origToken } as any)
    useAgentStore.setState({ currentCompany: origCompany } as any)
    globalThis.AbortController = origAC
    globalThis.WebSocket = origWS
  })

  it('aborts fetch on unmount (no setState on unmounted component)', async () => {
    const abortSpy = vi.fn()
    const origAC = globalThis.AbortController
    globalThis.AbortController = vi.fn().mockImplementation(() => ({
      signal: { aborted: false },
      abort: abortSpy,
    })) as unknown as typeof AbortController

    // Fetch that never resolves (in-flight)
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))

    const origWS = globalThis.WebSocket
    globalThis.WebSocket = vi.fn().mockImplementation(() => ({
      onopen: null,
      onmessage: null,
      onclose: null,
      close: vi.fn(),
    })) as unknown as typeof WebSocket

    const { useAuthStore } = await import('../store/authStore')
    const { useAgentStore } = await import('../store/agentStore')
    useAuthStore.setState({ token: 'test-token' } as any)
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } } as any)

    const { default: WarRoom } = await import('../components/WarRoom')

    const { unmount } = render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>,
    )

    unmount()

    expect(abortSpy).toHaveBeenCalled()

    globalThis.AbortController = origAC
    globalThis.WebSocket = origWS
  })
})
