/**
 * SIRI-UX-295: navigator.platform deprecated
 * Tests that getIsMac() uses navigator.userAgentData?.platform first,
 * falls back to navigator.platform, and detects macOS correctly.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )
}

// Store original navigator descriptors
const origUserAgentData = Object.getOwnPropertyDescriptor(navigator, 'userAgentData')
const origPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')

afterEach(() => {
  // Restore navigator to original state
  if (origUserAgentData) {
    Object.defineProperty(navigator, 'userAgentData', origUserAgentData)
  } else {
    // If it didn't exist originally, delete it
    try { Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true, writable: true }) } catch (_) { /* noop */ }
  }
  if (origPlatform) {
    Object.defineProperty(navigator, 'platform', origPlatform)
  }
  useAgentStore.setState({ agents: [], tasks: [], currentCompany: null })
})

describe('SIRI-UX-295 — getIsMac() uses userAgentData first', () => {
  it('shows ⌘K when navigator.userAgentData.platform is "macOS"', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      configurable: true,
      writable: true,
    })
    renderSearch()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })

  it('shows Ctrl+K when navigator.userAgentData.platform is "Windows"', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Windows' },
      configurable: true,
      writable: true,
    })
    renderSearch()
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument()
  })

  it('shows Ctrl+K when navigator.userAgentData.platform is "Linux"', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Linux' },
      configurable: true,
      writable: true,
    })
    renderSearch()
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument()
  })

  it('falls back to navigator.platform when userAgentData is undefined', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
      writable: true,
    })
    renderSearch()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })

  it('falls back to navigator.platform when userAgentData.platform is empty string', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: '' },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
      writable: true,
    })
    renderSearch()
    // empty string is falsy → should fall back to navigator.platform
    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })

  it('shows Ctrl+K when both userAgentData and platform are non-Mac', () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true,
      writable: true,
    })
    renderSearch()
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument()
  })
})
