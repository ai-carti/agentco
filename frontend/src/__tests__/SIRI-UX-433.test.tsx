/**
 * SIRI-UX-433: All page components have useDocumentTitle (WCAG 2.4.2)
 *
 * SIRI-UX-436: Uses import.meta.glob with ?raw to read source without Node.js fs/path APIs
 * (tsconfig targets browser, no @types/node available).
 */
import { describe, it, expect } from 'vitest'

// Load all component sources via ?raw glob (no Node.js fs/path needed)
const componentModules = import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function getComponentSrc(fileName: string): string {
  const key = `../components/${fileName}`
  const src = componentModules[key]
  if (!src) throw new Error(`Component source not found: ${key}`)
  return src
}

const PAGES_WITH_TITLES: Array<[string, string]> = [
  ['AgentPage.tsx', 'Agent — AgentCo'],
  ['AgentEditPage.tsx', 'Edit Agent — AgentCo'],
  ['CompanyPage.tsx', 'Company — AgentCo'],
  ['CompanySettingsPage.tsx', 'Company Settings — AgentCo'],
  ['OnboardingPage.tsx', 'Onboarding — AgentCo'],
  ['AuthPage.tsx', 'Sign In — AgentCo'],
  ['SettingsPage.tsx', 'Settings — AgentCo'],
  ['LibraryPortfolioPage.tsx', 'Portfolio — AgentCo'],
  ['NotFoundPage.tsx', 'Not Found — AgentCo'],
]

describe('SIRI-UX-433: All pages have useDocumentTitle', () => {
  it.each(PAGES_WITH_TITLES)(
    '%s calls useDocumentTitle with expected title',
    (fileName, expectedTitle) => {
      const src = getComponentSrc(fileName)
      expect(src).toContain("import { useDocumentTitle } from '../hooks/useDocumentTitle'")
      expect(src).toContain(`useDocumentTitle('${expectedTitle}')`)
    },
  )
})
