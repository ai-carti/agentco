/**
 * SIRI-UX-296: GlobalSearch.tsx — `flatResults` is a redundant alias for `results`
 *
 * `const flatResults = results` adds confusion with no actual flatten logic.
 * Fix: remove alias, use `results` directly throughout.
 */
import { describe, it, expect } from 'vitest'

const modules = import.meta.glob('../components/GlobalSearch.tsx', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../components/GlobalSearch.tsx'] as string

describe('SIRI-UX-296: flatResults alias removed', () => {
  it('flatResults alias declaration does not exist', () => {
    expect(src).not.toMatch(/const flatResults\s*=\s*results/)
  })

  it('flatResults identifier is not used anywhere', () => {
    expect(src).not.toContain('flatResults')
  })
})
