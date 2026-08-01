// Mobile-viewport screenshot helper — how Claude "sees" the app.
//
//   node scripts/shot.mjs                    # /radar, signed in, iPhone 13
//   node scripts/shot.mjs /explore           # a specific route
//   node scripts/shot.mjs /login --anon      # signed out
//   node scripts/shot.mjs /radar --full      # full-page instead of viewport
//   node scripts/shot.mjs /radar --out x.png --device "Pixel 7"
//
// Credentials come from the gitignored .env.test (dedicated automation account
// — never the pp-test-* manual fixtures). Output lands in __screenshots__/,
// which is gitignored. The signed-in session is cached in .auth/state.json so
// repeat runs skip the login form; delete that file to force a fresh login.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const env = { ...process.env };
if (existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const route = argv.find((a) => a.startsWith('/')) ?? '/radar';
const baseUrl = (env.TEST_BASE_URL ?? 'http://localhost:4200').replace(/\/$/, '');
const deviceName = flag('device', 'iPhone 13');
const outFile = flag('out', `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}.png`);
const anon = has('anon');

const device = devices[deviceName];
if (!device) {
  console.error(`[shot] unknown device "${deviceName}". Try: iPhone 13, Pixel 7, iPhone SE.`);
  process.exit(1);
}

mkdirSync('__screenshots__', { recursive: true });
mkdirSync('.auth', { recursive: true });
const statePath = '.auth/state.json';

const browser = await chromium.launch();
const useState = !anon && existsSync(statePath);
const context = await browser.newContext({ ...device, storageState: useState ? statePath : undefined });
const page = await context.newPage();

const settle = async () => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
};

try {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle();

  // Signed-out runs stop here. Otherwise, if the app bounced us to /login
  // (no cached session, or it expired), drive the real form.
  if (!anon && new URL(page.url()).pathname.startsWith('/login')) {
    const email = env.TEST_USER_EMAIL;
    const password = env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL / TEST_USER_PASSWORD missing — see .env.test');
    }
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
    await settle();
    await context.storageState({ path: statePath });

    // The post-login landing page may not be the route that was asked for
    // (onboarding intercepts a profile-less account).
    if (new URL(page.url()).pathname !== route) {
      console.log(`[shot] landed on ${new URL(page.url()).pathname}`);
      if (!new URL(page.url()).pathname.startsWith('/onboarding')) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        await settle();
      }
    }
  }

  const path = `__screenshots__/${outFile}`;
  await page.screenshot({ path, fullPage: has('full') });
  console.log(`[shot] ${page.url()} -> ${path} (${deviceName}, ${device.viewport.width}x${device.viewport.height})`);
} catch (err) {
  const path = '__screenshots__/error.png';
  await page.screenshot({ path }).catch(() => {});
  console.error(`[shot] FAILED at ${page.url()}: ${err.message}`);
  console.error(`[shot] wrote ${path} for diagnosis`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
