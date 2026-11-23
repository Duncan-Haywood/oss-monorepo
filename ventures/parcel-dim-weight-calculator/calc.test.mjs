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

test('length plus girth is the longest side plus twice each of the other two', () => {
  const result = calculateBillableWeight({ length: 20, width: 10, height: 8, weight: 30 });
  assert.equal(result.lengthPlusGirth, 20 + 2 * (10 + 8));
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
  assert.equal(byGirth.lengthPlusGirth > DEFAULT_THRESHOLDS.additionalHandlingGirth, true);
  assert.equal(byGirth.flags[0].id, 'additional-handling');
});

test('a large package outranks additional handling rather than reporting both', () => {
  // 60 + 2*(30+25) = 170 girth would trip every additional-handling rule too;
  // a visitor needs the one that actually prices, not a list.
  const result = calculateBillableWeight({ length: 50, width: 22, height: 20, weight: 70 });
  assert.equal(result.lengthPlusGirth, 50 + 2 * (22 + 20));
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

// Added in quality round 94 (2026-11-22): carrier rules the earlier tests did
// not pin down, each one a seeded mutant that used to survive.

test('a side over 96 inches is a large package even when length plus girth is under 130', () => {
  // UPS Large Package / FedEx Oversize: length + girth over 130 in OR longest
  // side over 96 in. 97 x 8 x 8 has length + girth 129, so only the length rule fires.
  const result = calculateBillableWeight({ length: 97, width: 8, height: 8, weight: 20 });
  assert.equal(result.lengthPlusGirth, 129);
  assert.equal(result.flags[0].id, 'large-package');
  assert.match(result.flags[0].text, /Longest side 97″ is over 96″/);
  assert.equal(calculateBillableWeight({ length: 96, width: 8, height: 8, weight: 20 }).flags[0].id, 'additional-handling');
});

test('the large-package text does not claim the minimum is above a billable weight that is already higher', () => {
  const result = calculateBillableWeight({ length: 30, width: 30, height: 30, weight: 10 });
  assert.equal(result.billableWeight, 195);
  assert.equal(result.flags[0].id, 'large-package');
  assert.ok(!/well above/.test(result.flags[0].text));
  assert.match(result.flags[0].text, /90 lb/);
});

test('dimensions round to the nearest inch, not up: 12.4 is measured as 12', () => {
  const result = calculateBillableWeight({ length: 12.4, width: 12.4, height: 12.4, weight: 1 });
  assert.equal(result.cube, 1728);
  assert.equal(result.billableWeight, 13);
  // and a half inch rounds up, as the carriers' nearest-whole-inch rule does
  assert.equal(calculateBillableWeight({ length: 12.5, width: 12.5, height: 12.5, weight: 1 }).cube, 2197);
});

test('surcharge thresholds are strictly "over": exactly 130 in length plus girth is not a large package', () => {
  const result = calculateBillableWeight({ length: 50, width: 20, height: 20, weight: 30 });
  assert.equal(result.lengthPlusGirth, 130);
  assert.equal(result.flags[0].id, 'additional-handling');
});

test('the second-longest side alone trips additional handling', () => {
  // 32 x 31 x 1: longest 32 (under 48), length + girth 96 (under 105), second side 31 (over 30).
  const result = calculateBillableWeight({ length: 32, width: 31, height: 1, weight: 5 });
  assert.equal(result.lengthPlusGirth, 96);
  assert.equal(result.flags[0].id, 'additional-handling');
});

test('air weight is billed pounds minus the goods rounded up, so it is always whole', () => {
  const result = box({ weight: 3.2 });
  assert.equal(result.billableWeight, 14);
  assert.equal(result.lever.airWeight, 10);
});

// Red team 2026-11-22: guards for mutants that escaped the suite above.
test('the ground maximum is strictly "over": 108 in longest side and 165 in length plus girth still ship as parcels', () => {
  const id = (l, w, h) => calculateBillableWeight({ length: l, width: w, height: h, weight: 100 }).flags[0]?.id;
  assert.equal(id(108, 5, 5), 'large-package');
  assert.equal(id(109, 5, 5), 'over-maximum');
  assert.equal(id(60, 27, 25.5), 'over-maximum'); // 25.5 measures as 26: 60 + 2 x (27 + 26) = 166
  assert.equal(id(60, 27, 25), 'large-package'); // 60 + 2 x (27 + 25) = 164
  assert.equal(id(61, 26, 26), 'large-package'); // exactly 165
});

test('the lever gives the height change itself, in both directions', () => {
  const reduce = box();
  assert.ok(Math.abs(reduce.lever.heightReduction - (10 - 556 / 192)) < 1e-9);
  const headroom = box({ height: 4, weight: 20 });
  assert.ok(Math.abs(headroom.lever.heightHeadroom - (20 * 139 / 192 - 4)) < 1e-9);
});

test('a break-even height too large to represent is reported as none, not Infinity', () => {
  const result = calculateBillableWeight({ length: 10, width: 10, height: 10, weight: 1e300, divisor: 1e300 });
  assert.equal(result.lever.targetHeight, null);
  assert.equal(result.lever.heightHeadroom, null);
});

test('roundedDimensions is set when any one side was rounded', () => {
  assert.equal(box({ length: 16.4 }).roundedDimensions, true);
  assert.equal(box({ width: 12.4 }).roundedDimensions, true);
  assert.equal(box({ height: 10.4 }).roundedDimensions, true);
  assert.equal(box().roundedDimensions, false);
  assert.equal(box({ width: 12.4, roundDimensions: false }).roundedDimensions, false);
});

// Real defect 2026-11-22: the page called L + 2(W + H) "girth". UPS and FedEx define girth as 2 x width + 2 x height
// (the strap around the two shorter sides) and write the 105/130/165 in limits as "length plus girth", so a shipper who
// measured the strap-around girth read a number that disagreed with the page.
test('girth is the strap around the two shorter sides; the thresholds use length plus girth', () => {
  const result = calculateBillableWeight({ length: 20, width: 10, height: 8, weight: 30 });
  assert.equal(result.girth, 2 * (10 + 8));
  assert.equal(result.lengthPlusGirth, 20 + 2 * (10 + 8));
  const large = calculateBillableWeight({ length: 50, width: 22, height: 20, weight: 30 });
  assert.match(large.flags[0].text, /^Length plus girth 134″ is over 130″/);
  const over = calculateBillableWeight({ length: 60, width: 27, height: 26, weight: 30 });
  assert.match(over.flags[0].text, /length plus girth 166″ exceeds/);
});

// Red team 2026-11-23: each surcharge rule was tested only well past its limit,
// so `>` widened to `>=` on the 48″ longest side passed; and the cube lever's
// own number (returned to API and tool callers) was never pinned.
test('additional handling starts past the limit, not at it', () => {
  const at = calculateBillableWeight({ length: DEFAULT_THRESHOLDS.additionalHandlingLongestSide, width: 6, height: 6, weight: 10 });
  assert.equal(at.flags.some((f) => f.id === 'additional-handling'), false, 'exactly 48″ is not over 48″');
  const past = calculateBillableWeight({ length: DEFAULT_THRESHOLDS.additionalHandlingLongestSide + 0.5, width: 6, height: 6, weight: 10 });
  assert.equal(past.flags.some((f) => f.id === 'additional-handling'), true);
});

test('the reduce lever reports the cube to cut, and it lands on the break-even cube', () => {
  const { lever, cube } = box();
  assert.equal(lever.direction, 'reduce');
  assert.equal(lever.targetCube, 4 * DEFAULT_DIVISOR);
  assert.equal(lever.cubeReduction, 1920 - 556);
  assert.equal(cube - lever.cubeReduction, lever.targetCube);
});

// Red team 2026-11-23, real defect: both weights round up to the next pound, so
// 13.81 lb dimensional on 13.7 lb of goods bills 14 lb either way. It was
// reported as billed on dimensional weight with "0 lb of it is air", and the
// lever asked for a smaller box that would not lower the bill by a cent.
test('a dimensional weight that rounds to the same pound bills on actual weight', () => {
  const r = box({ weight: 13.7 }); // 1920 / 139 = 13.81
  assert.equal(r.billableWeight, 14);
  assert.equal(r.billedOn, 'actual');
  assert.equal(r.lever.direction, 'headroom');
  // Any cube up to 14 x 139 = 1946 still bills 14 lb.
  assert.equal(r.lever.targetCube, 14 * DEFAULT_DIVISOR);
  assert.equal(r.lever.cubeHeadroom, 14 * DEFAULT_DIVISOR - 1920);
  assert.ok(r.lever.heightHeadroom > 0);
});

test('the break-even cube is the billed pound, so a fractional actual weight is not undersold', () => {
  // 4.2 lb of goods bills 5 lb; any box up to 5 x 139 = 695 in3 bills the same 5 lb.
  const r = box({ weight: 4.2 });
  assert.equal(r.billedOn, 'dimensional');
  assert.equal(r.lever.targetCube, 5 * DEFAULT_DIVISOR);
  const atTarget = calculateBillableWeight({ length: 16, width: 12, height: r.lever.targetHeight, weight: 4.2, roundDimensions: false });
  assert.equal(atTarget.billableWeight, 5);
  assert.equal(atTarget.billedOn, 'actual');
});

test('every size limit is "over", so a side or girth exactly on the limit is not flagged (red team 2026-11-23)', () => {
  // 30 x 30 x 1: second side exactly 30 in, length plus girth 92 in.
  assert.deepEqual(calculateBillableWeight({ length: 30, width: 30, height: 1, weight: 5 }).flags, []);
  // 98 x 8 x 8: length plus girth exactly 130 in, so the large-package
  // reason is the 98 in longest side, not a girth that is "over 130".
  const result = calculateBillableWeight({ length: 98, width: 8, height: 8, weight: 20 });
  assert.equal(result.flags[0].id, 'large-package');
  assert.match(result.flags[0].text, /^Longest side 98″ is over 96″/);
});

test('a side under half an inch never rounds to a zero side or a zero cube (red team 2026-11-23)', () => {
  // A 0.4 in mailer passed validation, then rounded to a 0 in side: cube 0,
  // "12 x 10 x 0 in" on the page. A tape measure in whole inches reads it as 1.
  const result = calculateBillableWeight({ length: 12, width: 10, height: 0.4, weight: 0.3 });
  assert.equal(result.height, 1);
  assert.equal(result.shortestSide, 1);
  assert.equal(result.cube, 120);
  // Unrounded, the side is kept as typed.
  assert.equal(calculateBillableWeight({ length: 12, width: 10, height: 0.4, weight: 0.3, roundDimensions: false }).height, 0.4);
});
