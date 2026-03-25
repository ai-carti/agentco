// SIRI-UX-237: thinking-dots and LIVE-dot must use CSS classes, not inline animation styles
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  useWarRoomStore.getState().reset()
  vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('SIRI-UX-237: CSS classes for animations (not inline style)', () => {
  it('thinking-dots use war-room-thinking-dot CSS class, not inline animation style', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    // Multiple agents may be thinking simultaneously, use getAllByTestId
    const thinkingAnimations = screen.getAllByTestId('thinking-animation')
    expect(thinkingAnimations.length).toBeGreaterThan(0)
    thinkingAnimations.forEach((thinkingAnimation) => {
      const dots = thinkingAnimation.querySelectorAll('span')
      expect(dots.length).toBeGreaterThan(0)
      dots.forEach((dot) => {
        // must NOT have inline animation style
        expect(dot.style.animation).toBeFalsy()
        // must have the CSS class for animation
        expect(dot.className).toMatch(/war-room-thinking-dot/)
      })
    })
  })

  it('LIVE-dot uses war-room-live-dot CSS class, not inline animation style', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    // SIRI-UX-337: LIVE badge only shows when runStatus !== idle/done/stopped/failed
    act(() => { useWarRoomStore.getState().setRunStatus('active') })

    const liveIndicator = screen.getByTestId('live-indicator')
    const dot = liveIndicator.querySelector('span')
    expect(dot).toBeTruthy()
    // must NOT have inline animation style
    expect(dot!.style.animation).toBeFalsy()
    // must have the CSS class for animation
    expect(dot!.className).toMatch(/war-room-live-dot/)
  })
})
