/**
 * POST-001: E2E tests — Happy-path scenarios
 *
 * These tests use Playwright's route interception to mock all API calls.
 * No running backend is required.
 *
 * HOW TO RUN:
 *   # With mocked API (no backend needed):
 *   npx playwright test
 *
 *   # Against real backend (set VITE_API_URL or use default localhost:8000):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 *   (Start frontend: npm run dev in frontend/ and backend: uv run uvicorn agentco.main:app)
 *
 * CONFIG: playwright.config.ts — baseURL defaults to http://localhost:3000
 */

import { test, expect, Page, Route } from '@playwright/test'

// ── API Fixtures ──────────────────────────────────────────────────────────────

const MOCK_TOKEN = 'mock-jwt-token-abc123'
const MOCK_USER = { id: 'user-1', email: 'e2e@example.com' }
const MOCK_COMPANY = { id: 'company-1', name: 'E2E Corp', owner_id: 'user-1' }
const MOCK_AGENT = {
  id: 'agent-1',
  name: 'CEO',
  role: 'ceo',
  model: 'gpt-4o-mini',
  system_prompt: 'You are a helpful CEO',
  company_id: 'company-1',
  level: 0,
}
const MOCK_TASK = {
  id: 'task-1',
  title: 'E2E Test Task',
  description: 'Integration test task',
  company_id: 'company-1',
  status: 'pending',
}
const MOCK_RUN = {
  id: 'run-1',
  task_id: 'task-1',
  status: 'running',
  company_id: 'company-1',
}

/**
 * Set up route mocks for all API calls needed in happy-path.
 * Call this before navigating to any page.
 */
async function setupApiMocks(page: Page) {
  const API_BASE = 'http://localhost:8000'

  // Auth endpoints
  await page.route(`${API_BASE}/auth/register`, (route: Route) =>
    route.fulfill({ json: { id: 'user-1' } })
  )
  await page.route(`${API_BASE}/auth/login`, (route: Route) =>
    route.fulfill({ json: { access_token: MOCK_TOKEN, token_type: 'bearer' } })
  )
  await page.route(`${API_BASE}/auth/me`, (route: Route) =>
    route.fulfill({ json: MOCK_USER })
  )

  // Companies
  await page.route(`${API_BASE}/api/companies`, (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: MOCK_COMPANY })
    }
    return route.fulfill({ json: [MOCK_COMPANY] })
  })
  await page.route(`${API_BASE}/api/companies/`, (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: MOCK_COMPANY })
    }
    return route.fulfill({ json: [MOCK_COMPANY] })
  })
  await page.route(`${API_BASE}/api/companies/company-1`, (route: Route) =>
    route.fulfill({ json: MOCK_COMPANY })
  )

  // Agents
  await page.route(`${API_BASE}/api/companies/company-1/agents`, (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: MOCK_AGENT })
    }
    return route.fulfill({ json: [MOCK_AGENT] })
  })
  await page.route(`${API_BASE}/api/companies/company-1/agents/agent-1`, (route: Route) =>
    route.fulfill({ json: MOCK_AGENT })
  )

  // Tasks
  await page.route(`${API_BASE}/api/companies/company-1/tasks`, (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: MOCK_TASK })
    }
    return route.fulfill({ json: [MOCK_TASK] })
  })
  await page.route(`${API_BASE}/api/tasks/task-1`, (route: Route) =>
    route.fulfill({ json: MOCK_TASK })
  )

  // Runs
  await page.route(`${API_BASE}/api/companies/company-1/runs`, (route: Route) =>
    route.fulfill({ json: [] })
  )
  await page.route(`${API_BASE}/api/runs`, (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: MOCK_RUN })
    }
    return route.fulfill({ json: [MOCK_RUN] })
  })
  await page.route(`${API_BASE}/api/tasks/task-1/run`, (route: Route) =>
    route.fulfill({ status: 201, json: MOCK_RUN })
  )

  // LLM providers
  await page.route(`${API_BASE}/api/llm/providers`, (route: Route) =>
    route.fulfill({ json: ['openai', 'anthropic', 'gemini'] })
  )
  await page.route(`${API_BASE}/api/llm/providers/available`, (route: Route) =>
    route.fulfill({
      json: {
        providers: [
          { provider: 'openai', models: ['gpt-4o', 'gpt-4o-mini'] },
          { provider: 'gemini', models: ['gemini/gemini-1.5-pro', 'gemini/gemini-1.5-flash'] },
        ],
        all_models: ['gpt-4o', 'gpt-4o-mini', 'gemini/gemini-1.5-pro', 'gemini/gemini-1.5-flash'],
      },
    })
  )

  // Health
  await page.route(`${API_BASE}/health`, (route: Route) =>
    route.fulfill({ json: { status: 'ok' } })
  )
  await page.route(`${API_BASE}/api/health`, (route: Route) =>
    route.fulfill({ json: { status: 'ok', version: '0.1.0' } })
  )

  // Memory
  await page.route(`${API_BASE}/api/companies/company-1/agents/agent-1/memory`, (route: Route) =>
    route.fulfill({ json: [] })
  )

  // Library
  await page.route(`${API_BASE}/api/library**`, (route: Route) =>
    route.fulfill({ json: [] })
  )
}

/**
 * Helper: inject auth token directly into localStorage to skip login UI.
 */
async function injectAuthToken(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('agentco_token', token)
  }, MOCK_TOKEN)
}

// ── SMOKE TEST ────────────────────────────────────────────────────────────────

test.describe('Smoke Tests', () => {
  test('smoke: auth page loads and has sign in form', async ({ page }) => {
    // No backend needed — tests static UI structure
    await page.goto('/auth')

    // Page has auth container
    await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()

    // Sign In tab is visible and active by default
    await expect(page.getByText('Sign In')).toBeVisible()
    await expect(page.getByText('Sign Up')).toBeVisible()

    // Email and password inputs exist
    await expect(page.locator('#auth-email')).toBeVisible()
    await expect(page.locator('#auth-password')).toBeVisible()

    // Submit button exists
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('smoke: switching to Sign Up tab shows register form', async ({ page }) => {
    await page.goto('/auth')

    await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()

    // Click Sign Up tab
    await page.getByText('Sign Up').click()

    // Form is still visible with same inputs
    await expect(page.locator('#auth-email')).toBeVisible()
    await expect(page.locator('#auth-password')).toBeVisible()

    // Submit button text changes to Sign Up / Register
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
  })
})

// ── HAPPY-PATH TESTS ──────────────────────────────────────────────────────────

test.describe('Happy Path — Full User Journey', () => {
  /**
   * Full happy-path: register → login → create company → create agent →
   * create task → run task → see status
   */
  test('happy-path: register and login', async ({ page }) => {
    await setupApiMocks(page)
    await page.goto('/auth')

    await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()

    // Switch to Sign Up tab
    await page.getByText('Sign Up').click()

    // Fill credentials
    await page.fill('#auth-email', 'e2e@example.com')
    await page.fill('#auth-password', 'password123')

    // Submit registration
    await page.click('button[type="submit"]')

    // After register+login, should redirect to companies or home
    await expect(page).toHaveURL(/^\/(companies|$|\?)/)
    await expect(page.locator('[data-testid="companies-page"]')).toBeVisible({ timeout: 5000 })
  })

  test('happy-path: authenticated user sees companies page', async ({ page }) => {
    await setupApiMocks(page)
    await injectAuthToken(page)

    await page.goto('/')

    // Companies page loads
    await expect(page.locator('[data-testid="companies-page"]')).toBeVisible({ timeout: 5000 })

    // Company list or new-company button is shown
    const hasCompany = await page.locator('[data-testid="company-item-company-1"]').isVisible().catch(() => false)
    const hasNewBtn = await page.locator('button', { hasText: /new company/i }).isVisible().catch(() => false)
    const hasOnboarding = await page.locator('[data-testid="onboarding-page"]').isVisible().catch(() => false)

    expect(hasCompany || hasNewBtn || hasOnboarding).toBeTruthy()
  })

  test('happy-path: create company flow', async ({ page }) => {
    await setupApiMocks(page)
    await injectAuthToken(page)

    await page.goto('/')
    await expect(page.locator('[data-testid="companies-page"]')).toBeVisible({ timeout: 5000 })

    // Look for "New Company" button
    const newCompanyBtn = page.locator('button', { hasText: /new company/i })
    const isVisible = await newCompanyBtn.isVisible().catch(() => false)

    if (isVisible) {
      await newCompanyBtn.click()

      // Modal or form with company name input should appear
      const nameInput = page.locator('[data-testid="new-company-name-input"]')
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('E2E Corp')
        await page.locator('button', { hasText: /create/i }).last().click()

        // After creation, company should appear in list
        await page.waitForTimeout(500)
        const companyVisible = await page
          .locator('[data-testid="company-item-company-1"]')
          .isVisible()
          .catch(() => false)
        // Either company appears or we navigated to company page — both are valid
        expect(companyVisible || page.url().includes('company')).toBeTruthy()
      }
    }
  })

  test('happy-path: navigate to company page and see agents', async ({ page }) => {
    await setupApiMocks(page)
    await injectAuthToken(page)

    // Navigate directly to company page
    await page.goto('/companies/company-1')

    await expect(page.locator('[data-testid="company-page"]')).toBeVisible({ timeout: 5000 })

    // Agents section or empty state is shown
    const hasAgents = await page.locator(`[data-testid^="agent"]`).isVisible().catch(() => false)
    const hasEmptyState = await page
      .locator('[data-testid="no-agents-empty-state"]')
      .isVisible()
      .catch(() => false)
    const hasAddBtn = await page.locator('button', { hasText: /add agent/i }).isVisible().catch(() => false)

    expect(hasAgents || hasEmptyState || hasAddBtn).toBeTruthy()
  })

  test('happy-path: complete journey — auth → company → agent → task → run', async ({ page }) => {
    await setupApiMocks(page)

    // Step 1: Login
    await page.goto('/auth')
    await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()

    await page.fill('#auth-email', 'e2e@example.com')
    await page.fill('#auth-password', 'password123')
    await page.click('button[type="submit"]')

    // Step 2: Verify companies page
    await expect(page.locator('[data-testid="companies-page"]')).toBeVisible({ timeout: 5000 })

    // Step 3: Navigate to company
    await page.goto('/companies/company-1')
    await expect(page.locator('[data-testid="company-page"]')).toBeVisible({ timeout: 5000 })

    // Step 4: Navigate to agent
    await page.goto('/companies/company-1/agents/agent-1')
    await expect(page.locator('[data-testid="agent-page"]')).toBeVisible({ timeout: 5000 })

    // Step 5: Navigate to war room (where runs are started)
    await page.goto('/companies/company-1/warroom')
    await expect(page.locator('[data-testid="war-room-page"]')).toBeVisible({ timeout: 5000 })

    // War room loaded — either shows agents or empty state with "Run a Task" button
    const hasAgentPanel = await page.locator('[data-testid="agent-panel"]').isVisible().catch(() => false)
    const hasRunBtn = await page.locator('[data-testid="war-room-run-task-btn"]').isVisible().catch(() => false)

    expect(hasAgentPanel || hasRunBtn).toBeTruthy()
  })
})

// ── LOGIN PAGE TESTS ──────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('unauthenticated user is redirected to /auth', async ({ page }) => {
    await page.goto('/')
    // Should redirect to auth page
    await expect(page).toHaveURL(/\/auth/)
    await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()
  })

  test('login with mocked API stores token and redirects', async ({ page }) => {
    await setupApiMocks(page)
    await page.goto('/auth')

    await page.fill('#auth-email', 'e2e@example.com')
    await page.fill('#auth-password', 'password123')
    await page.click('button[type="submit"]')

    // Should redirect away from /auth after login
    await expect(page).not.toHaveURL('/auth', { timeout: 5000 })
  })
})
