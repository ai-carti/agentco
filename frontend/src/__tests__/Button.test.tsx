import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Button from '../components/Button'

describe('Button component (UX-POLISH-005)', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: /save/i })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toMatch(/primary|btn-primary/)
  })

  it('applies primary variant — blue filled style', () => {
    render(<Button variant="primary">Save Agent</Button>)
    const btn = screen.getByRole('button', { name: /save agent/i })
    expect(btn.className).toMatch(/primary/)
  })

  it('applies secondary variant — outlined style', () => {
    render(<Button variant="secondary">Edit</Button>)
    const btn = screen.getByRole('button', { name: /edit/i })
    expect(btn.className).toMatch(/secondary/)
  })

  it('applies danger variant — red filled style', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button', { name: /delete/i })
    expect(btn.className).toMatch(/danger/)
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)
    fireEvent.click(screen.getByRole('button', { name: /click me/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button', { name: /disabled/i })).toBeDisabled()
  })

  it('renders as submit button with type prop', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button', { name: /submit/i })).toHaveAttribute('type', 'submit')
  })

  it('passes through data-testid', () => {
    render(<Button data-testid="my-btn">Test</Button>)
    expect(screen.getByTestId('my-btn')).toBeInTheDocument()
  })

  it('primary variant has blue background class', () => {
    render(<Button variant="primary">Primary</Button>)
    const btn = screen.getByRole('button', { name: /primary/i })
    // className should include some blue/primary indicator
    expect(btn.className).toMatch(/primary|blue/)
  })

  it('danger variant has red background class', () => {
    render(<Button variant="danger">Danger</Button>)
    const btn = screen.getByRole('button', { name: /danger/i })
    expect(btn.className).toMatch(/danger|red/)
  })
})

// --- SIRI-UX-249: Button uses CSS classes for hover, not JS handlers ---
describe('SIRI-UX-249: Button uses CSS hover classes', () => {
  it('primary button has btn-primary class for CSS hover', () => {
    render(<Button variant="primary">Save</Button>)
    const btn = screen.getByRole('button', { name: /save/i })
    expect(btn.className).toContain('btn-primary')
  })

  it('secondary button has btn-secondary class for CSS hover', () => {
    render(<Button variant="secondary">Cancel</Button>)
    const btn = screen.getByRole('button', { name: /cancel/i })
    expect(btn.className).toContain('btn-secondary')
  })

  it('danger button has btn-danger class for CSS hover', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button', { name: /delete/i })
    expect(btn.className).toContain('btn-danger')
  })

  it('button does not have inline background style manipulated by JS hover', () => {
    render(<Button variant="primary">Click</Button>)
    const btn = screen.getByRole('button', { name: /click/i })
    // After initial render, inline style should not override background
    // (CSS class handles it)
    expect(btn.style.background).toBe('')
  })
})
