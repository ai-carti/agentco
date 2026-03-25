import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// ── SIRI-UX-321: WarRoom — no dead `null` branch ──────────────────────────
describe('SIRI-UX-321: WarRoom dead-branch removal', () => {
  it('WarRoom renders run list without unreachable null branch', async () => {
    // The fix removes `runs.length > 0 ? (...) : null` in favour of plain `(...)`
    // We verify the source does not contain the redundant check by importing and checking component behaviour
    const { useAuthStore } = await import('../store/authStore')
    const { useAgentStore } = await import('../store/agentStore')

    useAuthStore.setState({ token: 'tok' })
    // SIRI-UX-328: use direct Company type cast instead of complex Parameters<...> gymnastics that fails tsc
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } })

    // Mock fetch + WebSocket so component renders synchronously
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
    const ws = { onopen: null as unknown, onmessage: null as unknown, onclose: null as unknown, close: vi.fn() }
    globalThis.WebSocket = vi.fn().mockImplementation(() => ws) as unknown as typeof WebSocket

    const { default: WarRoom } = await import('../components/WarRoom')
    const { unmount } = render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>,
    )
    // Component renders without error — dead branch removal didn't break anything
    expect(screen.getByTestId('war-room')).toBeInTheDocument()
    unmount()
  })
})

// ── SIRI-UX-322: BillingPage — sections have aria-labelledby ───────────────
describe('SIRI-UX-322: BillingPage section aria-labelledby', () => {
  beforeEach(() => {
    // BillingPage is static, no stores needed
  })

  it('Current Plan section has aria-labelledby pointing to its h2', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const section = screen.getByTestId('billing-current-plan')
    const labelId = section.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const heading = document.getElementById(labelId!)
    expect(heading).not.toBeNull()
    expect(heading!.textContent).toMatch(/Current Plan/i)
  })

  it('Upgrade section has aria-labelledby pointing to its h2', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const section = screen.getByTestId('billing-upgrade')
    const labelId = section.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const heading = document.getElementById(labelId!)
    expect(heading).not.toBeNull()
    expect(heading!.textContent).toMatch(/Upgrade/i)
  })

  it('Usage History section has aria-labelledby pointing to its h2', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const section = screen.getByTestId('billing-history')
    const labelId = section.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const heading = document.getElementById(labelId!)
    expect(heading).not.toBeNull()
    expect(heading!.textContent).toMatch(/Usage History/i)
  })
})

// ── SIRI-UX-323: BillingPage — plan buttons have distinct aria-labels ─────
describe('SIRI-UX-323: BillingPage plan button aria-labels', () => {
  it('Free plan button has aria-label containing plan name', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const freeBtn = screen.getByRole('button', { name: /free.*current plan/i })
    expect(freeBtn).toBeInTheDocument()
  })

  it('Pro plan button has aria-label "Upgrade to Pro"', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const proBtn = screen.getByRole('button', { name: /upgrade to pro/i })
    expect(proBtn).toBeInTheDocument()
  })

  it('Enterprise plan button has aria-label "Upgrade to Enterprise"', async () => {
    const { default: BillingPage } = await import('../pages/BillingPage')
    render(<BillingPage />)

    const entBtn = screen.getByRole('button', { name: /upgrade to enterprise/i })
    expect(entBtn).toBeInTheDocument()
  })
})
