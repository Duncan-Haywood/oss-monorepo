import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, bootstrapPenalty, penaltyValue } from './engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const ar1 = (seed, n) => { const r = rng(seed); let p = 0; return Array.from({ length: n + 50 }, () => (p = 0.5 * p + gauss(r))).slice(50).map((v) => v / Math.sqrt(4 / 3)); };

test('the bootstrap penalty never drops below BIC and is repeatable', () => {
  const r = rng(3); const x = Array.from({ length: 150 }, () => gauss(r));
  const a = bootstrapPenalty(x), b = bootstrapPenalty(x);
  assert.equal(a, b);
  assert.ok(a >= penaltyValue('bic', 150, 'meanvar'));
});

test('autocorrelated noise raises the penalty and cuts false alarms', () => {
  let plain = 0, boot = 0;
  for (let k = 0; k < 10; k++) {
    const x = ar1(900 + k, 200);
    if (analyze({ values: x, model: 'meanvar' }).pelt.changepoints.length) plain++;
    if (analyze({ values: x, model: 'meanvar', bootstrap: true }).pelt.changepoints.length) boot++;
  }
  assert.ok(boot < plain, `plain ${plain}, bootstrap ${boot}`);
});

test('a clear variance break survives the bootstrap penalty', () => {
  const r = rng(21); const x = Array.from({ length: 200 }, (_, i) => gauss(r) * (i < 100 ? 1 : 3));
  const cps = analyze({ values: x, model: 'meanvar', bootstrap: true }).pelt.changepoints;
  assert.equal(cps.length, 1);
  assert.ok(Math.abs(cps[0].index - 100) <= 10);
});

test('the bootstrap option is meanvar-only', () => {
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6, 7, 8], model: 'mean', bootstrap: true }), /meanvar/);
});
