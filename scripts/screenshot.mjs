// Acceptance screenshots: 390px + 1280px, light + dark, playing (3 guesses)
// + end state. Serves dist/ via vite preview and drives it with Playwright.
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4173;
const PUZZLE = 5;

function targetName() {
  const sched = JSON.parse(readFileSync(path.join(ROOT, 'public/data/schedule.json'), 'utf8'));
  const cities = JSON.parse(readFileSync(path.join(ROOT, 'public/data/cities.json'), 'utf8'));
  const h = cities.header;
  const idI = h.indexOf('id');
  const nameI = h.indexOf('name');
  const hash = sched.hashes[(PUZZLE - 1) % sched.hashes.length];
  for (const r of cities.rows) {
    const digest = createHash('sha256').update(`${sched.salt}:${r[idI]}`, 'utf8').digest('hex');
    if (digest === hash) return String(r[nameI]);
  }
  throw new Error('target not found');
}

async function guess(page, name) {
  const before = await page.locator('ol.guesses li.guess:not(.empty)').count();
  await page.fill('#guess-input', name);
  await page.waitForSelector('#suggestions li');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (b) => document.querySelectorAll('ol.guesses li.guess:not(.empty)').length > b,
    before,
  );
}

async function main() {
  const target = targetName();
  console.log(`puzzle ${PUZZLE} target: ${target}`);
  // Prefer same-offset wrong guesses so the screenshots exercise the
  // compass chip, staged hints, and the pinned ruler marker.
  const preferred = ['London', 'Lisbon', 'Accra', 'Tokyo', 'New York', 'Cairo', 'Sydney'];
  const wrong = preferred.filter((n) => n !== target).slice(0, 3);

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: 'pipe',
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  // Poll until the server answers.
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      server.kill();
      throw new Error('preview timeout');
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 800 },
          colorScheme: scheme,
        });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${PORT}/?puzzle=${PUZZLE}`);
        await page.waitForSelector('ol.guesses li.guess');
        for (const w of wrong) await guess(page, w);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(ROOT, `screenshots/playing-${width}-${scheme}.png`) });
        await guess(page, target);
        await page.waitForSelector('.result-card');
        await page.waitForTimeout(400);
        await page.screenshot({
          path: path.join(ROOT, `screenshots/end-${width}-${scheme}.png`),
          fullPage: true,
        });
        console.log(`done ${width}/${scheme}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log('screenshots in screenshots/');
}

await main();
