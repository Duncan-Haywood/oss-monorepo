// Headless-Chromium check of the page's agreed-changes panel running in Web Workers
// (index.html runAgreed, consensus-worker.mjs). Serves this directory on a local port,
// pastes a long series, clicks Analyze, and measures: how soon the main results show,
// whether the page answers a click while the panel runs, when the panel finishes, and
// whether its text matches consensus() run in Node on the same input.
// Run: node eval/agreed-worker-browser.mjs [points | file.csv]   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { consensus, agreedText } from '../consensus.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
const arg = process.argv[2] || '6000';
const file = /\.csv$/.test(arg) ? arg : null;
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

// A seeded series: three level steps on Gaussian noise with a mild AR(1) wobble.
let s = 7;
const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const N = file ? 0 : Number(arg);
const steps = [0, Math.round(N * 0.3), Math.round(N * 0.55), Math.round(N * 0.8)];
let e = 0;
const vals = Array.from({ length: N }, (_, i) => { e = 0.3 * e + gauss(); return (10 + 3 * steps.filter((t) => i >= t).length + e).toFixed(3); });
const csv = file ? await readFile(file, 'utf8') : 'value\n' + vals.join('\n');

const t0 = Date.now();
const expected = agreedText(consensus({ csv, column: null, log: false, period: 0, penalty: 'bic' }));
const nodeMs = Date.now() - t0;

// require() finds a globally installed playwright where import() does not.
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.evaluate((v) => { document.querySelector('#csv').value = v; }, csv);
const out = await page.evaluate(async () => {
  const $ = (q) => document.querySelector(q);
  const t = performance.now();
  $('#run').click();
  const mainMs = performance.now() - t;
  const first = $('#agreed').textContent;
  // While the panel works, a timer should still fire on time.
  const lag = await new Promise((r) => { const a = performance.now(); setTimeout(() => r(performance.now() - a - 50), 50); });
  await new Promise((r) => { const iv = setInterval(() => { if (!/working/.test($('#agreed').textContent)) { clearInterval(iv); r(); } }, 50); });
  return { mainMs, first, lag, agreedMs: performance.now() - t, text: $('#agreed').textContent, cores: navigator.hardwareConcurrency };
});
await browser.close();
server.close();
const got = out.text.replace(/^Agreed changes:\s*/, '');
console.log(`${file || `${N} seeded points`}, browser cores ${out.cores}`);
console.log(`main results shown after ${Math.round(out.mainMs)} ms; panel note then: "${out.first.slice(0, 80)}"`);
console.log(`a 50 ms timer fired ${Math.round(out.lag)} ms late while the panel ran`);
console.log(`panel finished ${Math.round(out.agreedMs)} ms after the click (consensus() in Node, one thread: ${nodeMs} ms)`);
console.log(`panel text matches Node: ${got === expected}`);
if (got !== expected) { console.log('page: ' + got); console.log('node: ' + expected); process.exit(1); }
