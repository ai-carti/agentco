/**
 * SIRI-UX-393 — SettingsPage: labels missing htmlFor + inputs missing id
 *
 * The Provider and API Key labels have no htmlFor/id linkage.
 * Screen readers can't associate label text with the control.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import SettingsPage from '../components/SettingsPage'

function renderSettings() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 'c1', name: 'ACME' }],
  })
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('SIRI-UX-393 SettingsPage — label/input id linkage', () => {
  it('Provider select is accessible by label text', async () => {
    renderSettings()
    const select = await screen.findByRole('combobox', { name: /provider/i })
    expect(select).toBeInTheDocument()
  })

  it('API Key input is accessible by label text', async () => {
    renderSettings()
    const input = await screen.findByLabelText(/api key/i)
    expect(input).toBeInTheDocument()
  })
})
