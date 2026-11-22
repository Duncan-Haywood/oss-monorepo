import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendNoise, trendGains, trendSegmentCost, trendWalkChanges } from './drift-trend.mjs';

// README "Jumps on a smooth trend" (2026-11-22). Synthetic only: the TCPD series are not committed
// (eval/trend-walk-floored.mjs fetches them).
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function smooth(seed, n, zeta, step, at) {
  const u = rng(seed), g = () => Math.sqrt(-2 * Math.log(u() + 1e-300)) * Math.cos(2 * Math.PI * u());
  let mu = 0, b = 0.05; const y = [];
  for (let t = 0; t < n; t++) { if (step && t === at) mu += step; y.push(mu + g()); mu += b; b += zeta * g(); }
  return y;
}

test('the partition cost is the penalty per cut plus the segments\' own costs', () => {
  const y = smooth(3, 240, 0.03, 5, 120);
  const r = trendWalkChanges(y);
  assert.ok(r.changepoints.some((c) => Math.abs(c - 120) <= 2), `cuts ${r.changepoints}`);
  const b = [0, ...r.changepoints, y.length];
  let c = r.changepoints.length * r.penalty;
  for (let i = 0; i + 1 < b.length; i++) c += trendSegmentCost(y.slice(b[i], b[i + 1]), { sigma: r.sigma, zeta: r.zeta });
  assert.ok(Math.abs(c - r.cost) < 1e-6, `${c} vs ${r.cost}`);
});

test('the segment cost is the exact Gaussian likelihood of a straight line plus noise when zeta is 0', () => {
  // With zeta 0 the model is a line plus white noise; the diffuse cost is the residual sum of squares
  // of the least-squares line plus the log-determinant term, so two series with the same residuals
  // (one with a line added) cost the same.
  const e = smooth(9, 30, 0, 0, 0).map((v, t) => v - 0.05 * t);
  const line = e.map((v, t) => v + 3 - 0.7 * t);
  const a = trendSegmentCost(e, { sigma: 1, zeta: 0 }), b = trendSegmentCost(line, { sigma: 1, zeta: 0 });
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('second differences size sigma; gains converge', () => {
  const y = smooth(5, 2000, 0.02, 0, 0);
  const est = trendNoise(y);
  assert.ok(est.sigma > 0.9 && est.sigma < 1.1, `sigma ${est.sigma}`);
  assert.equal(est.flooredSigma, false);
  const g = trendGains(400, 0.01);
  assert.ok(Math.abs(g.F[399] - g.F[398]) < 1e-9 && g.F[399] > 1);
});

test('no change on a smooth trend: no cut (eval/trend-walk-floored.out.txt, S1)', () => {
  let cuts = 0;
  for (let s = 0; s < 10; s++) cuts += trendWalkChanges(smooth(100 + s, 200, 0.1, 0, 0)).changepoints.length;
  assert.ok(cuts <= 1, `${cuts} false cuts in 10 series`);
});
