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
  assert.match(html, /stopAgreed\(\);\s*if \(\$\("#model"\)\.value === "mean"\) runAgreed/);
  assert.match(html, /AGREED_SYNC_MAX = 2000/);
  assert.match(html, /<code>agreed_run<\/code>/);
  // The slowest-first order must hand out every setting exactly once.
  const order = JSON.parse(html.match(/const order = (\[[\d, ]+\])/)[1]);
  assert.deepEqual([...order].sort((a, z) => a - z), PANEL.map((_, i) => i));
});
