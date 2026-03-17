import { test, expect } from '@playwright/test'

// Test 1: user can login
test('user can login', async ({ page }) => {
  // requires running backend
  test.skip(true, 'requires running backend')

  await page.goto('/auth')

  // AuthPage has data-testid="auth-page" and inputs with id="auth-email" / id="auth-password"
  await expect(page.locator('[data-testid="auth-page"]')).toBeVisible()

  await page.fill('#auth-email', 'test@example.com')
  await page.fill('#auth-password', 'password123')

  // Button text is "Sign In" (tab=signin is default)
  await page.click('button[type="submit"]')

  // After login, ProtectedRoute redirects to / or /companies
  await expect(page).toHaveURL(/^\/(companies)?$/)
})

// Test 2: user can see companies page
test('user can see companies page', async ({ page }) => {
  // requires running backend
  test.skip(true, 'requires running backend')

  await page.goto('/auth')
  await page.fill('#auth-email', 'test@example.com')
  await page.fill('#auth-password', 'password123')
  await page.click('button[type="submit"]')

  // Should land on companies page
  await page.goto('/companies')

  // CompaniesPage renders data-testid="companies-page"
  await expect(page.locator('[data-testid="companies-page"]')).toBeVisible()

  // Either h1 "Companies" or onboarding with "Welcome to AgentCo"
  const hasCompaniesHeading = await page.locator('h1', { hasText: /companies/i }).isVisible().catch(() => false)
  const hasNewCompanyBtn = await page.locator('button', { hasText: /new company/i }).isVisible().catch(() => false)
  const hasOnboarding = await page.locator('[data-testid="onboarding-page"]').isVisible().catch(() => false)

  expect(hasCompaniesHeading || hasNewCompanyBtn || hasOnboarding).toBeTruthy()
})

// Test 3: empty state shows when no companies
test('empty state shows when no companies', async ({ page }) => {
  // requires running backend
  test.skip(true, 'requires running backend')

  await page.goto('/auth')
  await page.fill('#auth-email', 'test@example.com')
  await page.fill('#auth-password', 'password123')
  await page.click('button[type="submit"]')

  await page.goto('/companies')
  await expect(page.locator('[data-testid="companies-page"]')).toBeVisible()

  // When no companies exist, CompaniesPage shows OnboardingPage (data-testid="onboarding-page")
  // or EmptyState with text "No companies yet"
  const hasOnboarding = await page.locator('[data-testid="onboarding-page"]').isVisible().catch(() => false)
  const hasEmptyState = await page.locator('text=No companies yet').isVisible().catch(() => false)
  const hasWelcome = await page.locator('text=Welcome to AgentCo').isVisible().catch(() => false)

  expect(hasOnboarding || hasEmptyState || hasWelcome).toBeTruthy()
})
