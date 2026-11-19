// Pins the mean-and-variance variance floor (quality round 88: raising it 100x
// left every test green). The floor stops a run of identical values driving the
// cost to -infinity, and must stay small enough that a genuinely quiet segment
// is priced at its own variance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCost } from './engine.mjs';

test('meanvar floor is (sigma * 1e-3)^2 and a quiet segment above it keeps its own variance', () => {
  const sigma = 1;
  // ten identical values, then ten values alternating +-0.01 (variance 1e-4)
  const x = [...Array(10).fill(5), ...Array.from({ length: 10 }, (_, i) => (i % 2 ? 0.01 : -0.01))];
  const cost = makeCost(x, 'meanvar', sigma);
  const expect = (m, v) => m * (Math.log(2 * Math.PI * v) + 1);
  assert.ok(Math.abs(cost(0, 10) - expect(10, 1e-6)) < 1e-9, 'constant run is floored at 1e-6');
  assert.ok(Math.abs(cost(10, 20) - expect(10, 1e-4)) < 1e-9, 'variance 1e-4 is not floored');
});
