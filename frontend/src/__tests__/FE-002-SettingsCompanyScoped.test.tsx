/**
 * FE-002 — SettingsPage: реальное управление LLM ключами
 *
 * Проверяет правильные company-scoped эндпоинты:
 * - GET /api/companies/ → получить список компаний пользователя
 * - GET /api/companies/{id}/credentials → список ключей по компании
 * - POST /api/companies/{id}/credentials → создать ключ
 * - DELETE /api/companies/{id}/credentials/{credId} → удалить ключ
 * - POST /api/llm/validate-key → валидация
 *
 * SIRI-UX-117: SettingsPage вызывала /api/credentials (не существует),
 * нужны /api/companies/{id}/credentials.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'
import { ToastProvider } from '../context/ToastContext'

const COMPANY_ID = 'co-123'
const MOCK_COMPANIES = [{ id: COMPANY_ID, name: 'Acme Corp' }]
const MOCK_CREDENTIALS = [
  { id: 'cred-1', provider: 'openai', key_hint: 'sk-...abcd' },
  { id: 'cred-2', provider: 'anthropic', key_hint: 'sk-ant-...zzzz' },
]

function setupFetch(overrides?: Partial<{
  companies: object[]
  credentials: object[]
}>) {
  const companies = overrides?.companies ?? MOCK_COMPANIES
  const credentials = overrides?.credentials ?? []

  globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const method = opts?.method?.toUpperCase() ?? 'GET'

    // GET companies list
    if (url.includes('/api/companies') && !url.includes('/credentials') && method === 'GET' && !url.match(/companies\/[^/]+$/)) {
      return Promise.resolve({ ok: true, json: async () => companies })
    }
    // GET /api/companies/<id> (single company, no trailing path)
    if (url.match(/\/api\/companies\/[^/]+$/) && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => companies[0] ?? null })
    }
    // GET /api/companies/{id}/credentials
    if (url.includes('/credentials') && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => credentials })
    }
    // POST validate-key
    if (url.includes('/api/llm/validate-key')) {
      return Promise.resolve({ ok: true, json: async () => ({ valid: true }) })
    }
    // POST /api/companies/{id}/credentials (save)
    if (url.includes('/credentials') && method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'cred-new', provider: 'openai', key_hint: 'sk-...1234' }) })
    }
    // DELETE /api/companies/{id}/credentials/{credId}
    if (url.includes('/credentials/') && method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Endpoint correctness ─────────────────────────────────────────────────────

describe('SIRI-UX-117: SettingsPage uses correct company-scoped endpoints', () => {
  it('fetches /api/companies/ on mount to get company list', async () => {
    setupFetch()
    renderSettings()

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const companiesCall = calls.find((c) => c[0].includes('/api/companies'))
      expect(companiesCall).toBeDefined()
    })
  })

  it('fetches credentials at /api/companies/{id}/credentials — NOT /api/credentials', async () => {
    setupFetch({ credentials: MOCK_CREDENTIALS })
    renderSettings()

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const credCalls = calls.filter(
        (c) => (c[1]?.method ?? 'GET') === 'GET' && c[0].includes('/credentials'),
      )
      // Must be company-scoped URL
      expect(credCalls.some((c) => c[0].match(/\/api\/companies\/[^/]+\/credentials/))).toBe(true)
      // Must NOT call bare /api/credentials
      expect(credCalls.some((c) => c[0].match(/\/api\/credentials$/))).toBe(false)
    })
  })

  it('POSTs to /api/companies/{id}/credentials — NOT /api/credentials', async () => {
    setupFetch()
    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-test-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const postCalls = calls.filter((c) => c[1]?.method === 'POST' && c[0].includes('/credentials') && !c[0].includes('validate'))
      expect(postCalls.length).toBeGreaterThan(0)
      expect(postCalls[0][0]).toMatch(/\/api\/companies\/[^/]+\/credentials/)
      expect(postCalls[0][0]).not.toMatch(/\/api\/credentials$/)
    })
  })

  it('DELETEs at /api/companies/{id}/credentials/{credId}', async () => {
    setupFetch({ credentials: MOCK_CREDENTIALS })
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-delete')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('llm-credential-delete')[0])

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const deleteCall = calls.find((c) => c[1]?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toMatch(/\/api\/companies\/[^/]+\/credentials\/cred-1/)
    })
  })
})

// ─── No companies state ───────────────────────────────────────────────────────

describe('SIRI-UX-117: SettingsPage handles no companies gracefully', () => {
  it('shows a notice when user has no companies', async () => {
    setupFetch({ companies: [] })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('settings-no-company')).toBeInTheDocument()
    })
  })
})

// ─── With companies — functional UI ──────────────────────────────────────────

describe('SIRI-UX-117: SettingsPage full functional UI with companies', () => {
  it('shows credentials from selected company', async () => {
    setupFetch({ credentials: MOCK_CREDENTIALS })
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })
    expect(screen.getByText('sk-...abcd')).toBeInTheDocument()
    expect(screen.getByText('sk-ant-...zzzz')).toBeInTheDocument()
  })

  it('validate-and-save flow works end to end', async () => {
    setupFetch()
    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'anthropic' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-ant-testkey' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByText('API key saved')).toBeInTheDocument()
    })
  })
})
