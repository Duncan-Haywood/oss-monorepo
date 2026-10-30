import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { residualLag1, whiteNoise } from './eval/residual-lag1.mjs';

// README "A cycle check that does not use rho: residual lag-1 does not work". Negative result.
const load = (f) => readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);

test('residual lag-1 after the default fit is the same for Nile (a documented step) and treering (38 false steps)', () => {
  const nile = residualLag1(load('nile')), tree = residualLag1(load('treering'));
  assert.equal(nile.steps, 1);
  assert.equal(tree.steps, 38);
  assert.ok(Math.abs(nile.resid - tree.resid) < 0.03, `${nile.resid} vs ${tree.resid}`);
});

test('white noise leaves a residual lag-1 near zero (n=100, 20 seeds)', () => {
  const m = Array.from({ length: 20 }, (_, i) => residualLag1(whiteNoise(100, i + 1)).resid).reduce((a, b) => a + b) / 20;
  assert.ok(Math.abs(m) < 0.08, String(m));
});
