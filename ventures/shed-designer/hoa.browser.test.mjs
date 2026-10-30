// The HOA packet printed to PDF in a real browser: one PDF page per packet
// page, on US Letter and A4, with and without the 3D view and a site plan, and
// no console errors. Same harness as gambrel.browser.test.mjs; skips when
// Playwright cannot be loaded (set PLAYWRIGHT to its index.js).
//
// Pages are counted from the page tree's /Count. Counting "/Type /Page"
// matches the /Pages root too and reads one high (6 for this 5-page packet).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDesign } from './model.mjs';
import { encodeDesign } from './hoa.mjs';

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

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

/** Pages in a PDF, from its page tree root. @param {Buffer} pdf */
const pdfPages = (pdf) => Number(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/.exec(pdf.toString('latin1'))?.slice(1).find(Boolean));

const LOT = { lotWidthFt: 50, lotDepthFt: 100, siteLeftFt: 6, siteRearFt: 12, houseWidthFt: 30, houseDepthFt: 40, houseLeftFt: 10, houseFrontFt: 25, northDeg: 45, easementSide: 'rear', easementFt: 10, easementNote: '10 ft utility easement' };

test('the HOA packet prints one PDF page per packet page', { skip, timeout: 180000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const cases = [['#preset=8x12', 'the default 8x12'], ['#preset=10x10%20barn', 'the barn'], ['#gallery=value', 'a gallery design'], [`#d=${encodeDesign({ ...defaultDesign(), ...LOT })}`, 'a design with a lot']];
  for (const [hash, name] of cases) {
    await page.goto('about:blank');
    await page.goto(`${base}hoa-packet.html${hash}`);
    await page.waitForFunction(() => document.querySelectorAll('.hoa-page').length > 0 && document.querySelector('.hoa-3d img'));
    const sections = await page.$$eval('.hoa-page', (a) => a.length);
    assert.equal(sections, 5, name);
    for (const with3d of [true, false]) {
      if (!with3d) await page.uncheck('#with3d');
      for (const opt of [{ preferCSSPageSize: true }, { format: 'A4' }, { format: 'Letter' }]) {
        assert.equal(pdfPages(await page.pdf(opt)), sections, `${name}, ${JSON.stringify(opt)}, 3D ${with3d ? 'on' : 'off'}`);
      }
    }
  }
  await ctx.close();
  assert.deepEqual(errors, [], 'no console errors');
});
