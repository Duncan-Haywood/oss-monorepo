// Headless-Chromium check of the wandering-level branded report on the page (index.html, drift-report.mjs).
// Serves this directory on a local port, runs --model drift on Canada's fertility rate with "take logs first"
// ticked (which the model ignores), shows the report card as an unlocked key would (the card is dark while
// checkout.mjs has no link), clicks "Open the report", and checks the opened report equals driftReportHtml()
// run in Node on the same input with the same letterhead and the ignored option named.
// Run: node eval/drift-report-browser.mjs   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { driftResult } from '../drift-cli.mjs';
import { driftReportHtml } from '../drift-report.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
const csv = await readFile(join(dir, 'data/canada-fertility.csv'), 'utf8');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok' : 'FAIL'}  ${msg}`); if (!cond) failed++; };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate((csv) => {
    window.__opened = null; window.open = (u) => { window.__opened = u; return null; };
    const $ = (q) => document.querySelector(q);
    $('#csv').value = csv; $('#shape').value = 'one'; $('#model').value = 'drift'; $('#penalty').value = 'bic'; $('#log').checked = true;
    $('#run').click();
  }, csv);
  await page.waitForFunction(() => document.getElementById('working').hidden && !document.getElementById('results').hidden, null, { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('report-card').hidden = false; document.getElementById('report-fields').hidden = false; });
  await page.fill('#report-title', 'Fertility check');
  await page.fill('#report-author', 'Test Analyst');
  await page.fill('#report-notes', 'line one\nline two');
  await page.click('#report-open');
  await page.waitForFunction(() => window.__opened, null, { timeout: 10000 });
  const html = await page.evaluate(async () => (await fetch(window.__opened)).text());
  const date = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const expected = driftReportHtml(driftResult({ csv, penalty: 'bic', slope: false }), { title: 'Fertility check', author: 'Test Analyst', contact: '', accent: '#1f5f86', logo: '', notes: 'line one\nline two', date, ignored: ['take logs first'] });
  ok(html === expected, `opened report equals driftReportHtml in Node (${html.length} vs ${expected.length} chars)`);
  ok(/<td>1946<\/td>/.test(html) && /<td>1965<\/td>/.test(html) && /<td>1967<\/td>/.test(html), 'report lists the 1946, 1965 and 1967 jumps');
  ok(/these settings were ignored: take logs first/.test(html), 'report names the ignored option');
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
