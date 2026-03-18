import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LibraryPage from '../components/LibraryPage'
import LibraryPortfolioPage from '../components/LibraryPortfolioPage'
import AgentPage from '../components/AgentPage'

// Mock fetch globally
beforeEach(() => {
  vi.clearAllMocks()
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderPortfolio(id = 'lib-1') {
  return render(
    <MemoryRouter initialEntries={[`/library/${id}/portfolio`]}>
      <Routes>
        <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderAgentPage(agentId = 'agent-1', companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ---- LibraryPage tests ----
describe('LibraryPage', () => {
  it('renders library page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByTestId('library-page')).toBeInTheDocument()
    })
  })

  it('shows empty state when no agents in library', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText(/No agents in library yet/i)).toBeInTheDocument()
      expect(screen.getByText(/Save an agent from its page/i)).toBeInTheDocument()
    })
  })

  it('shows empty state emoji 📚', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('📚')).toBeInTheDocument()
    })
  })

  it('renders list of agents from GET /api/library', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' },
        { id: 'lib-2', name: 'Dev Agent', role: 'Engineer', avatar: '💻' },
      ],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('CEO Agent')).toBeInTheDocument()
      expect(screen.getByText('Dev Agent')).toBeInTheDocument()
    })
  })

  it('renders Fork button for each agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' },
      ],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByTestId('fork-btn-lib-1')).toBeInTheDocument()
    })
  })

  it('opens fork modal on Fork click', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'comp-1', name: 'Acme Corp' }],
      })
    renderLibrary()
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('fork-btn-lib-1'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('fork-modal')).toBeInTheDocument()
    })
  })

  it('fork modal shows company list', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'comp-1', name: 'Acme Corp' }, { id: 'comp-2', name: 'Beta Ltd' }],
      })
    renderLibrary()
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('fork-btn-lib-1'))
    })
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Beta Ltd')).toBeInTheDocument()
    })
  })

  it('calls POST /api/companies/{id}/agents/fork on confirm', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'comp-1', name: 'Acme Corp' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-agent-1' }),
      })
    globalThis.fetch = fetchMock
    renderLibrary()
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('fork-btn-lib-1'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('fork-company-comp-1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('fork-company-comp-1'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/comp-1/agents/fork'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('renders link to portfolio for each agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'lib-1', name: 'CEO Agent', role: 'Executive', avatar: '👔' }],
    })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-link-lib-1')).toBeInTheDocument()
    })
  })

  it('fetches GET /api/library on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    globalThis.fetch = fetchMock
    renderLibrary()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/library'),
        expect.anything(),
      )
    })
  })
})

// ---- LibraryPortfolioPage tests ----
describe('LibraryPortfolioPage', () => {
  it('renders portfolio page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], total_tasks: 0, success_rate: 0, agent_name: 'CEO Agent' }),
    })
    renderPortfolio('lib-1')
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-page')).toBeInTheDocument()
    })
  })

  it('shows total tasks count', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [],
        total_tasks: 42,
        success_rate: 88,
        agent_name: 'CEO Agent',
      }),
    })
    renderPortfolio('lib-1')
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-total-tasks')).toBeInTheDocument()
      expect(screen.getByTestId('portfolio-total-tasks').textContent).toContain('42')
    })
  })

  it('shows success rate %', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [],
        total_tasks: 10,
        success_rate: 75,
        agent_name: 'CEO Agent',
      }),
    })
    renderPortfolio('lib-1')
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-success-rate')).toBeInTheDocument()
      expect(screen.getByTestId('portfolio-success-rate').textContent).toContain('75')
    })
  })

  it('renders task list with title, status, company_name, created_at', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          {
            id: 'task-1',
            title: 'Build API',
            status: 'done',
            company_name: 'Acme Corp',
            created_at: '2026-03-01T10:00:00Z',
          },
        ],
        total_tasks: 1,
        success_rate: 100,
        agent_name: 'CEO Agent',
      }),
    })
    renderPortfolio('lib-1')
    await waitFor(() => {
      expect(screen.getByText('Build API')).toBeInTheDocument()
      expect(screen.getByText('done')).toBeInTheDocument()
      expect(screen.getByText(/Acme Corp/i)).toBeInTheDocument()
    })
  })

  it('fetches GET /api/library/{id}/portfolio', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], total_tasks: 0, success_rate: 0, agent_name: 'X' }),
    })
    globalThis.fetch = fetchMock
    renderPortfolio('lib-42')
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/library/lib-42/portfolio'),
        expect.anything(),
      )
    })
  })
})

// ---- AgentPage "Save to Library" button ----
describe('AgentPage Save to Library', () => {
  it('renders "Save to Library" button on agent page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('save-to-library-btn')).toBeInTheDocument()
    })
  })

  it('calls POST /api/library when Save to Library clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // history
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // save to library
    globalThis.fetch = fetchMock
    renderAgentPage('agent-1', 'c1')
    await waitFor(() => {
      expect(screen.getByTestId('save-to-library-btn')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-to-library-btn'))
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/library'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('agent-1'),
        }),
      )
    })
  })

  it('shows success message after Save to Library', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // task history
      .mockResolvedValueOnce({ ok: true, json: async () => [] })  // memory
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'lib-1' }) })
    renderAgentPage('agent-1', 'c1')
    await waitFor(() => {
      expect(screen.getByTestId('save-to-library-btn')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-to-library-btn'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('save-to-library-success')).toBeInTheDocument()
    })
  })
})
