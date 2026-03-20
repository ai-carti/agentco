import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

// FE-003: AgentPage is view-only — no editable AgentForm, only read-only display + Edit button

function mockFetches(agentData = {
  id: 'a1', name: 'My Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: 'Be helpful',
}) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
    if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
    return Promise.resolve({ ok: true, json: async () => agentData })
  })
}

function renderAgentPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1/agents/a1']}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        <Route path="/companies/:id/agents/:agentId/edit" element={<div data-testid="edit-page">Edit Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FE-003: AgentPage view-only (no editable AgentForm)', () => {
  it('renders agent-page container', () => {
    mockFetches()
    renderAgentPage()
    expect(screen.getByTestId('agent-page')).toBeInTheDocument()
  })

  it('shows name in read-only div (not input)', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-name-display')).toBeInTheDocument())
    const el = screen.getByTestId('agent-name-display')
    expect(el.tagName).not.toBe('INPUT')
    expect(el.tagName).not.toBe('TEXTAREA')
    expect(el).toHaveTextContent('My Agent')
  })

  it('shows role in read-only div', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-role-display')).toBeInTheDocument())
    const el = screen.getByTestId('agent-role-display')
    expect(el.tagName).not.toBe('INPUT')
    expect(el).toHaveTextContent('Engineer')
  })

  it('shows model in read-only div', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-model-display')).toBeInTheDocument())
    const el = screen.getByTestId('agent-model-display')
    expect(el.tagName).not.toBe('INPUT')
    expect(el).toHaveTextContent('gpt-4o')
  })

  it('shows system_prompt in read-only div', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-system-prompt-display')).toBeInTheDocument())
    const el = screen.getByTestId('agent-system-prompt-display')
    expect(el.tagName).not.toBe('TEXTAREA')
    expect(el).toHaveTextContent('Be helpful')
  })

  it('does NOT render editable agent-name-input', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-name-display')).toBeInTheDocument())
    expect(screen.queryByTestId('agent-name-input')).not.toBeInTheDocument()
  })

  it('does NOT render AgentForm submit button', async () => {
    mockFetches()
    renderAgentPage()
    await waitFor(() => expect(screen.getByTestId('agent-name-display')).toBeInTheDocument())
    expect(screen.queryByTestId('agent-form-submit')).not.toBeInTheDocument()
  })

  it('renders Edit button that points to edit route', async () => {
    mockFetches()
    renderAgentPage()
    const editBtn = screen.getByTestId('agent-edit-btn')
    expect(editBtn).toBeInTheDocument()
    expect(editBtn).toBeVisible()
  })
})
