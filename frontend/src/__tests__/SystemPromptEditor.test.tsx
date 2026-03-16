import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SystemPromptEditor from '../components/SystemPromptEditor'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', vi.fn())
})

describe('SystemPromptEditor — UX-015', () => {
  it('renders a textarea (not input) for system prompt', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    const textarea = screen.getByTestId('system-prompt-textarea')
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('textarea has min-h-[200px] class and font-mono', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    const textarea = screen.getByTestId('system-prompt-textarea')
    expect(textarea.className).toContain('min-h-[200px]')
    expect(textarea.className).toContain('font-mono')
  })

  it('textarea has text-sm class', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    const textarea = screen.getByTestId('system-prompt-textarea')
    expect(textarea.className).toContain('text-sm')
  })

  it('textarea has resize-y class', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    const textarea = screen.getByTestId('system-prompt-textarea')
    expect(textarea.className).toContain('resize-y')
  })

  it('shows token counter', () => {
    render(<SystemPromptEditor value="hello world test" onChange={vi.fn()} />)
    // 3 words * 1.3 = 3.9 → Math.round = 4
    expect(screen.getByTestId('token-counter')).toBeInTheDocument()
    expect(screen.getByTestId('token-counter').textContent).toContain('4')
  })

  it('token counter shows 0 for empty string', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('token-counter').textContent).toContain('0')
  })

  it('token counter has text-xs class', () => {
    render(<SystemPromptEditor value="hello" onChange={vi.fn()} />)
    expect(screen.getByTestId('token-counter').className).toContain('text-xs')
  })

  it('token counter is gray when tokens <= 2000', () => {
    render(<SystemPromptEditor value="hello world" onChange={vi.fn()} />)
    expect(screen.getByTestId('token-counter').className).toContain('text-gray-500')
  })

  it('token counter turns yellow when tokens > 2000', () => {
    // Need > 2000 tokens: ~1539 words * 1.3 = ~2000.7 → use 1540 words
    const manyWords = Array(1540).fill('word').join(' ')
    render(<SystemPromptEditor value={manyWords} onChange={vi.fn()} />)
    expect(screen.getByTestId('token-counter').className).toContain('text-yellow-400')
  })

  it('renders 3 template buttons', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('template-btn-ceo')).toBeInTheDocument()
    expect(screen.getByTestId('template-btn-cto')).toBeInTheDocument()
    expect(screen.getByTestId('template-btn-pm')).toBeInTheDocument()
  })

  it('template buttons have correct labels', () => {
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('template-btn-ceo').textContent).toContain('CEO Template')
    expect(screen.getByTestId('template-btn-cto').textContent).toContain('CTO Template')
    expect(screen.getByTestId('template-btn-pm').textContent).toContain('PM Template')
  })

  it('clicking template on empty field calls onChange with template text', () => {
    const onChange = vi.fn()
    render(<SystemPromptEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('template-btn-ceo'))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('CEO'))
  })

  it('clicking CTO template on empty field sets CTO text', () => {
    const onChange = vi.fn()
    render(<SystemPromptEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('template-btn-cto'))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('CTO'))
  })

  it('clicking PM template on empty field sets PM text', () => {
    const onChange = vi.fn()
    render(<SystemPromptEditor value="" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('template-btn-pm'))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Product Manager'))
  })

  it('clicking template when field has content shows confirm dialog', () => {
    const mockConfirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', mockConfirm)
    render(<SystemPromptEditor value="existing content" onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('template-btn-ceo'))
    expect(mockConfirm).toHaveBeenCalledWith('Replace current prompt?')
  })

  it('replaces content when user confirms', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const onChange = vi.fn()
    render(<SystemPromptEditor value="existing content" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('template-btn-ceo'))
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('CEO'))
  })

  it('does NOT replace content when user cancels confirm', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
    const onChange = vi.fn()
    render(<SystemPromptEditor value="existing content" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('template-btn-ceo'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does NOT show confirm when field is empty', () => {
    const mockConfirm = vi.fn().mockReturnValue(true)
    vi.stubGlobal('confirm', mockConfirm)
    render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('template-btn-ceo'))
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('calls onChange when user types in textarea', () => {
    const onChange = vi.fn()
    render(<SystemPromptEditor value="" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('system-prompt-textarea'), {
      target: { value: 'new text' },
    })
    expect(onChange).toHaveBeenCalledWith('new text')
  })

  it('updates token counter when value changes', () => {
    const { rerender } = render(<SystemPromptEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId('token-counter').textContent).toContain('0')
    rerender(<SystemPromptEditor value="one two three" onChange={vi.fn()} />)
    // 3 words * 1.3 = 3.9 → 4
    expect(screen.getByTestId('token-counter').textContent).toContain('4')
  })
})
