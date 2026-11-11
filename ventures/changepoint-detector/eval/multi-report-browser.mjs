// Headless-Chromium check of the several-column branded report on the page (index.html, multi-report.mjs).
// Serves this directory on a local port, loads the FX example (three columns), shows the report card as an
// unlocked key would (the card is dark while checkout.mjs has no link), clicks "Open the report", and checks
// the opened report equals multiReportHtml() run in Node on the same input with the same letterhead.
// Run: node eval/multi-report-browser.mjs   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseColumns, analyzeMulti } from '../multivariate.mjs';
import { multiReportHtml } from '../multi-report.mjs';
import { FX_CSV } from '../example-fx.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
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
  await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; });
  await page.click('#example-fx');
  await page.waitForSelector('#multi-results:not([hidden])', { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('report-card').hidden = false; document.getElementById('report-fields').hidden = false; });
  await page.fill('#report-title', 'FX check');
  await page.fill('#report-author', 'Test Analyst');
  await page.fill('#report-notes', 'line one\nline two');
  await page.click('#report-open');
  await page.waitForFunction(() => window.__opened, null, { timeout: 10000 });
  const html = await page.evaluate(async () => (await fetch(window.__opened)).text());
  const date = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const p = parseColumns(FX_CSV);
  const expected = multiReportHtml(p, analyzeMulti({ ...p, model: 'meanvar' }), { title: 'FX check', author: 'Test Analyst', contact: '', accent: '#1f5f86', logo: '', notes: 'line one\nline two', date });
  ok(html === expected, `opened report equals multiReportHtml in Node (${html.length} vs ${expected.length} chars)`);
  ok(/Each column on its own/.test(html) && /2015-01-20/.test(html) && /2016-06-24/.test(html), 'report has the per-column table and the franc and pound changes');
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
