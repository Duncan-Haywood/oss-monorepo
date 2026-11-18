import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';

// Synthetic AR(1) noise, rho 0.5, unit marginal sd (eval/ramp-ar1.mjs, 2026-11-08).
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function series(kind, seed, n = 300, t0 = 120, L = 24, H = 8, rho = 0.5) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  let e = g();
  return Array.from({ length: n }, (_, i) => {
    e = rho * e + Math.sqrt(1 - rho * rho) * g();
    return e + (kind === 'null' ? 0 : i < t0 ? 0 : i >= t0 + L ? H : H * (i - t0) / L);
  });
}

test('rho 0.5 noise alone: plain analysis cuts it into many steps, --ar1 does not', () => {
  let plain = 0, ar1 = 0;
  for (let s = 1; s <= 5; s++) {
    plain += analyze({ values: series('null', s * 7919) }).pelt.changepoints.length;
    ar1 += analyze({ values: series('null', s * 7919), ar1: true }).pelt.changepoints.length;
  }
  assert.ok(plain / 5 > 5, `plain cuts per series ${plain / 5}`);
  assert.ok(ar1 / 5 < 1, `ar1 cuts per series ${ar1 / 5}`);
});

test('a 24-point ramp in rho 0.5 noise is reported as one ramp on the truth span with --ar1', () => {
  let hit = 0;
  for (let s = 1; s <= 10; s++) {
    const rs = analyze({ values: series('ramp', s * 7919 + 24), ar1: true }).ramps || [];
    if (rs.length === 1 && rs[0].startIndex <= 147 && rs[0].endIndex >= 117) hit++;
  }
  assert.ok(hit >= 7, `${hit} of 10`);
});
