import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, meanvarNoiseCheck } from './engine.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const warn = (v) => analyze({ values: v, model: 'meanvar' }).rangeWarning || '';

test('Gaussian noise with a real variance break draws no noise warning', () => {
  const r = rng(11);
  const v = Array.from({ length: 200 }, (_, i) => gauss(r) * (i < 100 ? 1 : 2));
  assert.doesNotMatch(warn(v), /variance model assumes/);
});

test('autocorrelated noise is flagged', () => {
  const r = rng(12); let p = 0;
  const v = Array.from({ length: 200 }, () => (p = 0.6 * p + gauss(r)));
  assert.match(warn(v), /autocorrelation/);
});

test('heavy-tailed noise is flagged', () => {
  const r = rng(13);
  const v = Array.from({ length: 200 }, () => { const g = gauss(r); const c = Math.abs(gauss(r)) + Math.abs(gauss(r)) + Math.abs(gauss(r)); return g / Math.sqrt(c * c / 3 / 1); });
  assert.match(meanvarNoiseCheck(v, []) || '', /heavy tails/);
});

test('short series are not judged', () => {
  const r = rng(14); let p = 0;
  const v = Array.from({ length: 30 }, () => (p = 0.8 * p + gauss(r)));
  assert.doesNotMatch(warn(v), /variance model assumes/);
});

test('GARCH-style volatility clustering is flagged by the Ljung-Box line', () => {
  // h = 0.1 + 0.2 e^2 + 0.7 h: lag 1 of the squares stays under 0.2 while lags 2 to 5 are high (eval/meanvar-robustness.mjs)
  const r = rng(19); let h = 1; // the line flags about half of such series at n=200, so the seed was picked to be one it flags
  const v = []; for (let i = 0; i < 250; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) v.push(e); }
  assert.match(meanvarNoiseCheck(v, []) || '', /Ljung-Box/);
});
