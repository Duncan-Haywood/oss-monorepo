// The rounded-walk likelihood test for one-tick stale feeds (rounded-walk.mjs; README "One-tick stale
// feeds: a likelihood"; eval/update-rate-stale-lr.mjs). Round three failed K1, so the shipped setting
// stays off: these tests pin the likelihood, that `method: 'lr'` is opt-in only, and the verdict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundedWalkLogLik, staleLikelihoodRatio, toTicks, STALE_LR, staleTest } from './rounded-walk.mjs';
import { updateRateChanges, CATCHUP } from './update-rate.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

test('one step of a rounded walk: the probability matches the closed form', () => {
  // x0 uniform on [-0.5, 0.5), x1 = x0 + s e; P(round(x1) = 0) by numerical integration
  const s = 0.8;
  const Phi = (z) => { let a = 0; const h = 0.001; for (let x = -8; x < z; x += h) a += Math.exp(-x * x / 2) * h; return a / Math.sqrt(2 * Math.PI); };
  let p = 0; const m = 200;
  for (let i = 0; i < m; i++) { const x0 = -0.5 + (i + 0.5) / m; p += (Phi((0.5 - x0) / s) - Phi((-0.5 - x0) / s)) / m; }
  const ll = roundedWalkLogLik([0, 0], s, 0, 40);
  assert.ok(Math.abs(Math.exp(ll) - p) < 2e-3, `${Math.exp(ll)} vs ${p}`);
  // carried forward with probability q: q + (1 - q) p
  assert.ok(Math.abs(Math.exp(roundedWalkLogLik([0, 0], s, 0.3, 40)) - (0.3 + 0.7 * p)) < 2e-3);
  // a move cannot be a carry-forward
  assert.ok(Math.abs(roundedWalkLogLik([0, 1], s, 0.3, 40) - (Math.log(0.7) + roundedWalkLogLik([0, 1], s, 0, 40))) < 1e-9);
});

test('ticks from values, missing values dropped', () => {
  assert.deepEqual(toTicks([5.0, 5.1, NaN, 4.9, 5.0], 0, 4, 0.1), [0, 1, -1, 0]);
});

test('LR: near 0 on a rounded walk, large on the same walk carried forward', () => {
  const rnd = makeRng(77);
  const walk = [], stale = [];
  let x = 0, last = 0;
  for (let t = 0; t < 200; t++) {
    x += 0.8 * gauss(rnd);
    walk.push(Math.round(x));
    last = t > 0 && rnd() < 0.5 ? last : Math.round(x);
    stale.push(last);
  }
  const a = staleLikelihoodRatio(walk), b = staleLikelihoodRatio(stale);
  assert.ok(a.lr < STALE_LR.threshold, `walk lr ${a.lr}`);
  assert.ok(b.lr > 30, `stale lr ${b.lr}`);
  assert.ok(Math.abs(b.p - 0.5) < 0.2, `p ${b.p}`);
  assert.equal(staleLikelihoodRatio(walk.slice(0, 10)), null);
});

test('round three (Gaussian, whole stretch) still reproduces when asked; round four is the default', () => {
  assert.equal(CATCHUP.ratio, Infinity);
  assert.equal(CATCHUP.method, 'lr');
  const rows = read('./data/frozen-juice.csv').trim().split('\n').slice(1).map((l) => l.split(','));
  const ppi = rows.map((r) => Number(r[2]));
  // the ratio-only base, as before round four: no likelihood
  const off = updateRateChanges(ppi, { catchUp: { method: null } });
  assert.equal(off.changes[0].staleLR, undefined);
  // round three asked for: the rounded index stays rounding (descriptive, README)
  const on = updateRateChanges(ppi, { catchUp: { method: 'lr', lr: 5.41, test: staleTest } });
  assert.equal(on.changes[0].rounding, true);
  assert.ok(on.changes[0].staleLR < 5.41);
  // the default (round five): still rounding
  const now = updateRateChanges(ppi);
  assert.equal(now.changes[0].rounding, true);
  assert.ok(now.changes[0].staleLR < 5.41, `ppi LR ${now.changes[0].staleLR}`);
});

test('round three fails as committed', () => {
  const o = read('./eval/update-rate-stale-lr.out.txt');
  assert.match(o, /seed 20261215/);
  assert.match(o, /R2 +200 +200 +23 +0\.115/);
  assert.match(o, /T1 +163 +141 +141 +1\.000/);
  assert.match(o, /K1 \(R: catchUp <= 0\.05 of one tick, rounding >= 0\.90\): FAIL/);
  assert.match(o, /K2 \(judged T: catchUp >= 0\.80 of one tick, >= 2 judged\): pass/);
  assert.match(o, /K4 .*: FAIL/);
  assert.match(o, /Verdict: does not ship/);
});
