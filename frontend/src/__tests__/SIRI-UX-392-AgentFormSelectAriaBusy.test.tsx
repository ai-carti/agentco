/**
 * SIRI-UX-392 — AgentForm model select missing aria-busy during load
 *
 * When loadingModels=true, the <select> should have aria-busy="true"
 * so screen readers announce loading state instead of silently showing a disabled control.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentForm from '../components/AgentForm'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SIRI-UX-392 AgentForm — select aria-busy while loading models', () => {
  it('model select has aria-busy="true" while models are loading', () => {
    // Never resolve so loading state persists
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<AgentForm onSubmit={vi.fn()} />)
    const select = screen.getByTestId('model-select')
    expect(select).toHaveAttribute('aria-busy', 'true')
  })

  it('model select has aria-busy="false" after models load', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ all_models: ['gpt-4o'] }),
    })
    render(<AgentForm onSubmit={vi.fn()} />)
    const select = await screen.findByRole('combobox', { name: /model/i })
    expect(select).toHaveAttribute('aria-busy', 'false')
  })
})
