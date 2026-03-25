/**
 * SIRI-UX-290: TASK_LIMIT must be module-level (not inside component)
 * SIRI-UX-291: handleCreateAgent must be wrapped in useCallback
 *
 * We validate by reading the source and checking the patterns.
 * Uses dynamic import to avoid Node.js fs/path APIs (tsconfig targets browser).
 */
import { describe, it, expect } from 'vitest'

// Vitest supports ?raw imports to get file content as string
// This avoids needing @types/node (fs/path) in the browser-targeted tsconfig
const modules = import.meta.glob('../components/CompanyPage.tsx', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../components/CompanyPage.tsx'] as string

describe('SIRI-UX-290: TASK_LIMIT is module-level constant', () => {
  it('TASK_LIMIT is declared outside the component function', () => {
    // Module-level means it appears before "export default function CompanyPage"
    const taskLimitIndex = src.indexOf('const TASK_LIMIT')
    const componentIndex = src.indexOf('export default function CompanyPage')
    expect(taskLimitIndex).toBeGreaterThan(-1)
    expect(componentIndex).toBeGreaterThan(-1)
    expect(taskLimitIndex).toBeLessThan(componentIndex)
  })

  it('TASK_LIMIT is not re-declared inside the component body', () => {
    const componentBodyStart = src.indexOf('export default function CompanyPage')
    const bodySlice = src.slice(componentBodyStart)
    // Should not contain another const TASK_LIMIT inside component body
    expect(bodySlice).not.toMatch(/^\s*const TASK_LIMIT\s*=/m)
  })
})

describe('SIRI-UX-291: handleCreateAgent is wrapped in useCallback', () => {
  it('handleCreateAgent uses useCallback', () => {
    expect(src).toMatch(/handleCreateAgent\s*=\s*useCallback\s*\(/)
  })

  it('handleCreateAgent useCallback has dependency array', () => {
    // Find the closing deps array pattern — useCallback ends with ], [deps])
    // Since the function body spans multiple lines, we just check for the closing pattern
    expect(src).toMatch(/\}, \[id, toast\]\)/)
  })
})
