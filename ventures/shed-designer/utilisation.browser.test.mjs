// The utilisation view driven in a real browser: the Structure tab's member
// list and its written-out checks, the target margin, the coloured framing
// plans, and the 3D view's "Colour by structural use" with a tap on a member.
// Skips when Playwright cannot be loaded (see browser.test.mjs).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDesign } from './model.mjs';

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

/** A fresh page with an error log; fails the test if anything was logged as an error. */
// These tests read the 8x12 default (model.mjs defaultDesign), so each page
// starts with it saved; a first-time visitor opens on the gallery's balanced design.
const START_FROM_DEFAULT = `try { if (!localStorage.getItem('shed-designer-state-v1')) localStorage.setItem('shed-designer-state-v1', ${JSON.stringify(JSON.stringify({ designs: [defaultDesign()], active: 0 }))}); } catch {}`;

async function open(t, ctxOpts = { viewport: { width: 1366, height: 900 } }) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(START_FROM_DEFAULT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#total')?.textContent?.startsWith('$'));
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no console errors'); });
  return { ctx, page };
}

test('the Structure tab lists every checked member, most used first, with its check written out', { skip }, async (t) => {
  const { page } = await open(t);
  await page.click('[data-panel="panel-structure"]');
  const rows = await page.$$eval('#structure tbody tr', (l) => l.length);
  const items = await page.$$eval('#util-list > li summary', (l) => l.map((x) => x.textContent.trim()));
  assert.equal(items.length, rows);
  assert.match(items[0], /^Ridge beam .*79%, bending/);
  await page.click('#util-list > li:first-child summary');
  const parts = await page.$$eval('#util-list > li:first-child .util-parts li', (l) => l.map((x) => x.textContent));
  assert.match(parts[0], /bending \(governs\): 79%.*M = wL²\/8/);
  // The margin report names the beam above 70%, and the oversized members with a lighter option.
  await page.waitForFunction(() => /Above your 70% target/.test(document.querySelector('#util-margin')?.textContent || ''));
  const margin = await page.textContent('#util-margin');
  assert.match(margin, /Ridge beam at 79%/);
  assert.match(margin, /2x4 joists at 16" would still pass/);
  // Each oversized member's lighter option says what it saves at the page's prices.
  const joistRow = await page.$$eval('#util-margin .util-far tbody tr', (l) => l.map((r) => r.textContent).find((t) => /2x4 joists at 16"/.test(t)) || '');
  assert.match(joistRow, /\$\d+$/, joistRow);
  await page.fill('#util-target', '85');
  await page.dispatchEvent('#util-target', 'change');
  assert.match(await page.textContent('#util-margin'), /No member is above your 85% target/);
  await page.fill('#util-target', '70');
  await page.dispatchEvent('#util-target', 'change');
  // Six coloured framing sheets; tapping a member opens its check.
  await page.click('#util-sheets summary');
  await page.waitForFunction(() => document.querySelectorAll('#util-plans svg').length === 6);
  await page.click('#util-plans svg .mid-RB1');
  assert.ok(await page.$eval('#util-list details[data-key="Ridge beam"]', (d) => /** @type {HTMLDetailsElement} */ (d).open));
});

test('the 3D view colours the framing by use, and a tap names the member and opens its check', { skip }, async (t) => {
  const { page } = await open(t);
  await page.check('#heat-3d');
  assert.equal(await page.$eval('#heat-legend', (e) => e.hidden), false);
  const box = /** @type {any} */ (await page.locator('#view3d').boundingBox());
  let info = '';
  for (let i = 0; i < 40 && !/See the check/.test(info); i++) {
    await page.mouse.click(box.x + box.width * (0.3 + 0.04 * ((i * 7) % 10)), box.y + box.height * (0.25 + 0.05 * ((i * 3) % 10)));
    info = await page.textContent('#pick-info');
  }
  assert.match(info, /% of capacity/);
  await page.click('#pick-open');
  assert.equal(await page.$$eval('#util-list details[open]', (l) => l.length), 1);
  await page.uncheck('#heat-3d');
  assert.equal(await page.textContent('#pick-info'), '');
});

test('on a phone the list and the plans do not scroll the page sideways', { skip }, async (t) => {
  const { page } = await open(t, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.click('[data-panel="panel-structure"]');
  await page.click('#util-list > li:first-child summary');
  await page.click('#util-sheets summary');
  await page.waitForFunction(() => document.querySelectorAll('#util-plans svg').length === 6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});
