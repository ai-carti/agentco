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
      console.log('OK ' + name);
    } catch (e) {
      console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]);
    }
  }

  // 1. Auth page
  await ss('01-auth.png', `${BASE}/auth`);

  // Register
  try {
    await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Sign Up")');
    await page.fill('[aria-label="Email address"]', `audit${Date.now()}@test.com`);
    await page.fill('[aria-label="Password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  } catch (e) { console.log('Register: ' + e.message.split('\n')[0]); }

  await ss('02-landing.png', `${BASE}/`);

  // mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await ss('03-auth-mobile.png', `${BASE}/auth`);
  await ss('04-landing-mobile.png', `${BASE}/`);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Onboarding
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const onboardingBtn = page.locator('[data-testid="onboarding-use-template-btn"]');
  const hasOnboarding = await onboardingBtn.count() > 0;
  
  if (hasOnboarding) {
    await page.fill('[data-testid="onboarding-company-name-input"]', 'Audit Corp');
    await page.screenshot({ path: path.join(OUT, '05-onboarding-filled.png') });
    console.log('OK 05-onboarding-filled.png');
    await onboardingBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, '06-company-page.png') });
    console.log('OK 06-company-page.png URL:' + page.url());
  } else {
    await page.screenshot({ path: path.join(OUT, '05-companies-list.png') });
    console.log('OK 05-companies-list.png');
    const firstCo = page.locator('[data-testid^="company-item-"]').first();
    if (await firstCo.count() > 0) {
      await firstCo.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, '06-company-page.png') });
      console.log('OK 06-company-page.png URL:' + page.url());
    }
  }

  const currentUrl = page.url();
  const companyMatch = currentUrl.match(/companies\/([^/]+)/);
  if (companyMatch) {
    try {
      await page.click('[role="tab"]:has-text("War Room")');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, '07-war-room.png') });
      console.log('OK 07-war-room.png');
    } catch(e) { console.log('FAIL 07: ' + e.message.split('\n')[0]); }

    try {
      await page.click('[role="tab"]:has-text("Board")');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '08-kanban-board.png') });
      console.log('OK 08-kanban-board.png');
    } catch(e) { console.log('FAIL 08: ' + e.message.split('\n')[0]); }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, '09-company-mobile.png') });
    console.log('OK 09-company-mobile.png');
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  await ss('10-settings.png', `${BASE}/settings`);
  await ss('11-library.png', `${BASE}/library`);
  await ss('12-war-room-standalone.png', `${BASE}/war-room`);

  await browser.close();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
