/**
 * SIRI-UX-170: CompaniesPage "New Company" modal — useFocusTrap missing
 * SIRI-UX-171: KanbanBoard TaskCard — handleEdit/handleDelete/handleAssign without loading state
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompaniesPage from '../components/CompaniesPage'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderCompanies() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:id" element={<div data-testid="company-page" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function renderKanban(companyId = 'c1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
        <KanbanBoard companyId={companyId} />
      </MemoryRouter>
    </ToastProvider>,
  )
}

// ─── SIRI-UX-170: CompaniesPage focus trap ─────────────────────────────────

describe('SIRI-UX-170: CompaniesPage New Company modal focus trap', () => {
  beforeEach(() => {
    // Return at least one company so the "New Company" button is visible
    // (empty list triggers OnboardingPage instead)
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => [{ id: 'c1', name: 'Acme Corp' }],
      } as Response),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('New Company modal has role="dialog" and aria-modal="true"', async () => {
    renderCompanies()

    // Wait for company list to load
    await screen.findByText('Acme Corp')

    // Find and click the "New Company" button
    const newBtn = screen.getByText('+ New Company')
    fireEvent.click(newBtn)

    // Modal should appear with dialog role
    const dialog = await screen.findByRole('dialog', { name: /new company/i })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('New Company modal contains a focusable input', async () => {
    renderCompanies()

    await screen.findByText('Acme Corp')

    fireEvent.click(screen.getByText('+ New Company'))

    const input = await screen.findByTestId('new-company-name-input')
    expect(input).toBeInTheDocument()
  })

  it('modal closes on Escape key', async () => {
    renderCompanies()

    await screen.findByText('Acme Corp')
    fireEvent.click(screen.getByText('+ New Company'))

    await screen.findByRole('dialog', { name: /new company/i })

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new company/i })).not.toBeInTheDocument()
    })
  })
})

// ─── SIRI-UX-171: TaskCard loading states ──────────────────────────────────

const TASK = {
  id: 'task-1',
  title: 'Fix bug',
  description: 'details',
  status: 'todo' as const,
  priority: 'high' as const,
  assignee_id: null,
  assignee_name: null,
  due_date: null,
  company_id: 'c1',
}

describe('SIRI-UX-171: TaskCard loading states for edit/delete/assign', () => {
  beforeEach(() => {
    act(() => {
      useAgentStore.setState({
        tasks: [TASK],
        agents: [{ id: 'a1', name: 'Alice', role: 'CEO', avatar: '🤖', status: 'idle', last_message: null }],
        runs: [],
        messages: [],
        flashingAgents: new Set(),
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Save button is disabled while PATCH is in-flight (saving state)', async () => {
    let resolvePatch: (v: unknown) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      if (opts?.method === 'PATCH') {
        return new Promise((resolve) => { resolvePatch = resolve })
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    })

    renderKanban()

    // Open the task menu
    const menuBtn = await screen.findByTestId('task-menu-task-1')
    fireEvent.click(menuBtn)

    // Click Edit
    const editItem = screen.getByRole('menuitem', { name: /edit/i })
    fireEvent.click(editItem)

    // Edit modal should be open
    const editModal = await screen.findByRole('dialog', { name: /edit task/i })
    expect(editModal).toBeInTheDocument()

    // Click Save — request should be in-flight
    const saveBtn = screen.getByRole('button', { name: /^save/i })
    expect(saveBtn).not.toBeDisabled()
    fireEvent.click(saveBtn)

    // Save button should now be disabled with loading text
    await waitFor(() => {
      expect(screen.getByText(/Saving…/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()

    // Resolve the request
    act(() => {
      resolvePatch!({ ok: true, json: async () => ({}) })
    })
  })

  it('Delete button is disabled while DELETE is in-flight (deleting state)', async () => {
    let resolveDelete: (v: unknown) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      if (opts?.method === 'DELETE') {
        return new Promise((resolve) => { resolveDelete = resolve })
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    })

    renderKanban()

    // Open task menu and click Delete
    const menuBtn = await screen.findByTestId('task-menu-task-1')
    fireEvent.click(menuBtn)

    const deleteItem = screen.getByRole('menuitem', { name: /delete/i })
    fireEvent.click(deleteItem)

    // Confirm delete dialog should open
    await screen.findByRole('dialog', { name: /delete task/i })

    const confirmDeleteBtn = screen.getByTestId('confirm-delete-btn')
    expect(confirmDeleteBtn).not.toBeDisabled()
    fireEvent.click(confirmDeleteBtn)

    // Button should now show "Deleting…" and be disabled
    await waitFor(() => {
      expect(screen.getByText(/Deleting…/i)).toBeInTheDocument()
    })
    expect(screen.getByTestId('confirm-delete-btn')).toBeDisabled()

    // Resolve
    act(() => {
      resolveDelete!({ ok: true })
    })
  })

  it('Assign buttons are disabled while PATCH is in-flight (assigning state)', async () => {
    let resolveAssign: (v: unknown) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      if (opts?.method === 'PATCH') {
        return new Promise((resolve) => { resolveAssign = resolve })
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    })

    renderKanban()

    // Open task menu and click Assign
    const menuBtn = await screen.findByTestId('task-menu-task-1')
    fireEvent.click(menuBtn)

    const assignItem = screen.getByRole('menuitem', { name: /assign/i })
    fireEvent.click(assignItem)

    // Assign modal should open
    await screen.findByRole('dialog', { name: /assign to agent/i })

    const agentBtn = screen.getByTestId('assign-agent-a1')
    expect(agentBtn).not.toBeDisabled()
    fireEvent.click(agentBtn)

    // Agent button should be disabled while request is in-flight
    await waitFor(() => {
      expect(screen.getByTestId('assign-agent-a1')).toBeDisabled()
    })

    // Resolve
    act(() => {
      resolveAssign!({ ok: true, json: async () => ({}) })
    })
  })
})
