// The gambrel (barn) roof on the page, driven in a real browser: the shape
// control, its own fields, the end view and the barn preset, with no console
// errors along the way. Same harness as browser.test.mjs.
//
// Skips when Playwright cannot be loaded. Set PLAYWRIGHT to its entry file
// (.../node_modules/playwright/index.js), and AXE to axe-core's axe.min.js for
// the accessibility check; the shed-designer CI workflow sets both.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean);
  for (const p of tries) {
    if (!existsSync(/** @type {string} */ (p))) continue;
    try { return createRequire(import.meta.url)(/** @type {string} */ (p)); } catch { /* try the next */ }
  }
  try { return createRequire(import.meta.url)('playwright'); } catch { return null; }
}
const pw = loadPlaywright();
const skip = pw ? false : 'Playwright not found (set PLAYWRIGHT to its index.js)';
const AXE = process.env.AXE && existsSync(process.env.AXE) ? process.env.AXE : null;

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server; let base; let browser;

before(async () => {
  if (skip) return;
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path === '' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); server?.close(); });
after(async () => { await browser?.close(); server?.close(); });

async function open(t) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no console errors'); });
  return page;
}

test('choosing the gambrel shape shows its fields and draws its end view', { skip }, async (t) => {
  const page = await open(t);
  assert.equal(await page.isVisible('#gambrelLower'), false, 'gambrel fields hidden on a gable');
  const before = await page.textContent('#total');
  await page.selectOption('#style', 'gambrel');
  await page.waitForFunction((b) => document.querySelector('#total')?.textContent !== b, before);
  assert.equal(await page.isVisible('#gambrelLower'), true);
  assert.equal(await page.$eval('#gambrelLower', (e) => e.value), '20');
  // The end wall: two ground corners, two eaves, two knees and the peak.
  const corners = await page.$eval('#endview polygon.endwall', (e) => e.getAttribute('points').trim().split(/\s+/).length);
  assert.equal(corners, 7);
  await page.selectOption('#loft', 'full');
  await page.waitForFunction(() => document.body.textContent.includes('Loft joists'));
});

test('the 10x10 barn preset opens as a gambrel with a loft', { skip }, async (t) => {
  const page = await open(t);
  await page.selectOption('#new-design', '10x10 barn');
  await page.waitForFunction(() => /** @type {HTMLSelectElement} */ (document.querySelector('#style'))?.value === 'gambrel');
  assert.equal(await page.$eval('#loft', (e) => e.value), 'half');
  assert.equal(await page.$eval('#widthFt', (e) => e.value), '10');
  assert.match(await page.textContent('#total'), /^\$[\d,]+/);
});
