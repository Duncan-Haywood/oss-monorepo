import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, seasonalAdjust } from './engine.mjs';

const f = [1.3, 1.0, 0.7, 1.0];
const level = (t) => (t < 60 ? 100 : 200);

test('multiplicative season recovers the factors and leaves one clean step', () => {
  const values = Array.from({ length: 120 }, (_, t) => level(t) * f[t % 4]);
  const { adjusted, profile } = seasonalAdjust(values, 4, { multiplicative: true });
  profile.forEach((v, i) => assert.ok(Math.abs(v - f[i]) < 0.02, `factor ${i}: ${v}`));
  assert.ok(Math.abs(adjusted[10] - 100) < 3 && Math.abs(adjusted[100] - 200) < 3);
  const a = analyze({ values, period: 4, seasonMode: 'multiplicative' });
  assert.equal(a.pelt.changepoints.length, 1);
  assert.equal(a.seasonal.multiplicative, true);
});

test('multiplicative season refuses non-positive values, drift and the trend model', () => {
  const v = Array.from({ length: 24 }, (_, t) => 10 + (t % 4));
  assert.throws(() => seasonalAdjust([...v.slice(1), 0], 4, { multiplicative: true }), /positive/);
  assert.throws(() => seasonalAdjust(v, 4, { multiplicative: true, drift: true }), /drift/);
  assert.throws(() => analyze({ values: v, period: 4, model: 'trend', seasonMode: 'multiplicative' }), /trend model/);
});
