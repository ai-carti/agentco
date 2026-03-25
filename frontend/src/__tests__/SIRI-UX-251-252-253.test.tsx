/**
 * SIRI-UX-251 — CompaniesPage: handleCreate calls load() without AbortSignal
 * SIRI-UX-252 — TaskDetailSidebar: status history key collision (no index prefix)
 * SIRI-UX-253 — WarRoom: MAX_RUNS defined inside component instead of module level
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ─── SIRI-UX-251 ────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({ getStoredToken: () => 'test-token', BASE_URL: 'http://localhost:8000' }))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

describe('SIRI-UX-251: CompaniesPage handleCreate passes signal to load()', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('aborts the post-create load() when component unmounts mid-refetch', async () => {
    // Initial load returns existing company so CompaniesPage shows the list (not onboarding)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'existing-1', name: 'Existing Co' }]),
    } as unknown as Response)

    // POST create returns success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'co-1', name: 'Acme' }),
    } as unknown as Response)

    // Refetch (load after create) — slow, never resolves during this test
    let refetchSignal: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce((_url: string, opts?: RequestInit) => {
      refetchSignal = opts?.signal
      return new Promise(() => {}) // never resolves
    })

    const { default: CompaniesPage } = await import('../components/CompaniesPage')
    const { unmount } = render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    )

    // Wait for initial load
    await waitFor(() => expect(screen.queryByTestId('companies-page')).toBeInTheDocument())

    // Open modal and create
    const newBtn = screen.getByText('+ New Company')
    await userEvent.click(newBtn)
    const input = await screen.findByTestId('new-company-name-input')
    await userEvent.type(input, 'Acme')

    // Submit
    const createBtn = screen.getByText('Create')
    await act(async () => { await userEvent.click(createBtn) })

    // Wait for refetch to start
    await waitFor(() => expect(refetchSignal).toBeDefined())

    // Unmount while refetch is in flight
    unmount()

    // Signal must have been aborted
    expect(refetchSignal?.aborted).toBe(true)
  })
})

// ─── SIRI-UX-252 ────────────────────────────────────────────────────────────

describe('SIRI-UX-252: TaskDetailSidebar status history keys have index prefix', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('renders duplicate status entries without React key collision', async () => {
    // Return duplicate status history entries (same status + timestamp)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          logs: [],
          status_history: [
            { status: 'todo', changed_at: '2024-01-01T12:00:00Z' },
            { status: 'todo', changed_at: '2024-01-01T12:00:00Z' }, // exact duplicate
          ],
        }),
    } as unknown as Response)

    const { default: TaskDetailSidebar } = await import('../components/TaskDetailSidebar')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <TaskDetailSidebar
          task={{ id: 't1', title: 'Test', status: 'todo' } as never}
          companyId="co-1"
          onClose={vi.fn()}
        />
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(screen.getAllByTestId('status-history-todo')).toHaveLength(2)
    )

    // No React key collision warnings
    const keyWarnings = consoleWarn.mock.calls
      .concat(consoleError.mock.calls)
      .filter((args) =>
        String(args[0] ?? '').toLowerCase().includes('key') ||
        String(args[0] ?? '').toLowerCase().includes('duplicate')
      )
    expect(keyWarnings).toHaveLength(0)

    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })
})

// ─── SIRI-UX-253 ────────────────────────────────────────────────────────────

describe('SIRI-UX-253: WarRoom MAX_RUNS is a module-level constant', async () => {
  it('MAX_RUNS is not defined inside the component render function', async () => {
    // Read source code as text and verify MAX_RUNS is declared at module level
    const src = await import('../components/WarRoom?raw')
    const sourceText: string = (src as unknown as { default: string }).default

    // Module-level const MAX_RUNS should appear BEFORE the `export default function`
    const funcIdx = sourceText.indexOf('export default function WarRoom')
    const maxRunsIdx = sourceText.indexOf('const MAX_RUNS')

    expect(funcIdx).toBeGreaterThan(-1)
    expect(maxRunsIdx).toBeGreaterThan(-1)
    // MAX_RUNS should be declared BEFORE the component function
    expect(maxRunsIdx).toBeLessThan(funcIdx)
  })
})
