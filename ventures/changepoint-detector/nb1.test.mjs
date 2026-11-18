// NB1 clumping (variance phi mu): the cost, its dispersion estimate, the law check and the analyze wiring
// (README "Clumping that grows with the level", eval/nb1-preregistration.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, makeCost, pelt, nb1Dispersion, clumpingLaw, nbPairCheck, lgamma, digamma, trigamma } from './engine.mjs';

let seed = 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * rnd() ** (1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let z, v; do { z = gauss(); v = 1 + c * z; } while (v <= 0); v = v * v * v; const u = rnd(); if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (l) => { if (l > 60) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb1 = (mu, phi) => pois(gamma(mu / (phi - 1)) * (phi - 1));
const nb2 = (mu, r) => pois(gamma(r) * mu / r);
const ramp = (n, lo, hi) => (t) => lo * Math.exp(Math.log(hi / lo) * t / (n - 1));

test('the combined special functions match lgamma, digamma and trigamma', () => {
  for (const [x, c] of [[1, 0.3], [5, 3.5], [700, 350], [2, 0.01], [40, 12.2]]) {
    const [l, d, t] = nbPairCheck(x, c);
    assert.ok(Math.abs(l - (lgamma(x + c) - lgamma(c))) < 1e-9);
    assert.ok(Math.abs(d - (digamma(x + c) - digamma(c))) < 1e-9);
    assert.ok(Math.abs(t - (trigamma(x + c) - trigamma(c))) < 1e-9);
  }
  assert.ok(Math.abs(digamma(1) + 0.5772156649015329) < 1e-9);
  assert.ok(Math.abs(trigamma(1) - Math.PI ** 2 / 6) < 1e-9);
});

test('the NB1 segment cost is the profile likelihood at the maximising rate, with and without exposures', () => {
  seed = 41;
  const n = 60, delta = 1.5, e = Array.from({ length: n }, (_, t) => 0.3 + 2 * t / n);
  const x = Array.from({ length: n }, (_, t) => nb1(9 * e[t], 1 + delta));
  for (const ex of [null, e]) {
    const cost = makeCost(x, 'negbin1', 1, 0, ex, delta);
    for (let t = 5; t <= n; t++) cost(0, t);  // PELT's order: warm starts along t
    const brute = (s, t) => {
      let best = -Infinity;
      for (let lam = 0.5; lam < 40; lam += 0.0005) {
        let ll = 0, E = 0;
        for (let i = s; i < t; i++) { const ei = ex ? ex[i] : 1, c = lam * ei / delta; E += ei; if (x[i] > 0) ll += lgamma(x[i] + c) - lgamma(c); }
        ll -= lam * E * Math.log1p(delta) / delta;
        if (ll > best) best = ll;
      }
      return -2 * best;
    };
    assert.ok(Math.abs(cost(0, n) - brute(0, n)) < 1e-3, `${cost(0, n)} vs ${brute(0, n)}`);
  }
  assert.throws(() => makeCost(x0(), 'negbin1', 1, 0, null, 0), /dispersion delta > 0/);
});
const x0 = () => [1, 2, 3, 4];

test('nb1Dispersion reads phi against the local level and calls Poisson counts Poisson', () => {
  seed = 42;
  const flat = Array.from({ length: 400 }, () => nb1(20, 3));
  const up = Array.from({ length: 400 }, (_, t) => nb1(ramp(400, 7, 700)(t), 3));
  assert.ok(Math.abs(nb1Dispersion(flat) - 3) < 0.5, String(nb1Dispersion(flat)));
  assert.ok(Math.abs(nb1Dispersion(up) - 3) < 0.5, String(nb1Dispersion(up)));
  assert.equal(nb1Dispersion(Array.from({ length: 400 }, (_, t) => pois(ramp(400, 7, 700)(t)))), 1);
  assert.equal(nb1Dispersion([3, 4, 5]), 1);
});

test('clumpingLaw tells NB1 from NB2 when the level moves, and says either when it does not', () => {
  seed = 43;
  const f = ramp(400, 7, 700);
  assert.equal(clumpingLaw(Array.from({ length: 400 }, (_, t) => nb1(f(t), 3))).law, 'nb1');
  assert.equal(clumpingLaw(Array.from({ length: 400 }, (_, t) => nb2(f(t), 8))).law, 'nb2');
  const flat = clumpingLaw(Array.from({ length: 400 }, () => nb1(20, 3)));
  assert.equal(flat.law, 'either');
  assert.ok(flat.levelSpan < 3);
});

test('analyze: nb1 finds a clear step, reports the law used, and nb points to nb1 on NB1 counts that move', () => {
  seed = 44;
  const x = Array.from({ length: 160 }, (_, t) => nb1(t < 80 ? 15 : 45, 3));
  const r = analyze({ values: x, model: 'poisson', overdispersion: 'nb1' });
  assert.ok(r.pelt.changepoints.some((c) => Math.abs(c.index - 80) <= 3));
  assert.equal(r.clumping.used.law, 'nb1');
  assert.ok(Math.abs(r.clumping.used.phi - 3) < 1);
  const f = ramp(300, 7, 700);
  const y = Array.from({ length: 300 }, (_, t) => nb1(f(t), 3));
  const s = analyze({ values: y, model: 'poisson', overdispersion: 'nb' });
  assert.equal(s.clumping.fits, 'nb1');
  assert.match(s.clumpingWarning, /--overdispersion nb1/);
  assert.throws(() => analyze({ values: x, model: 'mean', overdispersion: 'nb1' }), /for counts/);
});

test('pelt with the NB1 cost keeps a flat NB1 series whole', () => {
  seed = 45;
  let cuts = 0;
  for (let r = 0; r < 10; r++) cuts += pelt(Array.from({ length: 200 }, () => nb1(20, 3)), { model: 'negbin1', size: 2 }).changepoints.length;
  assert.ok(cuts <= 2, String(cuts));
});
