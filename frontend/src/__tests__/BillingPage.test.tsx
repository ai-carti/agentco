import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import BillingPage from '../pages/BillingPage'

const wrap = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('BillingPage (POST-005)', () => {
  it('renders the page with billing heading', () => {
    wrap(<BillingPage />)
    expect(screen.getByTestId('billing-page')).toBeInTheDocument()
    // h1 contains "Billing"
    expect(screen.getByRole('heading', { level: 1, name: /Billing/i })).toBeInTheDocument()
  })

  it('shows Current Plan section with plan name and next billing date', () => {
    wrap(<BillingPage />)
    const section = screen.getByTestId('billing-current-plan')
    expect(section).toBeInTheDocument()
    expect(within(section).getByText(/Current Plan/i)).toBeInTheDocument()
    // shows a plan name badge (Free / Pro / Enterprise)
    expect(within(section).getByText(/^(Free|Pro|Enterprise)$/)).toBeInTheDocument()
    // shows next billing date label
    expect(within(section).getByText(/Next billing/i)).toBeInTheDocument()
  })

  it('shows usage stats: API calls and tokens used', () => {
    wrap(<BillingPage />)
    const usage = screen.getByTestId('billing-usage')
    expect(usage).toBeInTheDocument()
    // labels are standalone <p> elements with exact text
    expect(within(usage).getByText(/API calls/i)).toBeInTheDocument()
    expect(within(usage).getByText(/Tokens used/i)).toBeInTheDocument()
  })

  it('shows Upgrade section with plan cards (Free, Pro, Enterprise)', () => {
    wrap(<BillingPage />)
    const section = screen.getByTestId('billing-upgrade')
    expect(section).toBeInTheDocument()
    // Pro price
    expect(within(section).getByText('$29')).toBeInTheDocument()
    // Enterprise price
    expect(within(section).getByText('$99')).toBeInTheDocument()
    // All upgrade/plan buttons are disabled
    const buttons = within(section).getAllByRole('button')
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  it('shows Usage History table with Date, Description, Amount columns and mock rows', () => {
    wrap(<BillingPage />)
    const section = screen.getByTestId('billing-history')
    expect(section).toBeInTheDocument()
    expect(within(section).getByText(/Usage History/i)).toBeInTheDocument()
    expect(within(section).getByText('Date')).toBeInTheDocument()
    expect(within(section).getByText('Description')).toBeInTheDocument()
    expect(within(section).getByText('Amount')).toBeInTheDocument()
    // At least 3 data rows + 1 header row = 4 total
    const rows = within(section).getAllByRole('row')
    expect(rows.length).toBeGreaterThanOrEqual(4)
  })
})

// ─── SIRI-UX-242: progress fill uses CSS class, not inline transition ─────────

describe('SIRI-UX-242: billing-progress-fill CSS class applied, no inline transition', () => {
  it('progress fill divs have billing-progress-fill class', () => {
    wrap(<BillingPage />)
    const fills = document.querySelectorAll('.billing-progress-fill')
    expect(fills.length).toBeGreaterThanOrEqual(2)
  })

  it('progress fill divs do NOT have inline transition style', () => {
    wrap(<BillingPage />)
    const fills = document.querySelectorAll('.billing-progress-fill')
    fills.forEach((el) => {
      expect((el as HTMLElement).style.transition).toBe('')
    })
  })
})
