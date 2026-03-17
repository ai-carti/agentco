import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'
import { ToastProvider } from '../context/ToastContext'

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

describe('UX-004: Agent History', () => {
  it('shows "No completed tasks yet" when history is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('No completed tasks yet')).toBeInTheDocument()
    })
  })

  it('renders history tab with completed tasks from API', async () => {
    const tasks = [
      { id: 't1', title: 'Write tests', status: 'done', created_at: '2026-03-10T10:00:00Z' },
      { id: 't2', title: 'Deploy app', status: 'done', created_at: '2026-03-11T12:00:00Z' },
    ]
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Write tests')).toBeInTheDocument()
      expect(screen.getByText('Deploy app')).toBeInTheDocument()
    })
  })

  it('fetches only first 20 tasks (pagination)', async () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      status: 'done',
      created_at: '2026-03-10T10:00:00Z',
    }))
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
    })
    renderAgentPage()
    // Initially only 20 are shown
    await waitFor(() => {
      expect(screen.getByText('Task 0')).toBeInTheDocument()
      expect(screen.getByText('Task 19')).toBeInTheDocument()
    })
    expect(screen.queryByText('Task 20')).not.toBeInTheDocument()
    // "Load more" button should appear
    expect(screen.getByText('Load more')).toBeInTheDocument()
  })

  it('clicking Load more shows remaining tasks', async () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      status: 'done',
      created_at: '2026-03-10T10:00:00Z',
    }))
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Load more'))
    await waitFor(() => {
      expect(screen.getByText('Task 24')).toBeInTheDocument()
    })
  })

  it('clicking a task expands its details', async () => {
    const tasks = [
      { id: 't1', title: 'Write tests', status: 'done', created_at: '2026-03-10T10:00:00Z', description: 'Unit tests for API' },
    ]
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks?status=done')) {
        return Promise.resolve({ ok: true, json: async () => tasks })
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByText('Write tests')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Write tests'))
    await waitFor(() => {
      expect(screen.getByText('Unit tests for API')).toBeInTheDocument()
    })
  })

  it('fetches from GET /api/companies/{id}/agents/{id}/tasks?status=done', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderAgentPage('agent-1', 'c1')
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1/agents/agent-1/tasks?status=done'),
        expect.any(Object),
      )
    })
  })
})
