import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const t3 = (r) => { let c = 0; for (let i = 0; i < 3; i++) { const g = gauss(r); c += g * g; } return gauss(r) / Math.sqrt(c / 3) / Math.sqrt(3); };

test('robust cost: far fewer false alarms than the Gaussian cost on t3 noise with no change', () => {
  let plain = 0, robust = 0;
  for (let k = 0; k < 20; k++) {
    const r = rng(1000 + k);
    const values = Array.from({ length: 200 }, () => t3(r));
    if (analyze({ values, model: 'meanvar' }).pelt.changepoints.length) plain++;
    if (analyze({ values, model: 'meanvar', robust: true }).pelt.changepoints.length) robust++;
  }
  assert.ok(robust <= 4, `robust false alarms ${robust}`);
  assert.ok(plain >= robust + 5, `plain ${plain} vs robust ${robust}`);
});

test('robust cost still finds a clear sd break', () => {
  const r = rng(7);
  const values = Array.from({ length: 200 }, (_, i) => (i < 100 ? 1 : 4) * gauss(r));
  const cps = analyze({ values, model: 'meanvar', robust: true }).pelt.changepoints;
  assert.equal(cps.length, 1);
  assert.ok(Math.abs(cps[0].index - 100) <= 6);
});

test('robust is for meanvar only', () => {
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5, 6], model: 'mean', robust: true }), /meanvar/);
});
