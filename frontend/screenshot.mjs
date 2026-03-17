import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const DIR = '/home/clawdbot/projects/agentco/qa-report/screenshots';
mkdirSync(DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    proxy: { server: 'direct://' }
  });
  const ctx = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  // 01-login.png
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(1000);
  await page.screenshot({ path: `${DIR}/01-login.png`, fullPage: true });
  console.log('✅ 01-login.png');

  // Try to login first with existing account, fallback to register
  let loggedIn = false;
  try {
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill('test@test.com');
      await passInput.fill('password123');
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await sleep(2000);
      loggedIn = true;
    }
  } catch(e) {
    console.log('Login attempt 1 error:', e.message);
  }

  // Check if we got redirected (logged in) or still on login page
  const currentUrl = page.url();
  console.log('After login attempt, URL:', currentUrl);

  // If still on login, try registering
  if (currentUrl.includes('login') || currentUrl.includes('auth')) {
    try {
      const registerLink = page.locator('a:has-text("Register"), a:has-text("Sign up"), button:has-text("Register")').first();
      if (await registerLink.count() > 0) {
        await registerLink.click();
        await sleep(500);
        await page.screenshot({ path: `${DIR}/01b-register.png`, fullPage: true });
        console.log('✅ 01b-register.png');
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        const passInput = page.locator('input[type="password"]').first();
        if (await emailInput.count() > 0) {
          await emailInput.fill('test@test.com');
          await passInput.fill('password123');
        }
        const submitBtn = page.locator('button[type="submit"]').first();
        await submitBtn.click();
        await sleep(2000);
      }
    } catch(e) {
      console.log('Register error:', e.message);
    }
  }

  // 02-companies-empty.png — after login
  await sleep(1000);
  await page.screenshot({ path: `${DIR}/02-companies-empty.png`, fullPage: true });
  console.log('✅ 02-companies-empty.png');

  // Create a test company via API
  let companyId = null;
  try {
    const token = await page.evaluate(() => {
      return localStorage.getItem('token') || 
             localStorage.getItem('access_token') ||
             Object.entries(localStorage).find(([k]) => k.includes('token'))?.[1];
    });
    console.log('Token found:', token ? 'yes (len=' + token.length + ')' : 'no');
    
    if (token) {
      // Check existing companies
      const existing = await page.evaluate(async (tok) => {
        const r = await fetch('http://localhost:8000/api/v1/companies', {
          headers: { Authorization: `Bearer ${tok}` }
        });
        return r.json();
      }, token);
      console.log('Existing companies:', JSON.stringify(existing).substring(0, 200));
      
      if (Array.isArray(existing) && existing.length > 0) {
        companyId = existing[0].id;
        console.log('Using existing company:', companyId);
      } else {
        const resp = await page.evaluate(async (tok) => {
          const r = await fetch('http://localhost:8000/api/v1/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ name: 'Demo Corp', description: 'Test company for screenshots' })
          });
          return r.json();
        }, token);
        companyId = resp.id;
        console.log('Created company:', companyId);
      }
    }
  } catch(e) {
    console.log('Company creation error:', e.message);
  }

  // Reload companies page
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  await page.screenshot({ path: `${DIR}/03-companies.png`, fullPage: true });
  console.log('✅ 03-companies.png');

  if (companyId) {
    await page.goto(`${BASE}/companies/${companyId}`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.screenshot({ path: `${DIR}/04-company-kanban.png`, fullPage: true });
    console.log('✅ 04-company-kanban.png');

    // Agents section
    try {
      const agentsTab = page.locator('a:has-text("Agents"), [href*="agents"]').first();
      if (await agentsTab.count() > 0) {
        await agentsTab.click();
        await sleep(1000);
      }
    } catch(e) {}
    await page.screenshot({ path: `${DIR}/05-agents.png`, fullPage: true });
    console.log('✅ 05-agents.png');

    // Task detail
    try {
      const taskCard = page.locator('[data-testid="task-card"]').first();
      if (await taskCard.count() > 0) {
        await taskCard.click();
        await sleep(1000);
        await page.screenshot({ path: `${DIR}/06-task-detail.png`, fullPage: true });
        console.log('✅ 06-task-detail.png (with sidebar)');
        // Close sidebar
        await page.keyboard.press('Escape');
        await sleep(500);
      } else {
        await page.screenshot({ path: `${DIR}/06-task-detail.png`, fullPage: true });
        console.log('✅ 06-task-detail.png (no tasks)');
      }
    } catch(e) {
      await page.screenshot({ path: `${DIR}/06-task-detail.png`, fullPage: true });
    }

    // War room
    await page.goto(`${BASE}/companies/${companyId}/war-room`, { waitUntil: 'networkidle' });
    await sleep(2000);
    await page.screenshot({ path: `${DIR}/07-war-room.png`, fullPage: true });
    console.log('✅ 07-war-room.png');

    // Agent page
    try {
      const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('access_token'));
      if (token) {
        const agents = await page.evaluate(async (args) => {
          const r = await fetch(`http://localhost:8000/api/v1/companies/${args.companyId}/agents`, {
            headers: { Authorization: `Bearer ${args.token}` }
          });
          return r.json();
        }, { token, companyId });
        console.log('Agents:', JSON.stringify(agents).substring(0, 200));
        
        const agentId = Array.isArray(agents) && agents.length > 0 ? agents[0].id : null;
        if (agentId) {
          await page.goto(`${BASE}/companies/${companyId}/agents/${agentId}`, { waitUntil: 'networkidle' });
          await sleep(2000);
          await page.screenshot({ path: `${DIR}/08-agent-page.png`, fullPage: true });
          console.log('✅ 08-agent-page.png');
        } else {
          await page.goto(`${BASE}/companies/${companyId}`, { waitUntil: 'networkidle' });
          await sleep(1000);
          await page.screenshot({ path: `${DIR}/08-agent-page.png`, fullPage: true });
          console.log('✅ 08-agent-page.png (no agents, showing company)');
        }
      }
    } catch(e) {
      await page.screenshot({ path: `${DIR}/08-agent-page.png`, fullPage: true });
      console.log('⚠️ 08-agent-page.png (error):', e.message);
    }

    // Settings
    await page.goto(`${BASE}/companies/${companyId}/settings`, { waitUntil: 'networkidle' });
    await sleep(1500);
    await page.screenshot({ path: `${DIR}/09-settings.png`, fullPage: true });
    console.log('✅ 09-settings.png');
  } else {
    console.log('⚠️ No company ID, skipping company-specific screens');
    for (const n of ['04-company-kanban', '05-agents', '06-task-detail', '07-war-room', '08-agent-page', '09-settings']) {
      await page.screenshot({ path: `${DIR}/${n}.png`, fullPage: true });
      console.log(`⚠️ ${n}.png (fallback, no company)`);
    }
  }

  // Global search Ctrl+K
  try {
    if (companyId) {
      await page.goto(`${BASE}/companies/${companyId}`, { waitUntil: 'networkidle' });
    }
    await sleep(500);
    await page.keyboard.press('Control+k');
    await sleep(800);
    await page.screenshot({ path: `${DIR}/10-search.png`, fullPage: true });
    console.log('✅ 10-search.png');
    await page.keyboard.press('Escape');
  } catch(e) {
    await page.screenshot({ path: `${DIR}/10-search.png`, fullPage: true });
    console.log('⚠️ 10-search.png (fallback)');
  }

  await browser.close();
  console.log('\n🎉 Done! Screenshots saved to:', DIR);
})();
