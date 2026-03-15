import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider, useToast } from '../context/ToastContext'

// Helper component to trigger toasts
function ToastTrigger({ type, text }: { type: 'success' | 'error' | 'info'; text: string }) {
  const toast = useToast()
  return (
    <button data-testid="trigger" onClick={() => toast[type](text)}>
      Show Toast
    </button>
  )
}

function renderWithToast(type: 'success' | 'error' | 'info' = 'info', text = 'Test message') {
  return render(
    <ToastProvider>
      <ToastTrigger type={type} text={text} />
    </ToastProvider>,
  )
}

describe('Toast System (UX-013)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders toast container in DOM', () => {
    render(<ToastProvider>{null}</ToastProvider>)
    expect(screen.getByTestId('toast-container')).toBeInTheDocument()
  })

  it('shows toast message after trigger', () => {
    renderWithToast('info', 'Hello World')
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('toast.success() shows green success toast', () => {
    renderWithToast('success', 'Agent created')
    fireEvent.click(screen.getByTestId('trigger'))
    const toast = screen.getByTestId('toast-item')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveAttribute('data-type', 'success')
  })

  it('toast.error() shows red error toast', () => {
    renderWithToast('error', 'Something failed')
    fireEvent.click(screen.getByTestId('trigger'))
    const toast = screen.getByTestId('toast-item')
    expect(toast).toHaveAttribute('data-type', 'error')
  })

  it('toast.info() shows info toast', () => {
    renderWithToast('info', 'FYI')
    fireEvent.click(screen.getByTestId('trigger'))
    const toast = screen.getByTestId('toast-item')
    expect(toast).toHaveAttribute('data-type', 'info')
  })

  it('auto-dismisses after 3000ms', () => {
    renderWithToast('info', 'Auto dismiss me')
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Auto dismiss me')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.queryByText('Auto dismiss me')).not.toBeInTheDocument()
  })

  it('dismiss button removes toast immediately', () => {
    vi.useRealTimers()
    renderWithToast('info', 'Close me')
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Close me')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByTestId('toast-close'))
    })

    expect(screen.queryByText('Close me')).not.toBeInTheDocument()
  })

  it('shows max 3 toasts simultaneously', () => {
    function MultiTrigger() {
      const toast = useToast()
      return (
        <button
          data-testid="multi-trigger"
          onClick={() => {
            toast.info('Message 1')
            toast.info('Message 2')
            toast.info('Message 3')
            toast.info('Message 4')
          }}
        >
          Trigger 4
        </button>
      )
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByTestId('multi-trigger'))
    const toasts = screen.getAllByTestId('toast-item')
    expect(toasts.length).toBeLessThanOrEqual(3)
  })

  it('useToast hook is accessible via context', () => {
    function HookConsumer() {
      const toast = useToast()
      expect(typeof toast.success).toBe('function')
      expect(typeof toast.error).toBe('function')
      expect(typeof toast.info).toBe('function')
      return null
    }

    render(
      <ToastProvider>
        <HookConsumer />
      </ToastProvider>,
    )
  })
})
