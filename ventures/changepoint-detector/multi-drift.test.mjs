// The drift model with one segmentation for several columns (multi-drift.mjs), and the sticky-series
// noise fallback in drift-level.mjs driftNoise (README "The drift model on several columns").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, driftNoise } from './drift-level.mjs';
import { multiDriftChanges, multiDrift, multiDriftPenalty } from './multi-drift.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
const wander = (r, n, omega, step = 0, at = 100) => { let mu = 0; return Array.from({ length: n }, (_, i) => { if (i) mu += omega * gauss(r); return mu + gauss(r) + (i >= at ? step : 0); }); };
const airmiles = readFileSync(new URL('./data/airmiles.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',').pop());

test('one column is exactly the one-column drift model (changes and cost), both noise estimates', () => {
  for (const noise of ['lags', 'ml']) {
    const u = driftLevelChanges(airmiles, { noise });
    const m = multiDriftChanges([airmiles], { noise });
    assert.deepEqual(m.changepoints, u.changepoints);
    assert.ok(Math.abs(m.cost - u.cost) < 1e-9);
    assert.equal(m.penalty, 2 * Math.log(airmiles.length));
  }
});

test('penalty is (1 + d) log n', () => {
  assert.equal(multiDriftPenalty(200, 4), 5 * Math.log(200));
});

test('four wandering columns, no step: the joint drift fit reports nothing; with a 3 sd step in every column it finds it', () => {
  const r = rng(11);
  const quiet = Array.from({ length: 4 }, () => wander(r, 200, 0.3));
  assert.deepEqual(multiDriftChanges(quiet).changepoints, []);
  const stepped = Array.from({ length: 4 }, () => wander(r, 200, 0.3, 3));
  const cps = multiDriftChanges(stepped).changepoints;
  assert.equal(cps.length, 1);
  assert.ok(Math.abs(cps[0] - 100) <= 5, `found at ${cps[0]}`);
});

test('multiDrift reports each column\'s jump at a shared change, in its own units and noise sds', () => {
  const r = rng(5);
  const a = wander(r, 200, 0.1, 4), b = wander(r, 200, 0.1, 0).map((v) => 10 * v);
  const out = multiDrift([a, b]);
  assert.equal(out.changes.length, 1);
  const [ja, jb] = out.changes[0].jumps;
  assert.ok(ja.sds > 2.5, `column a moved ${ja.sds} sd`);
  assert.ok(Math.abs(jb.sds) < 2, `column b moved ${jb.sds} sd`);
  assert.equal(out.levels.length, 2);
});

test('input checks', () => {
  assert.throws(() => multiDriftChanges([]), /one or more/);
  assert.throws(() => multiDriftChanges([[1, 2, 3, 4], [1, 2, 3]]), /same number/);
  assert.throws(() => multiDriftChanges([[1, 2, 3, 4]], { noise: 'x' }), /ml or lags/);
});

test('sticky series: when most differences are zero the noise falls back to the plain variance, not the 1e-6 floor', () => {
  // Off most of the time, then on, like TCPD occupancy's V3 (329 of 508 differences zero).
  const r = rng(3);
  const x = Array.from({ length: 300 }, (_, i) => (i % 60 < 40 ? 0 : 400 + 30 * gauss(r)));
  const { sigma } = driftNoise(x);
  assert.ok(sigma > 1, `sigma ${sigma}`);
  // Before the fallback sigma was 1e-6 and the fit made 48 cuts (every 2 to 3 points of each on stretch);
  // now 26. The 10 real switches are all found; the rest is the off/on change of noise level, which
  // this model does not claim to handle (it assumes one sigma).
  const cps = driftLevelChanges(x, { noise: 'ml' }).changepoints;
  assert.ok(cps.length <= 30, `${cps.length} cuts`);
  for (const at of [40, 60, 100, 120, 160, 180, 220, 240, 280]) assert.ok(cps.some((c) => Math.abs(c - at) <= 2), `switch at ${at}`);
});
