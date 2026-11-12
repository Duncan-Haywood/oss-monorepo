// A stale probability per segment (drift-level.mjs stale 'segment'; README "A stale probability per
// segment", eval/drift-stale-segment.mjs, pre-registered, negative). Pins the library behaviour, the
// frozen-juice half (data ships here) and the committed run (the TCPD half needs eval/tcpd-fetch.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, staleCost } from './drift-level.mjs';
import { frozenJuice } from './eval/drift-sticky-penalty.mjs';
import { cuts } from './eval/drift-stale-segment.mjs';

const out = readFileSync(new URL('./eval/drift-stale-segment.out.txt', import.meta.url), 'utf8');

test('staleCost is the profiled Bernoulli -2 log-likelihood, 0 when every step is alike', () => {
  assert.equal(staleCost(0, 10), 0);
  assert.equal(staleCost(10, 10), 0);
  assert.ok(Math.abs(staleCost(2, 4) - 8 * Math.log(2)) < 1e-12);
});

test('with no exact repeats, stale segment is plain missing; it needs repeats missing', () => {
  let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let m = 0; const x = Array.from({ length: 150 }, (_, t) => (m += r() - 0.5) + (t >= 80 ? 3 : 0));
  const a = driftLevelChanges(x, { noise: 'ml', repeats: 'missing' });
  const b = driftLevelChanges(x, { noise: 'ml', repeats: 'missing', stale: 'segment' });
  assert.deepEqual(b.changepoints, a.changepoints);
  assert.equal(b.stale, 'segment');
  assert.throws(() => driftLevelChanges(x, { stale: 'segment' }), /needs repeats missing/);
  assert.throws(() => driftLevelChanges(x, { repeats: 'missing', stale: 'nope' }), /shared or segment/);
});

test('a change in stickiness alone is a cut under stale segment', () => {
  let s = 11; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let m = 0; const x = [];
  for (let t = 0; t < 300; t++) { m += r() - 0.5; x.push(t && r() < (t < 150 ? 0.05 : 0.7) ? x[t - 1] : m); }
  const c = driftLevelChanges(x, { noise: 'ml', repeats: 'missing', stale: 'segment' }).changepoints;
  assert.ok(c.some((v) => Math.abs(v - 150) <= 5), `cuts ${c}`);
});

test('frozen juice: stale segment finds the same 5 of 8 freezes as missing, with more cuts', () => {
  const fj = frozenJuice();
  const miss = fj.score(cuts(fj.price, 'missing')), seg = fj.score(cuts(fj.price, 'segment'));
  assert.deepEqual([miss.cuts, miss.found.length], [18, 5]);
  assert.deepEqual([seg.cuts, seg.found.length], [24, 5]);
  assert.deepEqual(seg.found, miss.found);
});

test('the committed run: R1-R3 fail, R4 passes, nothing changes for users', () => {
  assert.match(out, /segment: F1 0\.381 cover 0\.435/);
  assert.match(out, /R1 FAIL/);
  assert.match(out, /R2 FAIL/);
  assert.match(out, /R3 FAIL: F cuts 3\.98 vs missing 1\.59/);
  assert.match(out, /R4 PASS/);
  assert.match(out, /verdict: FAIL, nothing changes for users/);
});
