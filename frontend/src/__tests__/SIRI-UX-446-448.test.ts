/**
 * SIRI-UX-446: toast-slide-in keyframe moved from inline <style> JSX → index.css
 * SIRI-UX-447: React Router v6 future flags present in BrowserRouter to suppress v7 migration warnings
 * SIRI-UX-448: LibraryPage retry fetch uses AbortController signal to prevent memory leaks
 *
 * Uses import.meta.glob ?raw pattern (RULES.md: never use Node.js fs/path in browser tsconfig)
 */

import { describe, it, expect } from 'vitest'

// Load source files as raw strings via Vite's glob import
const toastModules = import.meta.glob('../context/ToastContext.tsx', { query: '?raw', import: 'default', eager: true })
const mainModules = import.meta.glob('../main.tsx', { query: '?raw', import: 'default', eager: true })
const libraryModules = import.meta.glob('../components/LibraryPage.tsx', { query: '?raw', import: 'default', eager: true })

const toastSrc = toastModules['../context/ToastContext.tsx'] as string
const mainSrc = mainModules['../main.tsx'] as string
const librarySrc = libraryModules['../components/LibraryPage.tsx'] as string

// ─── SIRI-UX-446: toast-slide-in moved to index.css ──────────────────────────
describe('SIRI-UX-446: toast-slide-in keyframe in index.css', () => {
  it('ToastContext.tsx no longer has inline <style> with toast-slide-in', () => {
    // Should not contain the keyframes definition inline in JSX
    expect(toastSrc).not.toContain('@keyframes toast-slide-in')
    // Should not have any <style> tag at all
    expect(toastSrc).not.toContain('<style>')
  })

  it('ToastContext.tsx still references toast-slide-in class in animate-[]', () => {
    // Component uses Tailwind animate-[toast-slide-in...] which references the CSS keyframe
    expect(toastSrc).toContain('toast-slide-in')
  })
})

// ─── SIRI-UX-447: React Router v6 future flags ───────────────────────────────
describe('SIRI-UX-447: React Router v6 future flags in main.tsx', () => {
  it('main.tsx BrowserRouter has v7_startTransition future flag', () => {
    expect(mainSrc).toContain('v7_startTransition')
  })

  it('main.tsx BrowserRouter has v7_relativeSplatPath future flag', () => {
    expect(mainSrc).toContain('v7_relativeSplatPath')
  })
})

// ─── SIRI-UX-448: LibraryPage retry AbortController ─────────────────────────
describe('SIRI-UX-448: LibraryPage retry uses AbortController', () => {
  it('LibraryPage.tsx has retryController ref for retry fetch cancellation', () => {
    expect(librarySrc).toContain('retryController')
  })

  it('LibraryPage.tsx handleRetry creates new AbortController and calls loadAgents', () => {
    expect(librarySrc).toContain('handleRetry')
    expect(librarySrc).toContain('retryController.current?.abort()')
  })

  it('LibraryPage.tsx cleanup effect aborts retryController on unmount', () => {
    expect(librarySrc).toContain('retryController.current?.abort()')
  })

  it('LibraryPage.tsx has a retry button in error state', () => {
    expect(librarySrc).toContain('library-retry-btn')
    expect(librarySrc).toContain('handleRetry')
  })
})
