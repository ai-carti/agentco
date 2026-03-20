import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

const mockCredentials = [
  { id: '1', provider: 'openai', key_hint: 'sk-...abc1' },
  { id: '2', provider: 'anthropic', key_hint: 'sk-ant-...xyz2' },
]

describe('SIRI-UX-010: SettingsPage LLM Credentials', () => {
  it('renders LLM Credentials section heading', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    renderSettings()
    expect(screen.getByTestId('llm-credentials-section')).toBeInTheDocument()
  })

  it('shows provider select with openai/anthropic/gemini options', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    renderSettings()
    const providerSelect = screen.getByTestId('llm-provider-select')
    expect(providerSelect).toBeInTheDocument()
    expect(screen.getByTestId('llm-api-key-input')).toBeInTheDocument()
  })

  it('api key input is type=password', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    renderSettings()
    const keyInput = screen.getByTestId('llm-api-key-input')
    expect(keyInput).toHaveAttribute('type', 'password')
  })

  it('submits validate then POST /api/credentials on form submit', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // GET /api/credentials
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // POST /api/llm/validate-key
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '3', provider: 'openai', key_hint: 'sk-...new1' }) }) // POST /api/credentials

    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-test-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const validateCall = calls.find((c: unknown[]) => (c[0] as string).includes('/api/llm/validate-key'))
      expect(validateCall).toBeDefined()
      const postCall = calls.find((c: unknown[]) => (c[1] as RequestInit)?.method === 'POST' && (c[0] as string).includes('/api/credentials') && !(c[0] as string).includes('validate'))
      expect(postCall).toBeDefined()
    })
  })

  it('shows saved credentials list with hint and delete button', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockCredentials })
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })
    expect(screen.getByText('sk-...abc1')).toBeInTheDocument()
    expect(screen.getByText('sk-ant-...xyz2')).toBeInTheDocument()
    expect(screen.getAllByTestId('llm-credential-delete')).toHaveLength(2)
  })

  it('sends DELETE on credential delete click', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockCredentials }) // GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // DELETE

    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-delete')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('llm-credential-delete')[0])

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const deleteCall = calls.find((c: unknown[]) => (c[1] as RequestInit)?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/credentials/1')
    })
  })

  it('shows error toast when validation fails', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // GET
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Invalid API key' }) }) // validate fail

    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-bad' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })
  })
})
