// eval/turns-realtime-weights.mjs: composite weights set in real time by a robust scale (README "Composite weights
// set in real time"). Pins the pre-registered result: M1, M2, M4 and M5 pass, M3 fails under P3, nothing ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, fullSample } from './eval/turns-realtime-weights.mjs';
import { compositeIndex } from './composite-index.mjs';

test('MAD weights in real time: 16 of 16 called, 8 of 12 before NBER, M3 fails on P3 only', () => {
  const r = run();
  assert.deepEqual([r.M1, r.M2, r.M3, r.M4, r.M5, r.ships], [true, true, false, true, true, false]);
  assert.equal(r.M[3].called, 16);
  assert.equal(r.M[3].before, 8);
  assert.equal(r.M[3].episodes.length, 8);
  assert.equal(r.M[6].episodes.length, 6);
  const pk01 = (p) => r.M[p].calls.find((c) => c.month === '2001-03').delay;
  assert.equal(pk01(3), 6);
  assert.equal(r.M[3].calls.find((c) => c.month === '1969-12').delay, 5);
  const L = r.M[3].label;
  const pair = r.M[3].episodes.find((e) => e.kind === 'peak' && L[e.lo] === '2002-11');
  assert.equal(L[pair.last], '2026-07');
});

test('full sample: MAD weights date 16 of 16 with the 2002-03 pair; sd 15 of 16, none false', () => {
  const m = fullSample('mad'), s = fullSample('sd');
  assert.deepEqual([m.matched, m.falses, s.matched, s.falses], [16, 2, 15, 0]);
  assert.deepEqual(m.weights.map((w) => Number(w.toFixed(3))), [0.528, 0.238, 0.134, 0.1]);
});

test('compositeIndex scale: mad ignores one wild month that moves sd; unknown scale refused', () => {
  const a = Array.from({ length: 40 }, (_, t) => 100 + t + (t % 2 ? 0.5 : 0));
  const b = Array.from({ length: 40 }, (_, t) => 50 + 0.5 * t + (t % 3 ? 0.2 : 0));
  const wild = b.map((v, t) => (t === 20 ? v * 0.7 : v));
  const w = (x, scale) => compositeIndex([a, x], { scale }).weights[1];
  assert.ok(Math.abs(w(wild, 'sd') - w(b, 'sd')) > 0.1);
  assert.ok(Math.abs(w(wild, 'mad') - w(b, 'mad')) < 0.05);
  assert.throws(() => compositeIndex([a, b], { scale: 'iqr' }), /unknown scale/);
});
