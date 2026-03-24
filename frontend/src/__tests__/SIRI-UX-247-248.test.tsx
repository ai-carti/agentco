import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { useAuthStore } from '../store/authStore'
import EmptyState from '../components/EmptyState'

beforeEach(() => {
  useAuthStore.setState({ token: 'tok' })
  vi.clearAllMocks()
})

// --- SIRI-UX-247: CompaniesPage role="button" div has aria-label={co.name} ---
describe('SIRI-UX-247: CompaniesPage company-item aria-label', () => {
  it('company-item div has aria-label matching company name', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: '1', name: 'Acme Corp' },
        { id: '2', name: 'Beta Inc' },
      ],
    })
    const { default: CompaniesPage } = await import('../components/CompaniesPage')
    render(
      <MemoryRouter>
        <ToastProvider>
          <CompaniesPage />
        </ToastProvider>
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
    const acmeBtn = screen.getByTestId('company-item-1')
    expect(acmeBtn).toHaveAttribute('aria-label', 'Acme Corp')
    const betaBtn = screen.getByTestId('company-item-2')
    expect(betaBtn).toHaveAttribute('aria-label', 'Beta Inc')
  })
})

// --- SIRI-UX-248: EmptyState CTA button uses CSS class, not JS hover handlers ---
describe('SIRI-UX-248: EmptyState CTA button uses CSS class', () => {
  it('CTA button has className empty-state-cta-btn', () => {
    render(
      <EmptyState
        emoji="🤖"
        title="Your AI team is waiting"
        subtitle="Add agents"
        ctaLabel="+ Add Agent"
        onCTA={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: '+ Add Agent' })
    expect(btn).toHaveClass('empty-state-cta-btn')
  })

  it('CTA button does not use inline style background manipulation', () => {
    render(
      <EmptyState
        emoji="🤖"
        title="Test"
        subtitle="Test"
        ctaLabel="Click"
        onCTA={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: 'Click' })
    // Button should use CSS class for hover, not inline style
    expect(btn.className).toContain('empty-state-cta-btn')
    // Should not have inline style overriding background
    expect(btn.style.background).toBe('')
  })
})
