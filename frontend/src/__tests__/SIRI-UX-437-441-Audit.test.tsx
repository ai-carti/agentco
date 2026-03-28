/**
 * SIRI-UX-437: BillingPage useDocumentTitle
 * SIRI-UX-438: ToastContext aria-live
 * SIRI-UX-439: AgentCard React.memo
 * SIRI-UX-440: CompanyHeader React.memo
 * SIRI-UX-441: FilterBar React.memo
 */
import { describe, it, expect } from 'vitest'

describe('SIRI-UX-437: BillingPage has useDocumentTitle', () => {
  it('BillingPage source imports and calls useDocumentTitle', async () => {
    const src = await import('../pages/BillingPage?raw')
    const code = (src as { default: string }).default
    expect(code).toContain("useDocumentTitle('Billing — AgentCo')")
  })
})

describe('SIRI-UX-438: ToastContext has aria-live on container', () => {
  it('toast-container has role="status" and aria-live="polite"', async () => {
    const src = await import('../context/ToastContext?raw')
    const code = (src as { default: string }).default
    expect(code).toContain('aria-live="polite"')
    expect(code).toContain('role="status"')
  })
})

describe('SIRI-UX-439: AgentCard is wrapped in React.memo', () => {
  it('AgentCard source uses React.memo', async () => {
    const src = await import('../components/AgentCard?raw')
    const code = (src as { default: string }).default
    expect(code).toContain('React.memo(function AgentCard')
  })
})

describe('SIRI-UX-440: CompanyHeader is wrapped in React.memo', () => {
  it('CompanyHeader source uses React.memo', async () => {
    const src = await import('../components/CompanyPage?raw')
    const code = (src as { default: string }).default
    expect(code).toContain('React.memo(function CompanyHeader')
  })
})

describe('SIRI-UX-441: FilterBar is wrapped in React.memo', () => {
  it('FilterBar source uses React.memo', async () => {
    const src = await import('../components/KanbanBoard?raw')
    const code = (src as { default: string }).default
    expect(code).toContain('React.memo(function FilterBar')
  })
})
