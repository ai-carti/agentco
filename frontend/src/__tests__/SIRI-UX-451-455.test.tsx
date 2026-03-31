/**
 * SIRI-UX-451: CompanyPage document title includes company name
 * SIRI-UX-452: KanbanBoard has overflow-x-auto so 6 columns don't squeeze on narrow screens
 * SIRI-UX-453: Toast auto-dismiss is longer for errors (5s) than success (3s)
 * SIRI-UX-454: OnboardingPage company name input has autoFocus
 * SIRI-UX-455: LibraryPortfolioPage empty task list uses styled empty state (not bare <p>)
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useEffect } from 'react'

// ────────────────────────────────────────────────────────────────────────────
// SIRI-UX-453: Toast auto-dismiss: error=5s, success/info=3s
// ────────────────────────────────────────────────────────────────────────────
import { ToastProvider, useToast } from '../context/ToastContext'

function ErrorToastTrigger() {
  const toast = useToast()
  useEffect(() => { toast.error('Something failed') }, [])
  return null
}

function SuccessToastTrigger() {
  const toast = useToast()
  useEffect(() => { toast.success('Done!') }, [])
  return null
}

describe('SIRI-UX-453: Toast dismiss timing', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('success toast dismisses after 3s', async () => {
    render(
      <ToastProvider>
        <SuccessToastTrigger />
      </ToastProvider>,
    )
    expect(screen.getAllByTestId('toast-item').length).toBeGreaterThan(0)
    await act(async () => { vi.advanceTimersByTime(3100) })
    expect(screen.queryByTestId('toast-item')).toBeNull()
  })

  it('error toast persists after 3s but dismisses after 5s', async () => {
    render(
      <ToastProvider>
        <ErrorToastTrigger />
      </ToastProvider>,
    )
    expect(screen.getAllByTestId('toast-item').length).toBeGreaterThan(0)

    // still visible at 3s
    await act(async () => { vi.advanceTimersByTime(3100) })
    expect(screen.queryAllByTestId('toast-item').length).toBeGreaterThan(0)

    // gone after 5s
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByTestId('toast-item')).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// SIRI-UX-454: OnboardingPage company name input has autoFocus
// ────────────────────────────────────────────────────────────────────────────
import OnboardingPage from '../components/OnboardingPage'

describe('SIRI-UX-454: OnboardingPage company name input autoFocus', () => {
  it('company name input is focused on mount', () => {
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )
    const input = screen.getByTestId('onboarding-company-name-input')
    expect(document.activeElement).toBe(input)
  })
})
