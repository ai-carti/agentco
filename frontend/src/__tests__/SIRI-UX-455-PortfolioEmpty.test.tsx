/**
 * SIRI-UX-455: LibraryPortfolioPage empty task list — styled empty state
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LibraryPortfolioPage from '../components/LibraryPortfolioPage'

describe('SIRI-UX-455: LibraryPortfolioPage empty tasks — styled empty state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agent_name: 'Aria',
        total_tasks: 0,
        success_rate: 0,
        tasks: [],
      }),
    }))
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows data-testid="portfolio-empty" when tasks array is empty', async () => {
    render(
      <MemoryRouter initialEntries={['/library/agent-1/portfolio']}>
        <Routes>
          <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-empty')).toBeInTheDocument()
    })
  })
})
