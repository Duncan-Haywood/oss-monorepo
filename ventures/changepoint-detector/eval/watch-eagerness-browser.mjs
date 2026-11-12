// Headless-Chromium check of the replay card's "Which How eager suits this series?" button (index.html,
// watch-core.mjs eagernessReplay, README "Round 6"), at 390 px: run the Nile example, compare the settings,
// use the suggestion, and check the watch card's "How eager" select took it; no page errors, no sideways scroll.
// Run: node eval/watch-eagerness-browser.mjs > eval/watch-eagerness-browser.out.txt   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.csv': 'text/csv' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const results = [];
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); if (!cond) process.exitCode = 1; };

await page.goto(`${base}/index.html`);
await page.click('#example');
await page.click('#run');
await page.waitForSelector('#replay-card:not([hidden])');
ok('the replay card shows after a one-column run', true);
await page.click('#eager-run');
await page.waitForFunction(() => /^Suggested/.test(document.querySelector('#eager-summary').textContent), null, { timeout: 60000 });
const summary = await page.textContent('#eager-summary');
ok('a suggestion is shown', /^Suggested: (Quiet|Middle|Eager)/.test(summary), summary);
const rows = await page.$$eval('#eager-table tr', (t) => t.map((r) => r.textContent.trim()));
ok('the table has a header and three settings', rows.length === 4, rows.slice(1).join(' | '));
const note = await page.textContent('#eager-note');
ok('the note gives the evidence and says it is not a promise', /not a promise/.test(note) && /17 of 31/.test(note));
const label = await page.textContent('#eager-use');
await page.click('#eager-use');
const sel = await page.$eval('#watch-detector', (s) => s.options[s.selectedIndex].textContent);
ok('"Use ..." sets the watch card\'s How eager', sel.startsWith(label.replace(/^Use (\w+).*/, '$1')), `${label} -> ${sel}`);
const usage = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/usage/.test(k)) return localStorage.getItem(k); } return ''; });
ok('watch_eagerness counted locally', /watch_eagerness/.test(usage), usage.slice(0, 200));
const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok('no horizontal scroll at 390 px', !wide);
ok('no page errors', errors.length === 0, errors.join('; '));
console.log(results.join('\n'));
await browser.close();
server.close();
