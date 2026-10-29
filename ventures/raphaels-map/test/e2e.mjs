// End-to-end happy path in a real browser, against the synthetic fixtures.
//
//   node test/e2e.mjs                 # from ventures/raphaels-map
//   SHOTS=/some/dir node test/e2e.mjs # also save desktop + 390px screenshots
//
// Needs Playwright with Chromium (`npm i -g playwright && npx playwright
// install chromium`, or any global install `require('playwright')` resolves).
// The page itself has no fixture switch: this script serves the venture
// directory on a local port and answers every data/* request from
// test/fixtures/data/ with page.route, so the shipped code never knows.
// Not picked up by `node --test '*.test.mjs'`.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'data');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const errors = [];
let failed = false;

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route('**/data/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, '');
    const f = path.join(FIX, rel);
    if (f.startsWith(FIX) && existsSync(f)) route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(f) });
    else route.fulfill({ status: 404, body: 'not found' });
  });
  return page;
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed = true;
    console.log(`not ok - ${name}\n  ${String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join('\n  ')}`);
  }
}

const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};
const noHorizontalScroll = async (page) => {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw + 1, `horizontal scroll: ${sw} > ${cw}`);
};

for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await newPage(viewport);

  await step(`${label}: home lists sources, vintage and top areas`, async () => {
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#view-home .toplist li');
    const text = await page.textContent('#view-home');
    assert.match(text, /Top areas for further research/);
    assert.match(text, /Fixture ACS 5-year · Fixture Religion Census/);
    assert.match(text, /Needs registration/);
    assert.ok(await page.isVisible('#synthetic-banner'), 'synthetic banner shows for fixture data');
    assert.match(await page.textContent('footer'), /no warranty/i);
    await noHorizontalScroll(page);
  });

  await step(`${label}: explore map renders, missing hatched, click opens trace`, async () => {
    await page.goto(BASE + 'index.html#explore?st=08&m=catholic_adherents');
    await page.waitForSelector('#ex-map svg path.area');
    const missing = await page.$$eval('#ex-map path.area.missing', (els) => els.map((e) => e.getAttribute('data-id')));
    assert.ok(missing.includes('08023') && missing.includes('08021'), `missing: ${missing}`);
    await page.click('#ex-map path[data-id="08001"]');
    await page.waitForSelector('#ex-panel ol.trace');
    const panel = await page.textContent('#ex-panel');
    assert.match(panel, /Fixture County A/);
    assert.match(panel, /Source/);
    assert.match(panel, /Denominator/);
    assert.match(page.url(), /id=08001/);
    await page.focus('#ex-map path[data-id="08023"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash.includes('id=08023'));
    assert.match(await page.textContent('#ex-panel'), /Not available/);
    await page.selectOption('#ex-m', 'women_20_24');
    await page.waitForFunction(() => location.hash.includes('m=women_20_24'));
    await page.click('#ex-map path[data-id="08001"]');
    await page.waitForFunction(() => /±/.test(document.querySelector('#ex-panel .big')?.textContent || ''));
    await noHorizontalScroll(page);
    await shot(page, `explore-${label}`);
  });

  await step(`${label}: rank shows coverage, sensitivity, re-normalised weights and modes`, async () => {
    await page.goto(BASE + 'index.html#rank?st=08');
    await page.waitForSelector('.rank-table tbody tr');
    const t = await page.textContent('#view-rank');
    assert.match(t, /Coverage/);
    assert.match(await page.textContent('.rank-table tbody'), /3 of 3/);
    if (!(await page.isVisible('input[name="mode"][value="concentrated"]'))) await page.click('#rank-settings > summary');
    assert.match(t, /Weights after re-normalising/);
    assert.match(t, /Fixture ACS 5-year/);
    await page.click('input[name="mode"][value="concentrated"]');
    await page.waitForFunction(() => location.hash.includes('mode=concentrated'));
    await page.waitForSelector('.notes');
    assert.match(await page.textContent('#view-rank .notes'), /values evidence is unavailable at county level/i);
    await page.selectOption('#rank-band', '25_29');
    await page.waitForFunction(() => /women 25–29/i.test(document.querySelector('.rank-table caption')?.textContent || ''));
    const bands = await page.$$eval('#rank-band option', (o) => o.map((x) => x.value));
    assert.ok(bands.every((b) => Number(b.split('_')[0]) >= 18));
    await page.click('input[name="mode"][value="volume"]');
    await page.waitForFunction(() => location.hash.includes('mode=volume'));
    await page.waitForSelector('.rank-table tbody tr');
    await noHorizontalScroll(page);
    await shot(page, `rank-${label}`);
  });

  await step(`${label}: compare table, warnings and export`, async () => {
    await page.goto(BASE + 'index.html#compare?ids=08001,08023,m99901');
    await page.waitForSelector('.compare-table tbody tr');
    const t = await page.textContent('#view-compare');
    assert.match(t, /mixes counties and metros/);
    assert.match(t, /no value for/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cmp-csv')]);
    const csv = readFileSync(await dl.path(), 'utf8');
    assert.match(csv, /^geo_id,geo_name/);
    assert.match(csv, /Fixture citation/);
    await page.click('button.sort[data-sort="women_20_24"]');
    await page.waitForFunction(() => location.hash.includes('sort=women_20_24'));
    await noHorizontalScroll(page);
  });

  await step(`${label}: surveys, methodology, international and missing-file states`, async () => {
    await page.goto(BASE + 'index.html#surveys');
    await page.waitForSelector('.survey');
    const s = await page.textContent('#view-surveys');
    assert.match(s, /Insufficient sample/);
    assert.match(s, /n_eff/);
    assert.match(s, /Direct measure/);
    await noHorizontalScroll(page);
    await page.goto(BASE + 'index.html#methodology');
    await page.waitForSelector('table.methods');
    assert.match(await page.textContent('#view-methodology'), /never multiplied/i);
    await page.goto(BASE + 'index.html#intl');
    await page.waitForSelector('table.intl');
    assert.match(await page.textContent('#view-intl'), /Source not imported yet/);
    await page.goto(BASE + 'index.html#explore?st=us');
    await page.waitForSelector('#ex-map .empty');
    assert.match(await page.textContent('#ex-map'), /map outlines/);
    for (const v of ['communities', 'toolkit']) {
      await page.goto(BASE + `index.html#${v}`);
      await page.waitForFunction((id) => (document.getElementById(id)?.textContent || '').trim().length > 20, `view-${v}`);
    }
    await noHorizontalScroll(page);
  });
  await page.close();
}

await step('every data file missing: understandable empty states, no crash', async () => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route('**/data/**', (r) => r.fulfill({ status: 404, body: '' }));
  for (const v of ['home', 'explore', 'compare?ids=08013,08031', 'rank', 'surveys', 'methodology', 'intl']) {
    await page.goto(BASE + `index.html#${v}`);
    const id = `#view-${v.split('?')[0]}`;
    await page.waitForSelector(`${id} .empty`);
    assert.match(await page.textContent(id), /Not available yet|not been|No areas|No published values/);
  }
  assert.ok(!(await page.isVisible('#synthetic-banner')));
  await page.close();
});

await step('no uncaught errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? 'e2e: FAILED' : 'e2e: all steps passed');
