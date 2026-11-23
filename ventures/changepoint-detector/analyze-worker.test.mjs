// The page's main analysis runs in a Web Worker (index.html startMain, analyze-worker.mjs,
// analyze-job.mjs). These pin that the job gives exactly what a direct call gives, that the
// answer survives the structured clone a worker message goes through, that errors come back
// as text, and that the worker stays local. The browser run itself: eval/analyze-worker-browser.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeJob, MULTI_NEEDS_TWO } from './analyze-job.mjs';
import { analyze, DEFAULTS } from './engine.mjs';
import { parseColumns, analyzeMulti } from './multivariate.mjs';
import { FX_CSV } from './example-fx.mjs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

test('one column: the job equals analyze() and survives structured clone, for every model', () => {
  for (const o of [{ model: 'mean' }, { model: 'meanvar', robust: true }, { model: 'poisson' }, { model: 'mean', trend: true },
    { model: 'mean', slopeBreaks: true }, { model: 'mean', ar1: 'joint' }, { model: 'mean', period: 12, drift: true },
    { model: 'mean', noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }]) {
    const opts = { csv: DEFAULTS.csv, ...o };
    const out = analyzeJob({ kind: 'one', opts });
    assert.equal(out.error, undefined, JSON.stringify(o));
    assert.deepEqual(structuredClone(out.result), analyze(opts), JSON.stringify(o));
  }
});

test('several columns: the job equals parseColumns + analyzeMulti and clones', () => {
  const opts = { model: 'meanvar', penalty: 'bic', floor: 'auto', ar1: false };
  const out = analyzeJob({ kind: 'multi', csv: FX_CSV, columns: [], opts });
  const p = parseColumns(FX_CSV, null, null);
  assert.deepEqual(structuredClone(out.result), { p, r: analyzeMulti({ ...p, ...opts }) });
});

test('errors come back as messages, never thrown', () => {
  assert.match(analyzeJob({ kind: 'one', opts: { csv: 'v\n1\n2' } }).error, /./);
  assert.equal(analyzeJob({ kind: 'multi', csv: 'a,b\n1,x\n2,y\n3,z', columns: [], opts: { model: 'mean' } }).error, MULTI_NEEDS_TWO);
});

test('the worker imports only local files and sends nothing anywhere', () => {
  const w = read('analyze-worker.mjs');
  assert.deepEqual([...w.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./analyze-job.mjs']);
  assert.doesNotMatch(w + read('analyze-job.mjs'), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/);
});

test('the page runs both modes through the worker, cancels a stale run and keeps a fallback', () => {
  const html = read('index.html');
  assert.match(html, /new Worker\("\.\/analyze-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(html, /startMain\(\{ kind: "one", opts(, \.\.\.\(synth \? \{ synth \} : \{\}\))? \}/);
  assert.match(html, /startMain\(\{ kind: "multi", csv[,:] /);
  // Several columns: every column's panel goes to the panel workers first, then the finished runs ride
  // with the job to the main worker (columnRuns); a worker failure falls back to the main worker alone.
  assert.match(html, /new Worker\("\.\/consensus-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(html, /runColumnPanels\(parsed\.cols, go\)/);
  assert.match(html, /stopColumnPanels\(\);\s*done\(null\)/);
  assert.match(html, /if \(mainJob && mainWorker\) \{ mainWorker\.terminate\(\)/);
  assert.match(html, /finish\(analyzeJob\(job\)\)/);
  assert.doesNotMatch(html, /\banalyze\(\{|analyzeMulti\(/);
});

test('the page warms the main worker when idle, and drops a warm worker that fails to load', () => {
  const html = read('index.html');
  const warm = html.slice(html.indexOf('function warmMain()'), html.indexOf('requestIdleCallback(warmMain'));
  assert.ok(warm.length > 0, 'warmMain is defined before it is scheduled');
  // Only when no worker exists, so a press that came first keeps its own; the same file and type as startMain.
  assert.match(warm, /if \(mainWorker \|\| typeof Worker === "undefined"\) return;/);
  assert.match(warm, /new Worker\("\.\/analyze-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(warm, /if \(mainWorker === w\) \{ w\.terminate\(\); mainWorker = null; \}/);
  assert.match(html, /if \("requestIdleCallback" in window\) requestIdleCallback\(warmMain, \{ timeout: 2000 \}\); else setTimeout\(warmMain, 500\);/);
  // One idle panel worker too, dropped if it fails to load and taken as the first worker of the first panel.
  assert.match(warm, /const pw = new Worker\("\.\/consensus-worker\.mjs", \{ type: "module" \}\);/);
  assert.match(warm, /if \(panelWarm === pw\) dropPanelWarm\(\);/);
  assert.equal(html.split('workers.push(takePanelWarm() || new Worker("./consensus-worker.mjs", { type: "module" }))').length - 1, 2, 'both panels take the warm worker');
  assert.match(html, /function takePanelWarm\(\) \{ const w = panelWarm; panelWarm = null; return w; \}/);
  // startMain reuses a warm worker and replaces its error handler before posting the job.
  assert.match(html, /if \(!mainWorker\) mainWorker = new Worker/);
  assert.ok(html.indexOf('mainWorker.onerror = (e) =>') < html.indexOf('mainWorker.postMessage({ id: me.id, job })'));
});
