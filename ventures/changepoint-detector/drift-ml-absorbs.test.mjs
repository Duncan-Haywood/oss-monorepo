import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftNoise, driftLevelChanges, driftSegmentCost } from './drift-level.mjs';

// README "Why the likelihood's wander absorbs a step" (2026-11-22). Numbers match
// eval/drift-ml-absorbs.out.txt (TCPD's seatbelts is this series; index 169 = 1983-02).
const rows = readFileSync(new URL('./data/uk-driver-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const LAW = labels.indexOf('1983-02');

// Penalised cost of a fixed partition, q profiled on a log grid, as driftNoiseML does with the changes free.
function profiled(y, cps, sigma, beta) {
  const b = [0, ...cps, y.length];
  let best = Infinity;
  for (let e = -4; e <= 2; e += 0.05) {
    const omega = sigma * Math.sqrt(10 ** e);
    let c = cps.length * beta;
    for (let i = 0; i + 1 < b.length; i++) c += driftSegmentCost(y.slice(b[i], b[i + 1]), { sigma, omega });
    best = Math.min(best, c);
  }
  return best;
}

test('seat belts: lag noise cuts at the law, ML wander absorbs it; the cut saves less than the penalty', () => {
  assert.equal(LAW, 169);
  const lag = driftLevelChanges(values, {});
  assert.ok(lag.changepoints.some((c) => Math.abs(c - LAW) <= 1), `lag cuts ${lag.changepoints}`);
  const ml = driftLevelChanges(values, { noise: 'ml' });
  assert.deepEqual(ml.changepoints, []);
  assert.ok(ml.ml.q > 0.45 && ml.ml.q < 0.55, `q ${ml.ml.q}`);
  const beta = 2 * Math.log(values.length), s = ml.sigma;
  const none = profiled(values, [], s, beta), law = profiled(values, [LAW - 1], s, beta);
  const saving = none - (law - beta);
  assert.ok(saving > 8 && saving < beta, `the 1983-01 cut saves ${saving} against a penalty of ${beta}`);
});

test('seat belts: taking off the calendar-month medians does not bring the law back (M1 fails)', () => {
  const med = Array.from({ length: 12 }, (_, m) => { const v = values.filter((_, t) => t % 12 === m).sort((a, b) => a - b); return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2; });
  const des = values.map((v, t) => v - med[t % 12]);
  const ml = driftLevelChanges(des, { noise: 'ml' });
  assert.deepEqual(ml.changepoints, []);
  assert.ok(ml.ml.q > 0.25 && ml.ml.q < 0.32, `q ${ml.ml.q}`);
});

test('driftNoise flags a sigma held at its floor: smooth level yes, white noise no', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const white = Array.from({ length: 400 }, gauss);
  assert.equal(driftNoise(white).flooredSigma, false);
  // A level whose increments are themselves an AR(1) with phi 0.8 (momentum), and almost no noise.
  let u = 0, lev = 0;
  const smooth = Array.from({ length: 400 }, () => { u = 0.8 * u + gauss(); lev += u; return lev + 0.05 * gauss(); });
  const est = driftNoise(smooth);
  assert.equal(est.flooredSigma, true);
  assert.ok(Math.abs(est.sigma - Math.sqrt(0.02 * est.lagVariances[0].v / 2)) < 1e-9);
});
