const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const OUT = '/home/clawdbot/projects/agentco/qa-report/screenshots/after';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  async function ss(name, url, waitFor) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, name), fullPage: false });
      console.log('✅ ' + name);
    } catch (e) {
      console.log('❌ ' + name + ': ' + e.message.split('\n')[0]);
    }
  }

  // 1. Auth page
  await ss('01-auth.png', `${BASE}/auth`);

  // Register a test user
  try {
    await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Sign Up")');
    await page.fill('[aria-label="Email address"]', `audit${Date.now()}@test.com`);
    await page.fill('[aria-label="Password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('Registered user, current URL: ' + page.url());
  } catch (e) {
    console.log('Register error: ' + e.message.split('\n')[0]);
  }

  // 2. Landing / Companies / Onboarding
  await ss('02-landing.png', `${BASE}/`);

  // 3. Mobile views
  await page.setViewportSize({ width: 375, height: 812 });
  await ss('03-auth-mobile.png', `${BASE}/auth`);
  await ss('04-landing-mobile.png', `${BASE}/`);
  await page.setViewportSize({ width: 1280, height: 800 });

  // 4. Use the onboarding template if present
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const onboardingBtn = page.locator('[data-testid="onboarding-use-template-btn"]');
  const hasOnboarding = await onboardingBtn.count() > 0;
  
  if (hasOnboarding) {
    await page.fill('[data-testid="onboarding-company-name-input"]', 'Audit Corp');
    await page.screenshot({ path: path.join(OUT, '05-onboarding-filled.png') });
    console.log('✅ 05-onboarding-filled.png');
    await onboardingBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, '06-company-after-create.png') });
    console.log('✅ 06-company-after-create.png (URL: ' + page.url() + ')');
  } else {
    await page.screenshot({ path: path.join(OUT, '05-companies-list.png') });
    console.log('✅ 05-companies-list.png (no onboarding, has companies)');
    
    // Click first company
    const firstCo = page.locator('[data-testid^="company-item-"]').first();
    if (await firstCo.count() > 0) {
      await firstCo.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, '06-company-page.png') });
      console.log('✅ 06-company-page.png (URL: ' + page.url() + ')');
    }
  }

  // Current page should be company page
  const currentUrl = page.url();
  const companyMatch = currentUrl.match(/companies\/([^/]+)/);
  if (companyMatch) {
    const companyId = companyMatch[1];
    
    // War room tab
    try {
      await page.click('[role="tab"]:has-text("War Room")');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, '07-war-room.png') });
      console.log('✅ 07-war-room.png');
    } catch(e) { console.log('❌ 07-war-room: ' + e.message.split('\n')[0]); }

    // Board tab
    try {
      await page.click('[role="tab"]:has-text("Board")');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '08-kanban-board.png') });
      console.log('✅ 08-kanban-board.png');
    } catch(e) { console.log('❌ 08-kanban-board: ' + e.message.split('\n')[0]); }

    // Mobile company page
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, '09-company-mobile.png') });
    console.log('✅ 09-company-mobile.png');
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  // Settings
  await ss('10-settings.png', `${BASE}/settings`);

  // Library
  await ss('11-library.png', `${BASE}/library`);

  // War Room standalone route
  await ss('12-war-room-standalone.png', `${BASE}/war-room`);

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
