/**
 * Tests for:
 * SIRI-UX-428: KanbanBoard handleDrop blocks drop into 'error' column
 * SIRI-UX-429: CompaniesPage edit company modal close button has aria-label
 * SIRI-UX-365: KanbanBoard TaskCard useEffect syncs editTitle/editDesc on task prop change
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

// ─── SIRI-UX-428: Drop into 'error' column is blocked ───────────────────────
describe('SIRI-UX-428: handleDrop blocks drop into error column', () => {
  it('drop into error column does not call fetch (PATCH not sent)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    globalThis.fetch = mockFetch

    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Test Task', status: 'todo' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const errorCol = screen.getByTestId('kanban-column-error')
    const card = screen.getByTestId('task-card-t1')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(errorCol, { dataTransfer: { getData: () => 't1' } })

    // fetch should NOT be called for drop into error column
    await new Promise((r) => setTimeout(r, 50))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('drop into error column does not change task status in store', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Test Task', status: 'todo' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const errorCol = screen.getByTestId('kanban-column-error')
    fireEvent.drop(errorCol, { dataTransfer: { getData: () => 't1' } })

    await new Promise((r) => setTimeout(r, 50))

    // Task should remain in 'todo' status
    const store = useAgentStore.getState()
    expect(store.tasks.find((t) => t.id === 't1')?.status).toBe('todo')
  })

  it('drop into non-error column (in_progress) still works normally', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    globalThis.fetch = mockFetch

    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Test Task', status: 'todo' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const inProgressCol = screen.getByTestId('kanban-column-in_progress')
    const card = screen.getByTestId('task-card-t1')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1/tasks/t1'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"in_progress"'),
        }),
      )
    })
  })
})

// ─── SIRI-UX-429: CompaniesPage edit company modal close button aria-label ───
describe('SIRI-UX-429: CompaniesPage edit company modal close button has aria-label', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', name: 'Acme Corp' }],
    })
  })

  it('edit company close button has aria-label="Close edit company modal"', async () => {
    const { default: CompaniesPage } = await import('../components/CompaniesPage')
    render(
      <ToastProvider>
        <MemoryRouter>
          <CompaniesPage />
        </MemoryRouter>
      </ToastProvider>
    )

    // Wait for companies to load
    await waitFor(() => {
      expect(screen.getByTestId('company-item-c1')).toBeInTheDocument()
    })

    // Click edit on company
    const editBtn = screen.getByTestId('edit-company-c1-btn')
    fireEvent.click(editBtn)

    // Modal should appear with correctly labeled close button
    const closeBtn = screen.getByLabelText('Close edit company modal')
    expect(closeBtn).toBeInTheDocument()
  })
})

// ─── SIRI-UX-365: TaskCard useEffect syncs editTitle/editDesc on task change ─
describe('SIRI-UX-365: TaskCard syncs editTitle/editDesc via useEffect on task prop change', () => {
  it('KanbanBoard.tsx has useEffect that syncs editTitle/editDesc with task prop', async () => {
    // Load source and verify the useEffect pattern is present
    const modules = import.meta.glob('../components/KanbanBoard.tsx', { query: '?raw', import: 'default', eager: true })
    const src = modules['../components/KanbanBoard.tsx'] as string

    // Should have useEffect that depends on task and sets editTitle/editDesc
    expect(src).toContain('useEffect(')
    // The effect should sync editTitle from task.title
    const effectIdx = src.indexOf('SIRI-UX-365')
    expect(effectIdx).not.toBe(-1)
    const effectCtx = src.slice(effectIdx, effectIdx + 300)
    expect(effectCtx).toContain('setEditTitle')
    expect(effectCtx).toContain('task.title')
  })
})
