import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS_DIR = path.resolve(__dirname, '../components')

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
      const src = fs.readFileSync(path.join(COMPONENTS_DIR, fileName), 'utf-8')
      expect(src).toContain("import { useDocumentTitle } from '../hooks/useDocumentTitle'")
      expect(src).toContain(`useDocumentTitle('${expectedTitle}')`)
    },
  )
})
