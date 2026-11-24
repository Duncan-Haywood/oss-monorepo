import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-agency-lines.mjs';
import { posthoc } from './eval/turns-agency-lines-posthoc.mjs';

// README "A short-phase rule for composites, third make: an agency's lines" (2026-11-24, pre-registered; K2a fails,
// nothing ships).
test('agency make: P3 beats the shipped composite rule but trails the advance-picked single line, so nothing ships', async () => {
  const o = await run();
  assert.equal(o.primary.shipped.F.toFixed(3), '0.708');
  assert.equal(o.primary.P3.F.toFixed(3), '0.755');
  assert.equal(o.primary.sel.toFixed(3), '0.857');
  assert.equal(o.primary.best.toFixed(3), '0.948');
  assert.deepEqual(o.verdict, { K1: true, K2: false, K2a: false, K3: true, K4: true, K5: true });
  assert.equal(o.ships, false);
  assert.equal(o.shop.P3.F.toFixed(3), '0.974'); // the shop guard reproduces the earlier rounds
  assert.equal(o.saas.P3.F.toFixed(3), '0.915');
});

test('post hoc: the smooth, late headcount line takes 70% of the weight; without it P3 dates 0.924', () => {
  const p = posthoc();
  assert.equal(p.weights[3].toFixed(3), '0.702');
  assert.equal(p.timingMedian, 2);
  assert.equal(p.F.noHead.toFixed(3), '0.924');
  assert.equal(p.F.equal.toFixed(3), '0.865');
});
