// The segment-wise GARCH prune in eval/meanvar-garch-segments.mjs takes cut indexes. Until 2026-11-13 the script
// passed analyze()'s changepoint objects, every likelihood came out NaN, and its 2026-11-02 table measured nothing
// (README, "Pruning meanvar cuts with a segment-wise GARCH likelihood"). These checks would have caught it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';
import { pruneByGarch } from './eval/meanvar-garch-segments.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

test('a clear sd break survives the prune and spurious extra cuts are dropped', () => {
  const r = rng(42), n = 200;
  const x = Array.from({ length: n }, (_, i) => (i < 100 ? 1 : 3) * gauss(r));
  const kept = pruneByGarch(x, [40, 100, 160], 1.5 * Math.log(n));
  assert.deepEqual(kept, [100]);
});

test('analyze() changepoints must be mapped to indexes before pruning', () => {
  const r = rng(7), n = 200;
  const x = Array.from({ length: n }, (_, i) => (i < 100 ? 1 : 3) * gauss(r));
  const cps = analyze({ values: x, model: 'meanvar' }).pelt.changepoints;
  assert.equal(typeof cps[0], 'object', 'analyze returns objects; the prune needs numbers');
  assert.throws(() => pruneByGarch(x, cps, 1.5 * Math.log(n)), TypeError);
  const kept = pruneByGarch(x, cps.map((c) => c.index), 1.5 * Math.log(n));
  assert.equal(kept.length, 1);
  assert.ok(Math.abs(kept[0] - 100) <= 5, `kept ${kept[0]}`);
});

test('a null series with a lone false cut loses it', () => {
  const r = rng(11), n = 200;
  const x = Array.from({ length: n }, () => gauss(r));
  assert.deepEqual(pruneByGarch(x, [70], 1.5 * Math.log(n)), []);
});
