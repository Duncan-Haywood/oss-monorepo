import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateBillableWeight, DEFAULT_DIVISOR, DEFAULT_THRESHOLDS } from './calc.mjs';

const box = overrides => calculateBillableWeight({ length: 16, width: 12, height: 10, weight: 4, ...overrides });

test('billable weight is the greater of actual and dimensional, rounded up', () => {
  // 16 x 12 x 10 = 1920 in3; 1920 / 139 = 13.81 lb, above the 4 lb of goods.
  const result = box();
  assert.equal(result.cube, 1920);
  assert.equal(result.billedOn, 'dimensional');
  assert.equal(result.billableWeight, 14);
});

test('a dense package bills on its actual weight and is not rounded down', () => {
  const result = box({ height: 4, weight: 20 });
  assert.equal(result.billedOn, 'actual');
  assert.equal(result.billableWeight, 20);
});

test('billable weight ceilings rather than rounds — a hundredth over bills a whole pound more', () => {
  // The boundary that costs money quietly: 8.01 lb of goods bills as 9 lb.
  const result = box({ height: 2, weight: 8.01 });
  assert.equal(result.billedOn, 'actual');
  assert.equal(result.billableWeight, 9);
});

test('the divisor is an input, and a better one can remove the penalty entirely', () => {
  assert.equal(box({ divisor: 139 }).billedOn, 'dimensional');
  // At a 250 divisor the same carton prices at 7.68 lb -- still dimensional.
  assert.equal(box({ divisor: 250 }).billableWeight, 8);
  // And at 500 the goods win outright.
  assert.equal(box({ divisor: 500 }).billedOn, 'actual');
});

test('DEFAULT_DIVISOR is used when the caller supplies none', () => {
  assert.equal(box({ divisor: undefined }).divisor, DEFAULT_DIVISOR);
});

test('dimension rounding happens before the cube, not after', () => {
  // 12.6 x 12.6 x 12.6 rounds to 13 x 13 x 13 = 2197, not round(2000.376).
  const rounded = calculateBillableWeight({ length: 12.6, width: 12.6, height: 12.6, weight: 1 });
  assert.equal(rounded.cube, 2197);
  assert.equal(rounded.roundedDimensions, true);
  const exact = calculateBillableWeight({ length: 12.6, width: 12.6, height: 12.6, weight: 1, roundDimensions: false });
  assert.ok(Math.abs(exact.cube - 2000.376) < 1e-6);
  assert.equal(exact.roundedDimensions, false);
});

test('longest and second-longest side do not depend on which field a side was typed into', () => {
  const a = calculateBillableWeight({ length: 50, width: 6, height: 31, weight: 10 });
  const b = calculateBillableWeight({ length: 6, width: 31, height: 50, weight: 10 });
  assert.equal(a.longestSide, 50);
  assert.equal(a.secondSide, 31);
  assert.deepEqual([a.longestSide, a.secondSide, a.shortestSide], [b.longestSide, b.secondSide, b.shortestSide]);
  assert.equal(a.girth, b.girth);
});

test('girth is the longest side plus twice each of the other two', () => {
  const result = calculateBillableWeight({ length: 20, width: 10, height: 8, weight: 30 });
  assert.equal(result.girth, 20 + 2 * (10 + 8));
});

test('total billable weight multiplies the per-package round-up, never the shared cube', () => {
  // Each package rounds up on its own, so 3 packages of 13.81 lb bill as
  // 3 x 14 = 42 lb. Re-dividing a tripled cube would under-count by 0.57 lb
  // -- the exact shape of error that makes an estimate disagree with an
  // invoice.
  const result = box({ packages: 3 });
  assert.equal(result.billableWeight, 14);
  assert.equal(result.totalBillableWeight, 42);
  assert.equal(result.totalActualWeight, 12);
});

test('additional handling fires on any one of longest side, second side, or girth', () => {
  const longSide = calculateBillableWeight({ length: 50, width: 6, height: 6, weight: 40 });
  assert.equal(longSide.flags[0].id, 'additional-handling');
  const secondSide = calculateBillableWeight({ length: 40, width: 32, height: 6, weight: 40 });
  assert.equal(secondSide.flags[0].id, 'additional-handling');
  const byGirth = calculateBillableWeight({ length: 40, width: 20, height: 15, weight: 90 });
  assert.equal(byGirth.girth > DEFAULT_THRESHOLDS.additionalHandlingGirth, true);
  assert.equal(byGirth.flags[0].id, 'additional-handling');
});

test('a large package outranks additional handling rather than reporting both', () => {
  // 60 + 2*(30+25) = 170 girth would trip every additional-handling rule too;
  // a visitor needs the one that actually prices, not a list.
  const result = calculateBillableWeight({ length: 50, width: 22, height: 20, weight: 70 });
  assert.equal(result.girth, 50 + 2 * (22 + 20));
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].id, 'large-package');
});

test('a package over the carrier maximum is reported as unshippable rather than merely expensive', () => {
  const result = calculateBillableWeight({ length: 120, width: 20, height: 20, weight: 100 });
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].id, 'over-maximum');
  assert.equal(result.flags[0].severity, 'blocking');
});

test('an ordinary parcel raises no flags at all', () => {
  assert.deepEqual(box().flags, []);
});

test('thresholds are overridable, because they are contract terms and not physics', () => {
  const strict = calculateBillableWeight({ length: 20, width: 10, height: 8, weight: 30, thresholds: { additionalHandlingLongestSide: 12 } });
  assert.equal(strict.flags[0].id, 'additional-handling');
});

test('the lever names the cube ceiling that stops the dimensional penalty', () => {
  const result = box();
  // 4 lb x 139 = 556 in3 is the break-even cube.
  assert.equal(result.lever.direction, 'reduce');
  assert.equal(result.lever.targetCube, 556);
  assert.equal(result.lever.airWeight, 10);
  // 556 / (16 x 12) = 2.90in on the same footprint.
  assert.ok(Math.abs(result.lever.targetHeight - 556 / 192) < 1e-9);
});

test('a package billed on actual weight gets headroom rather than a reduction', () => {
  const result = box({ height: 4, weight: 20 });
  assert.equal(result.lever.direction, 'headroom');
  assert.equal(result.lever.airWeight, 0);
  assert.ok(result.lever.cubeHeadroom > 0);
  assert.ok(result.lever.heightHeadroom > 0);
});

test('invalid input throws rather than returning a plausible-looking number', () => {
  for (const bad of [{ length: 0 }, { width: -1 }, { height: 'wide' }, { weight: 0 }, { divisor: 0 }]) {
    assert.throws(() => box(bad));
  }
});

test('a fractional package count is rejected — you cannot ship half a carton', () => {
  assert.throws(() => box({ packages: 2.5 }), /whole number/);
});

test('values too large to compute safely throw instead of returning Infinity', () => {
  assert.throws(() => box({ length: 1e308, width: 1e308, height: 1e308 }), /too large/);
});
