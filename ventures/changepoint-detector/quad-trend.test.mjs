import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from './engine.mjs';

// Invented series, seeded. --trend quad removes a curve (slope plus curvature) under the steps.
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

test('quad: a curve with one step keeps the step and reports the curvature', () => {
  let found = 0;
  for (let k = 0; k < 20; k++) {
    const v = Array.from({ length: 240 }, (_, t) => 0.001 * t * t + 0.02 * t + (t >= 120 ? 6 : 0) + gauss());
    const r = analyze({ values: v, trend: 'quad' });
    assert.equal(r.trend.curved, true);
    assert.ok(Math.abs(r.trend.curvaturePerPoint2 - 0.001) < 0.0003);
    if (r.pelt.changepoints.some((c) => Math.abs(c.index - 120) <= 5)) found++;
  }
  assert.ok(found >= 19);
});

test('quad: a straight line is reported as not curved (at most 2 of 20 invented)', () => {
  let curved = 0;
  for (let k = 0; k < 20; k++) {
    const v = Array.from({ length: 240 }, (_, t) => 0.05 * t + gauss());
    if (analyze({ values: v, trend: 'quad' }).trend.curved) curved++;
  }
  assert.ok(curved <= 2);
});

test('quad: counts refuse it', () => {
  assert.throws(() => analyze({ values: Array.from({ length: 60 }, () => 5), model: 'poisson', trend: 'quad' }), /growth/);
});
