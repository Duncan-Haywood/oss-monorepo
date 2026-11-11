// The page runs the agreed-changes panel one setting per Web Worker and merges
// the results (index.html runAgreed, consensus-worker.mjs). These pin that the
// split pieces give exactly what consensus() gives, and that the worker file
// stays local. The browser run itself: eval/agreed-worker-browser.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANEL, consensus, mergeConsensus, runSetting, agreedText } from './consensus.mjs';
import { DEFAULTS } from './engine.mjs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

test('settings run apart and merged in any finishing order equal consensus()', () => {
  const base = { csv: DEFAULTS.csv, column: null, log: false, period: 0, penalty: 'bic' };
  const whole = consensus(base);
  const runs = PANEL.map((p) => runSetting(base, p));
  // Workers finish out of order; the page stores each by its panel index.
  const stored = new Array(PANEL.length);
  for (const i of [3, 0, 5, 1, 4, 2]) stored[i] = runs[i];
  assert.deepEqual(mergeConsensus(stored), whole);
  assert.equal(agreedText(mergeConsensus(stored)), agreedText(whole));
});

test('a caller model or floor never leaks into a setting', () => {
  const base = { csv: DEFAULTS.csv, model: 'poisson', noiseFloor: 9, trend: true, ar1: true };
  const r = runSetting(base, PANEL[0]);
  assert.equal(r.error, undefined);
  assert.deepEqual(r, runSetting({ csv: DEFAULTS.csv }, PANEL[0]));
});

test('a setting that cannot run is skipped, and none running throws', () => {
  const bad = runSetting({ csv: 'v\n1\n2' }, PANEL[0]);
  assert.ok(bad.error);
  assert.throws(() => mergeConsensus([bad]), /No setting could run/);
  const good = runSetting({ csv: DEFAULTS.csv }, PANEL[0]);
  const m = mergeConsensus([good, { ...bad, name: PANEL[1].name }]);
  assert.equal(m.settings.length, 1);
  assert.equal(m.skipped.length, 1);
});

test('the worker imports only local files and sends nothing anywhere', () => {
  const w = read('consensus-worker.mjs');
  assert.deepEqual([...w.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./consensus.mjs']);
  assert.doesNotMatch(w + read('consensus.mjs'), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/);
});

test('the page starts the worker, stops a stale panel and keeps a no-worker fallback', () => {
  const html = read('index.html');
  assert.match(html, /new Worker\("\.\/consensus-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(html, /stopAgreed\(\);\s*if \(agreedBase\) runAgreed\(agreedBase, r\.n, levelRunFromMain\(opts, r\)\)/);
  assert.match(html, /const wantAgreed = \$\("#model"\)\.value === "mean";/);
  assert.match(html, /AGREED_SYNC_MAX = 2000/);
  assert.match(html, /<code>agreed_run<\/code>/);
  // The slowest-first order must hand out every setting exactly once.
  const order = JSON.parse(html.match(/const order = (\[[\d, ]+\])/)[1]);
  assert.deepEqual([...order].sort((a, z) => a - z), PANEL.map((_, i) => i));
});

// The page hands its own result to the panel as the "level" setting when nothing in its
// options moves a cut. These are the page's default options (index.html run(), all boxes off).
const pageOpts = (o = {}) => ({ csv: DEFAULTS.csv, column: null, model: 'mean', robust: false, period: 0, drift: false, overdispersion: false, jointKnots: false, bursts: false, log: false, slopeBreaks: false, holidays: [], knotMargin: 0.1, trend: false, ar1: false, penalty: 'bic', hazardLambda: 100, threshold: 0.5, ...o });

test('the main result stands in for the level setting exactly when the options match', async () => {
  const { analyze } = await import('./engine.mjs');
  const { levelRunFromMain } = await import('./consensus.mjs');
  const fx = (await import('./example-fx.mjs')).FX_CSV;
  for (const o of [{}, { hazardLambda: 20, threshold: 0.8 }, { log: true }, { period: 12 }, { penalty: 'aic' }, { knotMargin: 0.2 }, { csv: fx, column: 'GBP' }]) {
    const opts = pageOpts(o);
    const base = { csv: opts.csv, column: opts.column, log: opts.log, period: opts.period, penalty: opts.penalty };
    const pre = levelRunFromMain(opts, analyze(opts));
    assert.ok(pre, JSON.stringify(o));
    assert.deepEqual(pre, runSetting(base, PANEL[0]), JSON.stringify(o));
    const whole = consensus(base);
    assert.deepEqual(mergeConsensus(PANEL.map((p, i) => (i === 0 ? pre : runSetting(base, p)))), whole);
  }
  for (const o of [{ ar1: true }, { trend: true }, { bursts: true }, { drift: true }, { model: 'meanvar' }, { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }, { holidays: ['2020-01-01'] }, { slopeBreaks: true }, { minSegment: 5 }]) {
    const opts = pageOpts(o);
    assert.equal(levelRunFromMain(opts, { labels: [], pelt: { changepoints: [] } }), null, JSON.stringify(o));
  }
});
