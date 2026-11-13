// Headless-Chromium check of the page's "Wandering level" watch setting (README "Round 8").
// A random walk (step sd 0.3, noise sd 1) with a 7-unit jump at row 200: the first check at 150 rows is a baseline,
// checks at 250, 259 and 260 rows report one new change near row 200 (persist 2 needs two checks) under "Wandering level"; the model select set to the
// wandering-level model with the setting blank uses the drift watch too. Run: node eval/watch-drift-browser.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = fileURLToPath(new URL('..', import.meta.url));
function rng(seed) { let s = seed; const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }
const g = rng(5); let lev = 0;
const vals = Array.from({ length: 260 }, (_, i) => { lev += 0.3 * g(); return 100 + lev + (i >= 200 ? 7 : 0) + g(); });
const csvOf = (n) => 'day,price\n' + vals.slice(0, n).map((v, i) => `d${i + 1},${v.toFixed(3)}`).join('\n');
const types = { '.html': 'text/html', '.mjs': 'text/javascript' };
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
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); cond ? pass++ : fail++; };
const status = () => page.$eval('#watch-status', (e) => e.textContent);
const check = async (n) => { await page.fill('#csv', csvOf(n)); await page.click('#watch-check'); await page.waitForFunction(() => !document.querySelector('#watch-status').hidden && document.querySelector('#watch-status').textContent.length > 0); return status(); };
await page.goto(base + '/index.html');
await page.selectOption('#watch-detector', 'drift');
await page.fill('#watch-name', 'wander-a');
let s = await check(150);
ok('first check under Wandering level: no alert on 150 rows of wander', !/New change/.test(s) && /jumps on a wandering level/.test(s), s.split('\n').slice(0, 2).join(' / '));
await page.$eval('#watch-status', (e) => { e.textContent = ''; });
let all = '';
for (const n of [250, 259, 260]) { await page.$eval('#watch-status', (e) => { e.textContent = ''; }); all += (s = await check(n)) + '\n'; }
const m = all.match(/New change[\s\S]*?\n.*\n/);
ok('the jump is reported once over checks at 250, 259 and 260 rows', (all.match(/New change/g) || []).length === 1 && !!m && /d(19[6-9]|20[0-6])/.test(m[0]), m ? m[0].replace(/\n/g, ' ') : all.slice(0, 300));
await page.selectOption('#watch-detector', '');
await page.selectOption('#model', 'drift');
await page.fill('#watch-name', 'wander-b');
await page.$eval('#watch-status', (e) => { e.textContent = ''; });
s = await check(150);
ok('the wandering-level model with the setting blank uses the drift watch', /jumps on a wandering level/.test(s), s.split('\n')[0]);
ok('no page errors', errors.length === 0, errors.join('; '));
ok('no sideways scroll at 390 px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
console.log(`${pass} of ${pass + fail}`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
