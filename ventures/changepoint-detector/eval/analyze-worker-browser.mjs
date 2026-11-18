// Headless-Chromium check of the page's main analysis running in a Web Worker
// (index.html startMain, analyze-worker.mjs). Serves this directory on a local port and:
//  1. pastes a long series, clicks Analyze and measures how late a 50 ms timer fires while
//     the analysis runs (the old page ran it on the main thread, so the timer waited for it),
//     then checks the summary matches analyze() run in Node on the same input;
//  2. starts a long run, then a short one before it ends: the short one's results must show
//     and the stale long one must never overwrite them;
//  3. reloads with Worker removed: the same click must still give the Node summary;
//  4. loads the several-columns example through the worker.
// Run: node eval/analyze-worker-browser.mjs [points | file.csv]   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { analyze, DEFAULTS } from '../engine.mjs';

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

let s = 7;
const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const N = file ? 0 : Number(arg);
const steps = [0, Math.round(N * 0.3), Math.round(N * 0.55), Math.round(N * 0.8)];
let e = 0;
const vals = Array.from({ length: N }, (_, i) => { e = 0.3 * e + gauss(); return (10 + 3 * steps.filter((t) => i >= t).length + e).toFixed(3); });
const csv = file ? await readFile(file, 'utf8') : 'value\n' + vals.join('\n');

let t0 = Date.now();
const expected = analyze({ csv, column: null }).summary;
const nodeMs = Date.now() - t0;
const nile = analyze({ csv: DEFAULTS.csv, column: null }).summary;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };

// The click and its timing, measured inside the page.
const clickAndWait = (page) => page.evaluate(async () => {
  const $ = (q) => document.querySelector(q);
  const t = performance.now();
  $('#run').click();
  const clickMs = performance.now() - t;
  const lags = [];
  while (!$('#working').hidden) {
    lags.push(await new Promise((r) => { const a = performance.now(); setTimeout(() => r(performance.now() - a - 50), 50); }));
  }
  return { clickMs, lags, doneMs: performance.now() - t, summary: $('#summary').textContent, hasWorker: typeof Worker !== 'undefined', cores: navigator.hardwareConcurrency };
});

{
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate((v) => { document.querySelector('#csv').value = v; }, csv);
  const o = await clickAndWait(page);
  console.log(`${file || `${N} seeded points`}, browser cores ${o.cores}; analyze() in Node: ${nodeMs} ms`);
  console.log(`click returned after ${Math.round(o.clickMs)} ms; results shown ${Math.round(o.doneMs)} ms after it`);
  console.log(`a 50 ms timer fired ${o.lags.length} times while it ran, worst ${Math.round(Math.max(0, ...o.lags))} ms late`);
  check(o.summary === expected, 'worker summary matches Node');
  check(o.clickMs < 200 && Math.max(0, ...o.lags) < 200, 'page answers while the analysis runs (click < 200 ms, timer lag < 200 ms)');

  // 2. a long run superseded by a short one
  const r2 = await page.evaluate(async ({ long, short }) => {
    const $ = (q) => document.querySelector(q);
    $('#csv').value = long; $('#run').click();
    await new Promise((r) => setTimeout(r, 100));
    $('#csv').value = short; $('#run').click();
    while (!$('#working').hidden) await new Promise((r) => setTimeout(r, 50));
    const first = $('#summary').textContent;
    await new Promise((r) => setTimeout(r, 1500));
    return { first, later: $('#summary').textContent };
  }, { long: csv, short: DEFAULTS.csv });
  check(r2.first === nile && r2.later === nile, 'a newer run replaces a busy one; the stale result never shows');

  // 4. several columns through the worker
  const m = await page.evaluate(async () => {
    const $ = (q) => document.querySelector(q);
    $('#multi-results').hidden = true;
    $('#example-fx').click(); // loads the example by import(), then runs
    const t = performance.now();
    while ($('#multi-results').hidden && !$('#error').textContent && performance.now() - t < 60000) await new Promise((r) => setTimeout(r, 50));
    return { shown: !$('#multi-results').hidden, text: $('#multi-summary').textContent, err: $('#error').textContent };
  });
  check(m.shown && m.text.length > 20 && !m.err, `several-columns example runs in the worker: "${m.text.slice(0, 70)}..."`);
  await page.close();
}

{
  // 3. no Worker at all
  const page = await browser.newPage();
  await page.addInitScript(() => { delete window.Worker; });
  await page.goto(url);
  await page.evaluate((v) => { document.querySelector('#csv').value = v; }, DEFAULTS.csv);
  const o = await clickAndWait(page);
  check(!o.hasWorker && o.summary === nile, 'without workers the page runs it on the main thread and gets the same summary');
  await page.close();
}
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
