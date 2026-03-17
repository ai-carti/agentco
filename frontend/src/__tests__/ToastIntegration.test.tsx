import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CompaniesPage from '../components/CompaniesPage'
import { ToastProvider } from '../context/ToastContext'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'

function renderCompaniesPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CompaniesPage />
      </ToastProvider>
    </MemoryRouter>
  )
}

function renderBoard(companyId = 'c1') {
  return render(
    <ToastProvider>
      <KanbanBoard companyId={companyId} isLoaded={true} />
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({ tasks: [], agents: [] })
})

describe('BUG-021: Toast integration in create/delete operations', () => {
  describe('CompaniesPage.handleCreate', () => {
    it('shows success toast after company creation', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'existing', name: 'Existing Co' }]) }) // load
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'c1', name: 'Acme Corp' }) }) // create
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'existing', name: 'Existing Co' }, { id: 'c1', name: 'Acme Corp' }]) }) // reload

      renderCompaniesPage()

      await waitFor(() => {
        expect(screen.getByText('Companies')).toBeInTheDocument()
      })

      // Use the header button (not the empty state CTA)
      const buttons = screen.getAllByText('+ New Company')
      fireEvent.click(buttons[0])
      const input = screen.getByTestId('new-company-name-input')
      fireEvent.change(input, { target: { value: 'Acme Corp' } })
      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        const toasts = screen.queryAllByTestId('toast-item')
        expect(toasts.length).toBeGreaterThan(0)
        expect(toasts.some(t => t.textContent?.includes('Acme Corp'))).toBe(true)
      })
    })

    it('shows error toast when company creation fails', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'existing', name: 'Existing Co' }]) }) // load
        .mockResolvedValueOnce({ ok: false, status: 500 }) // create fails

      renderCompaniesPage()

      await waitFor(() => {
        expect(screen.getByText('Companies')).toBeInTheDocument()
      })

      const buttons = screen.getAllByText('+ New Company')
      fireEvent.click(buttons[0])
      const input = screen.getByTestId('new-company-name-input')
      fireEvent.change(input, { target: { value: 'Fail Corp' } })
      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        const toasts = screen.queryAllByTestId('toast-item')
        expect(toasts.length).toBeGreaterThan(0)
        expect(toasts.some(t => t.getAttribute('data-type') === 'error')).toBe(true)
      })
    })
  })

  describe('Task delete toast', () => {
    it('shows success toast after task deletion', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
      useAgentStore.setState({
        tasks: [{ id: 't1', title: 'Delete me', status: 'todo', assignee_name: 'Alice' }],
        agents: [],
      })

      renderBoard()

      fireEvent.click(screen.getByTestId('task-menu-t1'))
      fireEvent.click(screen.getByText('Delete'))
      fireEvent.click(screen.getByTestId('confirm-delete-btn'))

      await waitFor(() => {
        const toasts = screen.queryAllByTestId('toast-item')
        expect(toasts.length).toBeGreaterThan(0)
      })
    })
  })
})
