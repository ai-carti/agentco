/**
 * SIRI-UX-449 — Dead route /companies/:id/warroom
 * The route was unreachable from UI (War Room is always embedded in CompanyPage tab panel).
 * No source code uses navigate/Link/href to /companies/:id/warroom.
 * Expected: route does NOT exist in App.tsx routing table.
 */
import { describe, it, expect } from 'vitest'

// Import App module source via Vite's ?raw query to check statically
// This avoids Node.js fs/path which are not available in browser context
import appSource from '../App.tsx?raw'

describe('SIRI-UX-449 — dead route /companies/:id/warroom removed', () => {
  it('App.tsx does not register /companies/:id/warroom as a <Route path>', () => {
    // The route was dead: War Room is embedded in CompanyPage as a tab.
    // No navigate/Link/href points to /companies/:id/warroom in source code.
    // We check there is no Route element with this path (the string may appear in comments).
    expect(appSource).not.toMatch(/path="\/companies\/:id\/warroom"/)
    expect(appSource).not.toMatch(/path='\/companies\/:id\/warroom'/)
  })

  it('App.tsx does not lazy-import WarRoomPage as a top-level route component', () => {
    // WarRoomPage is still used inside CompanyPage — but should not be a separate lazy route
    expect(appSource).not.toContain("lazy(() => import('./components/WarRoomPage'))")
  })
})
