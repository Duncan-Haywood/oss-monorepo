// Headless-Chromium check of the wandering-level model on the page (index.html runDrift/showDrift,
// drift-view.mjs, analyze-job.mjs kind 'drift'). Serves this directory on a local port and:
//  1. Nile with "Sudden jumps on a level that wanders": summary, jumps table and notes equal
//     drift-view.mjs run in Node on the same input, no page errors, chart drawn, CSV equal;
//  2. AIC refused with the page's message; the ignored-options note when logs are ticked;
//  3. tree-ring (7,980 points) in the worker: click-to-results time and the worst lag of a 50 ms
//     timer while it runs, with the summary equal to Node's;
//  4. no Worker: the same Nile summary on the main thread;
//  5. switching back to the level model restores its legend and tables.
// Run: node eval/drift-page-browser.mjs   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DEFAULTS } from '../engine.mjs';
import { driftResult } from '../drift-cli.mjs';
import { driftSummary, driftTableHtml, driftNotes, driftCsv } from '../drift-view.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const tree = await readFile(join(dir, 'data/treering.csv'), 'utf8');
const nileR = driftResult({ csv: DEFAULTS.csv });
let t0 = Date.now();
const treeR = driftResult({ csv: tree });
const treeNodeMs = Date.now() - t0;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };

const runDrift = (page, csv, extra = {}) => page.evaluate(async ({ csv, extra }) => {
  const $ = (q) => document.querySelector(q);
  $('#csv').value = csv; $('#shape').value = 'one'; $('#model').value = 'drift';
  $('#penalty').value = extra.penalty || 'bic'; $('#log').checked = !!extra.log;
  $('#error').textContent = '';
  const t = performance.now();
  $('#run').click();
  const clickMs = performance.now() - t;
  const lags = [];
  while (!$('#working').hidden) lags.push(await new Promise((r) => { const a = performance.now(); setTimeout(() => r(performance.now() - a - 50), 50); }));
  const notes = [...document.querySelectorAll('#warnings p')].map((p) => p.textContent);
  return {
    clickMs, lags, doneMs: performance.now() - t, summary: $('#summary').textContent, changes: $('#changes').innerHTML,
    notes, error: $('#error').textContent, shown: !$('#results').hidden, chart: $('#chart').innerHTML.length,
    legend: $('#legend').textContent, heading: $('#changes-h').textContent, cores: navigator.hardwareConcurrency, hasWorker: typeof Worker !== 'undefined',
  };
}, { csv, extra });

{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);

  const n = await runDrift(page, DEFAULTS.csv);
  check(n.shown && n.summary === driftSummary(nileR), `Nile summary equals Node: "${n.summary.slice(0, 80)}..."`);
  check(n.changes.replace(/<\/?tbody>/g, '') === driftTableHtml(nileR), 'jumps table equals Node (1899 alone; tbody aside)');
  check(JSON.stringify(n.notes.map((t) => t.replace(/^Read with care: /, ''))) === JSON.stringify(driftNotes(nileR)), 'notes equal Node');
  check(n.chart > 1000 && /fitted level/.test(n.legend) && /^Jumps/.test(n.heading), 'chart drawn with the wandering-level legend and headings');

  const dl = await page.evaluate(async () => {
    let blob = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = () => {};
    document.querySelector('#download').click();
    URL.createObjectURL = orig;
    return blob ? await blob.text() : null;
  });
  check(dl === driftCsv(nileR), 'per-point CSV equals Node');

  const a = await runDrift(page, DEFAULTS.csv, { penalty: 'aic' });
  check(/BIC penalty or a custom number/.test(a.error), `AIC refused: "${a.error}"`);
  const l = await runDrift(page, DEFAULTS.csv, { log: true });
  check(l.notes.some((t) => /ignored: take logs first/.test(t)), 'ticked logs are reported as ignored');

  const t = await runDrift(page, tree);
  console.log(`tree-ring, ${treeR.n} points, browser cores ${t.cores}: driftResult in Node ${treeNodeMs} ms; page click returned in ${Math.round(t.clickMs)} ms, results ${Math.round(t.doneMs)} ms after it; a 50 ms timer fired ${t.lags.length} times, worst ${Math.round(Math.max(0, ...t.lags))} ms late`);
  check(t.summary === driftSummary(treeR), 'tree-ring summary equals Node');
  check(t.clickMs < 200 && Math.max(0, ...t.lags) < 200, 'page answers while it runs (click < 200 ms, timer lag < 200 ms)');

  const back = await page.evaluate(async () => {
    const $ = (q) => document.querySelector(q);
    $('#model').value = 'mean'; $('#log').checked = false; $('#csv').value = $('#csv').value.slice(0, 5000);
    $('#run').click();
    while (!$('#working').hidden) await new Promise((r) => setTimeout(r, 50));
    return { legend: $('#legend').textContent, heading: $('#changes-h').textContent, head: $('#changes').innerHTML.slice(0, 40) };
  });
  check(/segment mean \(PELT\)/.test(back.legend) && back.heading === 'Changes (PELT)' && /New segment from|No change/.test(back.head), 'the level model afterwards shows its own legend and tables');
  check(!errors.length, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await page.close();
}
{
  const page = await browser.newPage();
  await page.addInitScript(() => { delete window.Worker; });
  await page.goto(url);
  const o = await runDrift(page, DEFAULTS.csv);
  check(!o.hasWorker && o.summary === driftSummary(nileR), 'without workers: the same Nile summary on the main thread');
  await page.close();
}
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
