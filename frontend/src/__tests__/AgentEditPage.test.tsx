import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentEditPage from '../components/AgentEditPage'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockAgentData = {
  id: 'a1',
  name: 'My Agent',
  role: 'Frontend Engineer',
  model: 'gpt-4o',
  system_prompt: 'You are a frontend engineer.',
}

function renderAgentEditPage(companyId = 'c1', agentId = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}/edit`]}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId/edit" element={<AgentEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AgentEditPage — POST-003', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: Page renders with form fields after data loads
  it('renders edit page with all form fields', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o', 'gpt-4o-mini'] }) })

    renderAgentEditPage()

    await waitFor(() => {
      expect(screen.getByTestId('agent-edit-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('agent-role-input')).toBeInTheDocument()
    expect(screen.getByTestId('model-select')).toBeInTheDocument()
    expect(screen.getByTestId('system-prompt-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('agent-edit-cancel')).toBeInTheDocument()
  })

  // Test 2: Prefills form with loaded agent data
  it('prefills form with current agent data', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o', 'gpt-4o-mini'] }) })

    renderAgentEditPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('My Agent')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Frontend Engineer')).toBeInTheDocument()
    expect(screen.getByDisplayValue('You are a frontend engineer.')).toBeInTheDocument()
  })

  // Test 3: Save sends PATCH and shows success
  it('save button sends PATCH request to correct endpoint', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o', 'gpt-4o-mini'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockAgentData, name: 'Updated Agent' }) })

    renderAgentEditPage('c1', 'a1')

    await waitFor(() => screen.getByTestId('agent-form-submit'))

    fireEvent.change(screen.getByTestId('agent-name-input'), { target: { value: 'Updated Agent' } })
    fireEvent.click(screen.getByTestId('agent-form-submit'))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const patchCall = calls.find((call) => call[1]?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/companies/c1/agents/a1')
    })
  })

  // Test 4: Cancel navigates back to AgentPage
  it('cancel button navigates back to agent page without saving', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })

    renderAgentEditPage('c1', 'a1')

    await waitFor(() => screen.getByTestId('agent-edit-cancel'))

    fireEvent.click(screen.getByTestId('agent-edit-cancel'))

    expect(mockNavigate).toHaveBeenCalledWith('/companies/c1/agents/a1')
    // Should NOT have made a PATCH call
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const patchCall = calls.find((call) => call[1]?.method === 'PATCH')
    expect(patchCall).toBeUndefined()
  })

  // Test 5: Shows error when PATCH fails
  it('shows error message when save request fails', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })

    renderAgentEditPage()

    await waitFor(() => screen.getByTestId('agent-form-submit'))

    fireEvent.click(screen.getByTestId('agent-form-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('agent-edit-error')).toBeInTheDocument()
    })
  })

  // Test 6: Shows loading state during save
  it('shows saving indicator during PATCH request', async () => {
    let resolvePatch!: (value: unknown) => void
    const patchPending = new Promise((resolve) => {
      resolvePatch = resolve
    })

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
      .mockReturnValueOnce(patchPending)

    renderAgentEditPage()

    await waitFor(() => screen.getByTestId('agent-form-submit'))

    fireEvent.click(screen.getByTestId('agent-form-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('agent-edit-saving')).toBeInTheDocument()
    })

    // Resolve the pending request
    resolvePatch({ ok: true, json: async () => ({}) })
  })

  // Test 7: Shows skeleton while loading agent data
  it('shows loading state while fetching agent data', () => {
    // fetch never resolves — stays loading
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    renderAgentEditPage()

    // Should show loading placeholder, not the form
    expect(screen.getByTestId('agent-edit-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-name-input')).not.toBeInTheDocument()
  })

  // Test 8: Redirects after successful save
  it('navigates back to agent page after successful save', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockAgentData })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: ['gpt-4o'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockAgentData }) })

    renderAgentEditPage('c1', 'a1')

    await waitFor(() => screen.getByTestId('agent-form-submit'))

    fireEvent.click(screen.getByTestId('agent-form-submit'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/companies/c1/agents/a1')
    })
  })
})
