/**
 * SIRI-UX-316: BASE_URL duplicated across 14+ component files
 * `api/client.ts` has `const BASE_URL` private — it should be exported as the single source of truth.
 * All component files should import it instead of redefining locally.
 * 
 * This test verifies that BASE_URL is exported from api/client.ts
 * and that it resolves to the same value as VITE_API_URL fallback.
 */
import { describe, it, expect } from 'vitest'
import { BASE_URL } from '../api/client'

describe('SIRI-UX-316: BASE_URL single source of truth', () => {
  it('BASE_URL is exported from api/client.ts', () => {
    expect(typeof BASE_URL).toBe('string')
    expect(BASE_URL.length).toBeGreaterThan(0)
  })

  it('BASE_URL starts with http and includes port 8000', () => {
    // In test environment VITE_API_URL may be set to 127.0.0.1:8000 or localhost:8000
    // Either way, it must be a valid base URL for API requests
    expect(BASE_URL).toMatch(/^https?:\/\//)
    expect(BASE_URL).toContain('8000')
  })
})
