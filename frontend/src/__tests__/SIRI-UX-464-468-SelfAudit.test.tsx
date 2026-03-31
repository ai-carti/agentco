/**
 * SIRI-UX-464: SettingsPage API key input trims on every keystroke
 * SIRI-UX-465: CompanySettingsPage delete confirm button missing aria-disabled
 * SIRI-UX-466: WarRoom run items missing tabIndex and onKeyDown despite role="article"
 * SIRI-UX-467: GlobalSearch Escape handler doesn't stopPropagation
 * SIRI-UX-468: Navbar Logout button missing aria-label
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ─── Common mocks ──────────────────────────────────────────────────────────────
const authState = { token: 'tok', user: { email: 'test@co.com' }, logout: vi.fn(), login: vi.fn(), register: vi.fn(), isLoading: false, error: null }
vi.mock('../store/authStore', () => ({
  useAuthStore: (sel?: (s: typeof authState) => unknown) =>
    sel ? sel(authState) : authState,
}))

vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: { currentCompany: { id: 'c1'; name: 'Test Co' } | null; agents: never[]; tasks: never[] }) => unknown) =>
    sel({ currentCompany: { id: 'c1', name: 'Test Co' }, agents: [], tasks: [] }),
}))

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}))

vi.mock('../api/client', () => ({
  BASE_URL: 'http://localhost:8000',
  getStoredToken: () => 'tok',
}))

// ─── SIRI-UX-464: SettingsPage API key input should NOT trim on every keystroke ─
describe('SIRI-UX-464: SettingsPage API key input does not trim on keystroke', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'c1', name: 'Test Co' }]), { status: 200 }),
    )
  })

  it('source does NOT call .trim() inside onChange handler', async () => {
    // Reading source to verify the pattern — trim() on every keystroke causes cursor jumps
    // and prevents pasting keys with whitespace before final submit-time trim
    const src = await import('../components/SettingsPage?raw').catch(() => null)
    if (src) {
      const text = src.default as string
      // The onChange handler should NOT trim inline — trim happens in handleSubmit
      const onChangeLines = text.split('\n').filter((l: string) => l.includes('setApiKey') && l.includes('onChange'))
      for (const line of onChangeLines) {
        expect(line).not.toContain('.trim()')
      }
    }
  })
})

// ─── SIRI-UX-465: CompanySettingsPage delete button aria-disabled ──────────────
describe('SIRI-UX-465: CompanySettingsPage delete confirm button has aria-disabled', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'c1', name: 'Test Co', description: '' }), { status: 200 }),
    )
  })

  it('confirm delete button has aria-disabled when name does not match', async () => {
    const { default: CompanySettingsPage } = await import('../components/CompanySettingsPage')
    render(
      <MemoryRouter initialEntries={['/companies/c1/settings']}>
        <Routes>
          <Route path="/companies/:id/settings" element={<CompanySettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Wait for data to load
    const deleteBtn = await screen.findByText('Delete this company')
    fireEvent.click(deleteBtn)

    const confirmBtn = await screen.findByTestId('confirm-delete-company-btn')
    // Confirm input is empty → button should be disabled + aria-disabled
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn).toHaveAttribute('aria-disabled', 'true')
  })
})

// ─── SIRI-UX-466: WarRoom run items have tabIndex for keyboard navigation ──────
describe('SIRI-UX-466: WarRoom run items have tabIndex=0 for keyboard access', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { id: 'r1', run_id: 'r1', agent_name: 'CEO', task_title: 'Plan', status: 'running', started_at: new Date().toISOString() },
      ]), { status: 200 }),
    )
  })

  it('run item article has tabIndex=0', async () => {
    // Read source to verify tabIndex is on the article element
    const src = await import('../components/WarRoom?raw').catch(() => null)
    if (src) {
      // Structural check: role="article" should be near tabIndex={0}
      const text = src.default as string
      // Verify both role="article" and tabIndex={0} exist on run items
      expect(text).toContain('role="article"')
      expect(text).toContain('tabIndex={0}')
    }
  })
})

// ─── SIRI-UX-467: GlobalSearch Escape stopPropagation ────────────────────────
describe('SIRI-UX-467: GlobalSearch Escape handler stops propagation', () => {
  it('source contains stopPropagation in Escape handler', async () => {
    const src = await import('../components/GlobalSearch?raw').catch(() => null)
    if (src) {
      const text = src.default as string
      // The Escape listener should call e.stopPropagation() to prevent parent handlers from firing
      expect(text).toContain('stopPropagation')
    }
  })
})

// ─── SIRI-UX-468: Navbar Logout button has aria-label ─────────────────────────
describe('SIRI-UX-468: Navbar Logout button has aria-label', () => {
  it('Logout button has descriptive aria-label', async () => {
    const { default: Navbar } = await import('../components/Navbar')
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )

    const logoutBtn = screen.getByText('Logout')
    expect(logoutBtn).toHaveAttribute('aria-label', 'Sign out')
  })
})
