/**
 * Tests for SIRI-UX-065 to SIRI-UX-069 fixes
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// ---- SIRI-UX-065: ForkModal has role="dialog", aria-modal, aria-label, Escape ----
describe('SIRI-UX-065: ForkModal accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', name: 'Company 1' }],
    }))
  })

  it('ForkModal has role=dialog, aria-modal, aria-label', async () => {
    const { default: LibraryPage } = await import('../components/LibraryPage')
    // Render with an agent so Fork button is visible
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a1', name: 'Test Agent', role: 'CEO' }],
    }))
    render(<MemoryRouter><LibraryPage /></MemoryRouter>)
    // Wait for agent to render
    const forkBtn = await screen.findByTestId('fork-btn-a1')
    fireEvent.click(forkBtn)
    const modal = await screen.findByTestId('fork-modal')
    expect(modal).toHaveAttribute('role', 'dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAttribute('aria-label', 'Fork to Company')
  })

  it('ForkModal closes on Escape key', async () => {
    const { default: LibraryPage } = await import('../components/LibraryPage')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a1', name: 'Test Agent', role: 'CEO' }],
    }))
    render(<MemoryRouter><LibraryPage /></MemoryRouter>)
    const forkBtn = await screen.findByTestId('fork-btn-a1')
    fireEvent.click(forkBtn)
    const modal = await screen.findByTestId('fork-modal')
    expect(modal).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('fork-modal')).not.toBeInTheDocument()
  })
})

// ---- SIRI-UX-066: AgentForm labels have htmlFor/id ----
describe('SIRI-UX-066: AgentForm label associations', () => {
  it('Name label is associated with name input', async () => {
    const { default: AgentForm } = await import('../components/AgentForm')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['gpt-4o'],
    }))
    render(<AgentForm onSubmit={vi.fn()} />)
    const nameInput = screen.getByTestId('agent-name-input')
    expect(nameInput).toHaveAttribute('id', 'agent-name')
    const label = screen.getByLabelText('Name')
    expect(label).toBe(nameInput)
  })

  it('Model select label is associated via htmlFor', async () => {
    const { default: AgentForm } = await import('../components/AgentForm')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['gpt-4o'],
    }))
    render(<AgentForm onSubmit={vi.fn()} />)
    const modelSelect = screen.getByTestId('model-select')
    expect(modelSelect).toHaveAttribute('id', 'agent-model')
  })
})

// ---- SIRI-UX-067: OnboardingPage company name input has aria-label ----
describe('SIRI-UX-067: OnboardingPage company name aria-label', () => {
  it('company name input has aria-label', async () => {
    const { default: OnboardingPage } = await import('../components/OnboardingPage')
    vi.stubGlobal('fetch', vi.fn())
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    const input = screen.getByTestId('onboarding-company-name-input')
    expect(input).toHaveAttribute('aria-label', 'Company name')
  })
})

// ---- SIRI-UX-068: WarRoomPage activity feed has aria-live ----
describe('SIRI-UX-068: WarRoomPage activity feed aria-live', () => {
  it('activity feed container has aria-live=polite', async () => {
    // SIRI-UX-222: loadMockData now requires VITE_MOCK_WAR_ROOM='true'
    vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
    const { default: WarRoomPage } = await import('../components/WarRoomPage')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    vi.stubGlobal('WebSocket', class {
      onopen: (() => void) | null = null
      onmessage: ((e: MessageEvent) => void) | null = null
      onclose: (() => void) | null = null
      close() {}
    })
    // SIRI-UX-376: WarRoomPage requires :id param via Route
    const { Route, Routes } = await import('react-router-dom')
    render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    // activity-feed is rendered when agents exist (mock data loads)
    const feed = await screen.findByTestId('activity-feed')
    const liveRegion = feed.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    vi.unstubAllEnvs()
  })
})

// ---- SIRI-UX-069: LibraryPage uses limit=50 pagination ----
describe('SIRI-UX-069: LibraryPage uses pagination limit', () => {
  it('fetches library with limit=50', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    const { default: LibraryPage } = await import('../components/LibraryPage')
    render(<MemoryRouter><LibraryPage /></MemoryRouter>)
    await screen.findByTestId('library-empty')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('limit=50'),
      expect.anything()
    )
  })
})
