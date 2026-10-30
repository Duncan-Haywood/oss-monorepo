// The ready-made designs, their detail panel and the side-by-side compare,
// driven in a real browser on a laptop and on a phone, with an axe pass on
// the open panels. Skips without Playwright, like browser.test.mjs; set AXE
// to axe-core's axe.min.js for the accessibility test.
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

async function open(t, ctxOpts = { viewport: { width: 1366, height: 900 } }) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelectorAll('#starts .pick').length > 0);
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no console errors'); });
  return { ctx, page };
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('a design card opens its detail, with renders, cost, storage, openings and structure', { skip }, async (t) => {
  const { page } = await open(t);
  const cards = await page.locator('#starts .pick').count();
  assert.ok(cards >= 5, `at least five starting designs (${cards})`);
  // Thumbnails arrive after the page is up.
  await page.waitForFunction(() => document.querySelectorAll('#starts .pick-img img').length === document.querySelectorAll('#starts .pick').length, null, { timeout: 30000 });
  await page.locator('#starts .pick-open').first().click();
  const dlg = page.locator('#pick-dialog');
  await assert.doesNotReject(dlg.waitFor({ state: 'visible' }));
  const text = await dlg.innerText();
  for (const want of ['Why it\'s here', 'Price: $', 'Footprint', 'Wall height', 'Peak', 'Floor inside', 'Volume inside', 'Shelf wall', 'Siding', 'Roof', 'Doors (', 'Rafters', 'Checks', 'Not engineered or code-checked', 'Start from this design']) {
    assert.ok(text.includes(want), `detail shows "${want}"`);
  }
  const srcs = await dlg.locator('.shots img').evaluateAll((is) => is.map((i) => i.getAttribute('src')));
  assert.ok(srcs.length >= 3, `at least three renders (${srcs.length})`);
  assert.equal(new Set(srcs).size, srcs.length, 'the renders differ');
  assert.ok(await dlg.locator('.bars li').count() >= 3, 'a cost breakdown');
  // Focus moved into the dialog; Escape closes it and gives focus back.
  assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), 'pick-dialog');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'hidden' });
  assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('pick-open')), 'focus returns to the card');
});

test('"Start from this design" opens a copy in the editor as a new design', { skip }, async (t) => {
  const { page } = await open(t);
  const tabs = await page.locator('#design-tabs [role="tab"]').count();
  await page.locator('#starts .pick-open[data-detail="square"]').click();
  await page.locator('#pick-dialog [data-start]').click();
  await page.locator('#pick-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#design-tabs [role="tab"]').count(), tabs + 1, 'one more design');
  assert.equal(await page.$eval('#widthFt', (e) => e.value), '10');
  assert.equal(await page.$eval('#lengthFt', (e) => e.value), '10');
});

test('compare puts two or three side by side and marks the differences and the best', { skip }, async (t) => {
  const { page } = await open(t);
  assert.ok(await page.locator('#compare-tray').isHidden(), 'no tray until something is picked');
  for (const id of ['cheapest', 'value', 'square']) await page.locator(`#starts [data-compare="${id}"]`).click();
  assert.equal(await page.locator('#starts [data-compare][aria-pressed="true"]').count(), 3);
  // A fourth replaces the first, so there are never more than three.
  await page.locator('#starts [data-compare="storage"]').click();
  assert.equal(await page.locator('#starts [data-compare][aria-pressed="true"]').count(), 3);
  assert.equal(await page.locator('#starts [data-compare="cheapest"]').getAttribute('aria-pressed'), 'false');
  await page.locator('#compare-tray [data-compare-open]').click();
  const dlg = page.locator('#pick-dialog');
  await dlg.waitFor({ state: 'visible' });
  assert.equal(await dlg.locator('.cmp-head').count(), 3);
  assert.equal(await dlg.locator('.cmp-head img').count(), 3, 'a render of each');
  const text = await dlg.innerText();
  for (const want of ['Materials', 'Floor per $100', 'Volume per $100', 'Floor inside', 'Headroom', 'Siding', 'Roof frame', 'Checks']) assert.ok(text.includes(want), `compare shows "${want}"`);
  assert.ok(await dlg.locator('.cmp-row.differs').count() >= 5, 'differences highlighted');
  assert.ok(await dlg.locator('.cmp-cell.best .best-tag').count() >= 3, 'winners tagged in words, not colour alone');
  // Materials: the cheapest is tagged best.
  const cost = await dlg.locator('.cmp-row[aria-label="Materials"] .cmp-cell').evaluateAll((cs) => cs.map((c) => ({ n: Number((/\$([\d,.]+)/.exec(c.textContent || '') || ['', 'NaN'])[1].replace(/,/g, '').replace(/\.$/, '')), best: c.classList.contains('best') })));
  const min = Math.min(...cost.map((c) => c.n));
  assert.ok(cost.every((c) => c.best === (c.n <= min * 1.005)), `the cheapest is marked best: ${JSON.stringify(cost)}`);
  // Only the differences.
  const same = await dlg.locator('.cmp-row.same').count();
  assert.ok(same > 0, 'some rows are shared');
  await dlg.locator('[data-only-diff]').check();
  assert.equal(await dlg.locator('.cmp-row.same .cmp-cell:visible').count(), 0, 'shared rows hidden');
  // Details from inside the compare, then start one.
  await dlg.locator('.cmp-head [data-detail]').first().click();
  assert.ok((await dlg.innerText()).includes('Why it\'s here'));
  await dlg.locator('[data-close]').click();
  await page.locator('#compare-tray [data-compare-clear]').click();
  assert.ok(await page.locator('#compare-tray').isHidden());
  assert.equal(await page.locator('#starts [data-compare][aria-pressed="true"]').count(), 0);
});

test('on a phone: the strip scrolls sideways inside itself, and detail and compare fit the screen', { skip }, async (t) => {
  const { page } = await open(t, pw.devices['Pixel 7']);
  assert.ok(await noSideScroll(page), 'no sideways page scroll with the strip');
  const btn = await page.locator('#starts .pick-cmp').first().boundingBox();
  assert.ok(btn && btn.height >= 44, 'Compare is finger-sized');
  await page.locator('#starts .pick-open').first().click();
  const dlg = page.locator('#pick-dialog');
  await dlg.waitFor({ state: 'visible' });
  const vw = await page.evaluate(() => window.innerWidth);
  const box = await dlg.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= vw + 1, `the detail fits the width (${box?.x}, ${box?.width}, ${vw})`);
  assert.ok(await dlg.evaluate((d) => d.scrollWidth <= d.clientWidth + 1), 'nothing in the detail runs off sideways');
  await dlg.locator('[data-compare]').click();
  await dlg.locator('[data-close]').click();
  await page.locator('#starts [data-compare="square"]').click();
  await page.locator('#compare-tray [data-compare-open]').click();
  await dlg.waitFor({ state: 'visible' });
  assert.ok(await dlg.evaluate((d) => d.scrollWidth <= d.clientWidth + 1), 'the compare fits the phone width');
  const heads = await dlg.locator('.cmp-head').evaluateAll((hs) => hs.map((h) => h.getBoundingClientRect().width));
  assert.equal(heads.length, 2);
  assert.ok(heads.every((w) => w >= 120), `each column is readable (${heads})`);
});

test('axe finds no violations on the strip, the detail and the compare', { skip: skip || (AXE ? false : 'axe-core not found (set AXE to axe.min.js)') }, async (t) => {
  const { page } = await open(t);
  await page.addScriptTag({ content: readFileSync(/** @type {string} */ (AXE), 'utf8') });
  const run = () => page.evaluate(async () => (await /** @type {any} */ (window).axe.run(document, { resultTypes: ['violations'] })).violations
    .map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
  for (const id of ['cheapest', 'square']) await page.locator(`#starts [data-compare="${id}"]`).click();
  assert.deepEqual(await run(), [], 'page with the strip and tray');
  await page.locator('#starts .pick-open').first().click();
  await page.locator('#pick-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await run(), [], 'detail open');
  await page.locator('#pick-dialog [data-close]').click();
  await page.locator('#compare-tray [data-compare-open]').click();
  await page.locator('#pick-dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await run(), [], 'compare open');
});

test('typing a new lumber price re-prices the starting designs', { skip }, async (t) => {
  const { page } = await open(t);
  const before = await page.locator('#starts .pick-line').first().innerText();
  // A 2x6 at $99 a board (the grid redraws after the first change, so one box takes it): the strip follows once typing pauses.
  await page.evaluate(() => {
    for (const e of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#price-grid input[data-mat="2x6"]'))) {
      e.value = '99';
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction((b) => document.querySelector('#starts .pick-line')?.textContent?.replace(/\s+/g, ' ').trim() !== b, before.replace(/\s+/g, ' ').trim(), { timeout: 5000 });
  const after = await page.locator('#starts .pick-line').first().innerText();
  const n = (x) => Number(x.match(/\$([\d,]+)/)[1].replace(/,/g, ''));
  assert.ok(n(after) > n(before), `the strip's price follows the typed price (${before} -> ${after})`);
});

test('the starting designs are priced the way the page prices: same store, same total', { skip }, async (t) => {
  const { page } = await open(t);
  const n = (x) => Math.round(Number(String(x).replace(/[^0-9.]/g, '')));
  // Start from the "cheapest" starting design, so the page shows it; the page's
  // big total includes tax and delivery, as the detail's "with tax" figure does.
  await page.locator('#starts .pick-open[data-detail="cheapest"]').click();
  await page.locator('#pick-dialog [data-start]').click();
  await page.locator('#pick-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => /^Cheapest /.test(document.querySelector('#design-tabs [aria-selected="true"]')?.textContent || ''));
  await page.waitForTimeout(300);
  const detailWithTax = async () => {
    await page.locator('#starts .pick-open[data-detail="cheapest"]').click();
    const txt = await page.locator('#pick-dialog').innerText();
    await page.locator('#pick-dialog [data-close]').click();
    return n(/\((\$[\d,]+) with tax/.exec(txt)?.[1]);
  };
  assert.equal(await detailWithTax(), n(await page.locator('#total').innerText()), 'same total as the page');
  for (const store of ['lowes', 'homedepot']) {
    await page.selectOption('#buy-at', store);
    await page.waitForTimeout(900); // the strip re-prices 500 ms after the change
    assert.equal(await detailWithTax(), n(await page.locator('#total').innerText()), `same total at ${store}`);
  }
});

test('a gallery card shows its drawn picture in the strip; its detail draws the other views live', { skip }, async (t) => {
  const { page } = await open(t);
  await page.waitForFunction(() => document.querySelector('#starts [data-shot="cheapest"] img')?.getAttribute('src')?.startsWith('renders/gallery-cheapest-card'), null, { timeout: 10000 });
  // Every drawn card picture loads.
  assert.ok(await page.locator('#starts .pick-img img[src^="renders/"]').evaluateAll((is) => Promise.all(is.map((i) => i.decode().then(() => i.naturalWidth > 0)))).then((a) => a.length === 10 && a.every(Boolean)));
  await page.locator('#starts .pick-open[data-detail="cheapest"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pick-dialog .shots img').length >= 3, null, { timeout: 30000 });
  const alts = await page.locator('#pick-dialog .shots img').evaluateAll((is) => is.map((i) => i.getAttribute('alt')));
  assert.ok(alts.every((a) => a && a.length > 10), JSON.stringify(alts));
});
