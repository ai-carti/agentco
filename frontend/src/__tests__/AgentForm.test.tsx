import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentForm from '../components/AgentForm'

const FALLBACK_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-1.5-pro']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentForm - model selector', () => {
  it('renders a select element for model field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o', 'claude-sonnet-4-5'] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('model-select')).toBeInTheDocument()
    })
    expect(screen.getByTestId('model-select').tagName).toBe('SELECT')
  })

  it('loads model options from GET /api/llm/providers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o', 'claude-sonnet-4-5'] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'claude-sonnet-4-5' })).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/llm/providers'),
      expect.anything()
    )
  })

  it('falls back to hardcoded list when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => {
      for (const model of FALLBACK_MODELS) {
        expect(screen.getByRole('option', { name: model })).toBeInTheDocument()
      }
    })
  })

  it('falls back to hardcoded list when fetch returns !ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument()
    })
  })

  it('cannot submit with empty model', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    const onSubmit = vi.fn()
    render(<AgentForm onSubmit={onSubmit} />)
    await waitFor(() => screen.getByTestId('model-select'))

    // Manually set select value to empty to simulate blank
    const select = screen.getByTestId('model-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })

    fireEvent.click(screen.getByTestId('agent-form-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with selected model value', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o', 'gpt-4o-mini'] }),
    })
    const onSubmit = vi.fn()
    render(<AgentForm onSubmit={onSubmit} />)
    await waitFor(() => screen.getByTestId('model-select'))

    fireEvent.change(screen.getByTestId('agent-form-submit').closest('form')!.querySelector('[data-testid="agent-name-input"]')!, {
      target: { value: 'My Agent' },
    })
    fireEvent.change(screen.getByTestId('model-select'), { target: { value: 'gpt-4o-mini' } })
    fireEvent.click(screen.getByTestId('agent-form-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' })
    )
  })

  it('falls back to hardcoded list when fetch returns empty array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => {
      for (const model of FALLBACK_MODELS) {
        expect(screen.getByRole('option', { name: model })).toBeInTheDocument()
      }
    })
  })

  it('shows placeholder option that prevents empty submit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => screen.getByTestId('model-select'))
    const placeholder = screen.getByRole('option', { name: /select model/i })
    expect(placeholder).toHaveAttribute('value', '')
    expect(placeholder).toBeDisabled()
  })
})

describe('AgentForm - BUG-026: SystemPromptEditor integration', () => {
  it('renders SystemPromptEditor textarea in the form', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    await waitFor(() => screen.getByTestId('model-select'))
    expect(screen.getByTestId('system-prompt-textarea')).toBeInTheDocument()
  })

  it('submits form with system_prompt value', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    const onSubmit = vi.fn()
    render(<AgentForm onSubmit={onSubmit} />)
    await waitFor(() => screen.getByTestId('model-select'))

    fireEvent.change(screen.getByTestId('agent-name-input'), { target: { value: 'Test Agent' } })
    fireEvent.change(screen.getByTestId('model-select'), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByTestId('system-prompt-textarea'), {
      target: { value: 'You are a helpful assistant.' },
    })
    fireEvent.click(screen.getByTestId('agent-form-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        system_prompt: 'You are a helpful assistant.',
      })
    )
  })

  it('submits system_prompt as empty string when not filled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    const onSubmit = vi.fn()
    render(<AgentForm onSubmit={onSubmit} />)
    await waitFor(() => screen.getByTestId('model-select'))

    fireEvent.change(screen.getByTestId('agent-name-input'), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByTestId('model-select'), { target: { value: 'gpt-4o' } })
    fireEvent.click(screen.getByTestId('agent-form-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ system_prompt: '' })
    )
  })

  it('populates system_prompt from initialValues', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    render(
      <AgentForm
        onSubmit={vi.fn()}
        initialValues={{ system_prompt: 'You are a CEO.' }}
      />
    )
    await waitFor(() => screen.getByTestId('system-prompt-textarea'))
    expect(screen.getByTestId('system-prompt-textarea')).toHaveValue('You are a CEO.')
  })
})
