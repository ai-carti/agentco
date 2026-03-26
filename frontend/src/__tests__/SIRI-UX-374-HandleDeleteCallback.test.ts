/**
 * SIRI-UX-374: SettingsPage.tsx — handleDelete not wrapped in useCallback.
 *
 * handleDelete(id: string) is a plain async function recreated on every render.
 * Inside credentials.map(), each render creates N inline closures `() => handleDelete(cred.id)`.
 * Wrapping in useCallback([selectedCompanyId, toast]) makes it stable.
 *
 * This is a structural test: verifies the source file contains the useCallback wrapper.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('SIRI-UX-374: SettingsPage handleDelete is wrapped in useCallback', () => {
  it('SettingsPage source contains useCallback for handleDelete', () => {
    const srcPath = path.resolve(__dirname, '../components/SettingsPage.tsx')
    const src = fs.readFileSync(srcPath, 'utf-8')
    // Should have useCallback wrapping handleDelete
    // Pattern: useCallback(async (id: ...) or const handleDelete = useCallback(
    expect(src).toMatch(/handleDelete\s*=\s*useCallback/)
  })
})
