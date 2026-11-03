// Loads the site's heaviest pages in a CPU-throttled browser and checks they
// keep drawing frames: idle (the decoration running) and while scrolling.
//
// Why this exists
// ---------------
// On 2026-11-03 the owner reported "tons of lag on the site". The server was
// fine (0.45 s to first byte); the homepage was not. Its hero ran three
// 720px circles, blended and moving, under a `filter: blur(70px)`, plus a
// full-hero canvas at 2x drawing ~6,000 separate line strokes and a blurred
// shadow per dot, every frame. Measured here with the CPU throttled 4x:
// **7 fps idle, a 383 ms p95 frame**, against 60 fps on any tool page. No
// other check could see it: `check.mjs` reads files, `contrast.mjs` and
// `sideways.mjs` take one still frame, and a still frame of a janky page
// looks exactly like a smooth one.
//
// This check measures what a visitor feels: frames per second, and the p95
// gap between frames, while the page sits there and while it scrolls.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/framerate.mjs
//
//   BASE_URL=https://marisstella.app node platform/pages/framerate.mjs  # production
//   PAGES=,research/ node platform/pages/framerate.mjs                   # chosen pages
//   ONLY=ebay-fee-calculator node platform/pages/framerate.mjs           # one venture
//
// Exit codes follow the other browser checks: 0 every page within budget,
// 1 a page over budget, 2 nothing could be measured (no Playwright, or no
// page answered).
//
// The numbers are relative, not absolute. Headless Chromium rasterises in
// software, so it is slower than a real laptop's GPU: the budget is set where
// the fixed homepage passes with room (52 fps, 33 ms p95) and the old one
// fails by a mile, not at 60 fps.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onlySlugs, describeFilter } from './only-slugs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const specifier = process.env.PLAYWRIGHT || 'playwright';
let playwright;
try {
  const loaded = await import(specifier);
  playwright = loaded.chromium ? loaded : loaded.default;
} catch (error) {
  console.error(`Cannot load Playwright (${specifier}): ${String(error).split('\n')[0]}`);
  process.exit(2);
}
if (!playwright || !playwright.chromium) {
  console.error(`PLAYWRIGHT=${specifier} resolved to a module with no chromium export.`);
  process.exit(2);
}
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(HERE, 'dist');

/** Budget: at least this many frames a second, and no worse a p95 frame. */
export const MIN_FPS = Number(process.env.MIN_FPS || 30);
export const MAX_P95_MS = Number(process.env.MAX_P95_MS || 70);
const THROTTLE = Number(process.env.THROTTLE || 4);

/**
 * The pages with the most going on: the homepage (hero, shelf, reel), the
 * research index, and the tools the homepage shows off. Anything the build
 * did not produce is skipped rather than failed, so a renamed page does not
 * turn this red.
 */
function defaultPages() {
  const pages = ['', 'research/', 'writing/'];
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'showcase', 'manifest.json'), 'utf8'));
    for (const shot of (manifest.shots ?? []).slice(0, 3)) pages.push(`${shot.slug}/`);
  } catch { /* no manifest: the three hub pages are enough */ }
  return pages;
}

const only = onlySlugs();
let pages = process.env.PAGES !== undefined ? process.env.PAGES.split(',').map((p) => p.trim()) : defaultPages();
if (only) {
  pages = [...only].map((slug) => `${slug}/`);
  console.log(describeFilter(only));
}
if (fs.existsSync(DIST)) {
  pages = pages.filter((rel) => fs.existsSync(path.join(DIST, rel, 'index.html')));
}

const PROFILES = [
  { name: 'laptop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

/** Frames per second and the p95 frame gap while `act` runs. */
async function frames(page, act) {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__counting) requestAnimationFrame(tick); };
    window.__counting = true;
    requestAnimationFrame(tick);
  });
  const start = Date.now();
  await act();
  const seconds = (Date.now() - start) / 1000;
  const gaps = await page.evaluate(() => { window.__counting = false; return window.__frames.sort((a, b) => a - b); });
  return { fps: gaps.length / seconds, p95: gaps[Math.floor(gaps.length * 0.95)] ?? Infinity };
}

const browser = await playwright.chromium.launch(LAUNCH);
const rows = [];
let answered = 0;

for (const rel of pages) {
  for (const profile of PROFILES) {
    const { name, ...options } = profile;
    const page = await browser.newPage(options);
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const response = await page.goto(`${BASE}/${rel}`, { waitUntil: 'load', timeout: 60000 });
      if (!response || !response.ok()) { rows.push({ rel, name, error: `HTTP ${response?.status()}` }); continue; }
      answered += 1;
      await page.waitForTimeout(1500);
      const idle = await frames(page, () => page.waitForTimeout(3000));
      const scroll = await frames(page, async () => {
        for (let i = 0; i < 30; i += 1) { await page.mouse.wheel(0, 250); await page.waitForTimeout(40); }
      });
      rows.push({ rel, name, idle, scroll });
    } catch (error) {
      rows.push({ rel, name, error: String(error).split('\n')[0] });
    } finally {
      await page.close();
    }
  }
}
await browser.close();

if (!answered) {
  console.error(`No page answered at ${BASE}; nothing was measured.`);
  process.exit(2);
}

const over = (m) => m.fps < MIN_FPS || m.p95 > MAX_P95_MS;
const show = (m) => `${m.fps.toFixed(0).padStart(3)} fps, p95 ${m.p95.toFixed(0).padStart(4)} ms`;
let failed = 0;
console.log(`CPU ${THROTTLE}x slower; budget ${MIN_FPS} fps and a ${MAX_P95_MS} ms p95 frame.\n`);
for (const r of rows) {
  const label = `/${r.rel}`.padEnd(34) + r.name.padEnd(7);
  if (r.error) { failed += 1; console.log(`FAIL ${label} ${r.error}`); continue; }
  const bad = over(r.idle) || over(r.scroll);
  if (bad) failed += 1;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${label} idle ${show(r.idle)}   scroll ${show(r.scroll)}`);
}
if (failed) {
  console.log('\nA page under budget feels laggy on an ordinary laptop or phone. The usual causes, '
    + 'all found on this site: filter: blur() or backdrop-filter over something that moves, '
    + 'canvas shadowBlur, a full-resolution canvas redrawn every frame, and animated '
    + 'background-position. Ablate them one at a time to find which one it is.');
  process.exit(1);
}
process.exit(0);
