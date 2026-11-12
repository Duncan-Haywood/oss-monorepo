// Headless-Chromium check of the page's "Keep watching a series" card (index.html, watch-core.mjs).
// Serves this directory on a local port and:
//  1. pastes 120 rows with a step in the history and checks: the first check records it as the baseline;
//  2. reloads the page (state must survive in localStorage), pastes 170 rows with a second step at 140,
//     checks: exactly one new change, dated at the step; checks again: no new change;
//  3. an unreachable link says so; a link answered with CORS (as a published Google Sheet is) is read;
//  4. "Forget this watch" clears the state, so the next check is a baseline again.
// Run: node eval/watch-page-browser.mjs   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = fileURLToPath(new URL('..', import.meta.url));
const wobble = (i) => [0.9, -0.4, 0.2, -1.1, 0.6, -0.2, 1.0, -0.7, 0.3, -0.5, 0.1, -0.9][i % 12];
const csvOf = (n) => 'day,orders\n' + Array.from({ length: n }, (_, i) => `d${i},${(10 + (i >= 60 ? 3 : 0) + (i >= 140 ? 4 : 0) + wobble(i)).toFixed(2)}`).join('\n');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.csv': 'text/csv' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (p === 'metric.csv') { res.writeHead(200, { 'content-type': 'text/csv' }); res.end(csvOf(170)); return; }
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); if (!cond) process.exitCode = 1; };
const check = async () => { await page.click('#watch-check'); await page.waitForFunction(() => !/Fetching/.test(document.querySelector('#watch-status').textContent) && document.querySelector('#watch-status').textContent.length > 0); return page.textContent('#watch-status'); };

await page.goto(`${base}/index.html`);
await page.fill('#csv', csvOf(120));
let t = await check();
ok('first check records the history as the baseline', /First check: 1 change/.test(t) && /d60/.test(t), t.split('\n')[1]);
await page.reload();
await page.fill('#csv', csvOf(170));
await page.fill('#watch-status', '').catch(() => {});
t = await check();
ok('after a reload, the second step is one new change', /New change:/.test(t) && /orders changed from d140: level up/.test(t), t.split('\n').slice(1, 3).join(' | '));
t = await check();
ok('checking again with no new rows reports nothing new', /No new confirmed change/.test(t));
await page.click('#watch-forget');
await page.fill('#csv', '');
await page.fill('#watch-url', 'https://sheet.example.test/metric.csv');
t = await check();
ok('an unreachable link explains itself', /Could not read the link/.test(t), t.slice(0, 90));
// The link path: Playwright answers the https link with the 170 rows and a CORS header, as a published Google Sheet does.
await page.route('https://sheet.example.test/metric.csv', (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: csvOf(170) }));
t = await check();
ok('after Forget, the rows read from the link are a fresh baseline', /First check: 2 changes/.test(t) && /Watch: https:\/\/sheet\.example\.test\/metric\.csv/.test(t), t.split('\n').slice(0, 2).join(' | '));
ok('the link\'s rows fill the data box', (await page.inputValue('#csv')).startsWith('day,orders'));
ok('no page errors', errors.length === 0, errors.join('; '));
const usage = await page.evaluate(() => JSON.parse(localStorage.getItem('changepoint-detector-usage') || '{}'));
ok('watch_check counted locally', usage.watch_check >= 4, JSON.stringify(usage));
await browser.close();
server.close();
console.log(results.join('\n'));
