import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E configuration.
 *
 * Tests run against a local Vite dev server (auto-started by Playwright).
 * All API calls are intercepted via route mocking — no backend required.
 *
 * HOW TO RUN:
 *   npx playwright test
 *
 * To run against a real stack:
 *   1. Start backend: cd backend && uv run uvicorn agentco.main:app --port 8000
 *   2. Start frontend: npm run dev (port 5173)
 *   3. PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
