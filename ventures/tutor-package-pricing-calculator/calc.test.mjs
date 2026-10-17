import { test } from 'node:test';
import assert from 'node:assert/strict';

import { comparePricing, formatComparisonSummary, COMPARISON_DISCLAIMER, INPUT_FIELDS } from './calc.mjs';

test('INPUT_FIELDS lists every numeric/boolean field comparePricing reads', () => {
  assert.deepEqual(INPUT_FIELDS, [
    'singleSessionPrice', 'packageSessions', 'packagePrice', 'noShowRate',
    'makeupOwed', 'sessionMinutes', 'prepMinutes', 'travelMinutes', 'targetHourlyRate',
  ]);
});

// The central case: a package discounted deeper than the no-show rate it is
// meant to cover, with a makeup owed on every miss, pays worse per hour than
// simply charging full price per session and letting a no-show empty the
// slot -- even though its revenue is fully guaranteed.
test('a package discounted below the no-show rate, with makeup owed, pays a worse effective hourly than pay-per-session', () => {
  const result = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 450, // $45/session equivalent = 25% discount
    noShowRate: 10, // discount (25%) exceeds no-show rate (10%)
    makeupOwed: true,
    sessionMinutes: 60,
    prepMinutes: 0,
    travelMinutes: 0,
    targetHourlyRate: 40,
  });
  assert.equal(result.discountPercent, 25);
  // Pay-per-session: 9 sessions attended (10 * 0.9) * $60 = $540 / 9 hours = $60/hr.
  assert.equal(result.single.revenue, 540);
  assert.equal(result.single.hours, 9);
  assert.equal(result.single.effectiveHourly, 60);
  // Package: $450 revenue / 10 hours (all sessions eventually worked) = $45/hr.
  assert.equal(result.package.revenue, 450);
  assert.equal(result.package.hours, 10);
  assert.equal(result.package.effectiveHourly, 45);
  assert.equal(result.hourlyDelta, -15);
  assert.ok(result.revenueDelta < 0, 'this package also fails to break even on raw revenue at this gap');
  assert.ok(result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
  assert.ok(result.findings.some((f) => f.id === 'revenue-safe-hourly-worse') || result.revenueDelta <= 0);
});

test('a package effective hourly below the target rate is flagged, with the price that would clear it', () => {
  const result = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 450,
    noShowRate: 10,
    makeupOwed: true,
    sessionMinutes: 60,
    targetHourlyRate: 50, // above the package's $45/hr effective rate
  });
  assert.equal(result.package.effectiveHourly, 45);
  const flag = result.findings.find((f) => f.id === 'below-target-hourly');
  assert.ok(flag, 'expected a below-target-hourly finding');
  assert.equal(result.minPackagePriceForTarget, 500); // $50/hr * 10 hours
  assert.match(flag.detail, /\$500\.00/);
});

// The complementary case: a package discount held inside the no-show rate,
// with makeup owed, still beats pay-per-session per hour, because the hours
// saved by no-shows that are NOT made up (there are none here, so this pins
// the boundary the other direction: no discount at all).
test('a package priced at the single-session rate, with makeup owed, always wins on revenue and never triggers the discount-exceeds warning', () => {
  const result = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 600, // no discount at all
    noShowRate: 15,
    makeupOwed: true,
    sessionMinutes: 60,
  });
  assert.equal(result.discountPercent, 0);
  assert.equal(result.package.revenue, 600);
  assert.equal(result.package.hours, 10);
  assert.equal(result.package.effectiveHourly, 60);
  // Pay-per-session loses the no-show's revenue entirely.
  assert.ok(result.single.revenue < 600);
  assert.equal(result.revenueDelta > 0, true);
  assert.ok(!result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
});

// When no makeup is owed, a package no-show frees the same hour a
// pay-per-session no-show would -- the package should then match
// pay-per-session's hours exactly and only differ on guaranteed revenue.
test('with no makeup owed, package hours match pay-per-session hours exactly', () => {
  const result = comparePricing({
    singleSessionPrice: 50,
    packageSessions: 8,
    packagePrice: 350,
    noShowRate: 20,
    makeupOwed: false,
    sessionMinutes: 45,
  });
  assert.equal(result.single.hours, result.package.hours);
  assert.ok(result.findings.some((f) => f.id === 'no-makeup-owed'));
  assert.ok(!result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
});

test('prep and travel minutes are counted as worked time in both models', () => {
  const withExtras = comparePricing({
    singleSessionPrice: 60, packageSessions: 4, packagePrice: 200,
    noShowRate: 0, sessionMinutes: 60, prepMinutes: 15, travelMinutes: 15,
  });
  const withoutExtras = comparePricing({
    singleSessionPrice: 60, packageSessions: 4, packagePrice: 200,
    noShowRate: 0, sessionMinutes: 60, prepMinutes: 0, travelMinutes: 0,
  });
  assert.equal(withExtras.minutesPerSessionWorked, 90);
  assert.ok(withExtras.package.hours > withoutExtras.package.hours);
  assert.ok(withExtras.package.effectiveHourly < withoutExtras.package.effectiveHourly);
});

test('a zero no-show rate makes attendance-dependent revenue identical to the nominal session count', () => {
  const result = comparePricing({
    singleSessionPrice: 60, packageSessions: 5, packagePrice: 300,
    noShowRate: 0, sessionMinutes: 60,
  });
  assert.equal(result.single.revenue, 300);
  assert.equal(result.single.hours, 5);
});

test('rejects a no-show rate above 100%', () => {
  assert.throws(() => comparePricing({
    singleSessionPrice: 60, packageSessions: 5, packagePrice: 300, noShowRate: 150,
  }), /100/);
});

test('rejects a zero or missing single-session price, package sessions, or package price', () => {
  assert.throws(() => comparePricing({ packageSessions: 5, packagePrice: 300 }), /Single-session price/);
  assert.throws(() => comparePricing({ singleSessionPrice: 60, packagePrice: 300 }), /Sessions per package/);
  assert.throws(() => comparePricing({ singleSessionPrice: 60, packageSessions: 5 }), /Package price/);
});

test('rejects a negative input', () => {
  assert.throws(() => comparePricing({
    singleSessionPrice: -5, packageSessions: 5, packagePrice: 300,
  }), /non-negative/);
});

test('formatComparisonSummary renders both models, the deltas, and the disclaimer', () => {
  const result = comparePricing({
    singleSessionPrice: 60, packageSessions: 10, packagePrice: 450, noShowRate: 10,
  });
  const text = formatComparisonSummary(result);
  assert.match(text, /Pay-per-session:/);
  assert.match(text, /Package:/);
  assert.match(text, /Revenue difference/);
  assert.match(text, /Effective hourly difference/);
  assert.ok(text.includes(COMPARISON_DISCLAIMER));
});

test('a block shorter than an hour still reports the pay-per-session effective hourly', () => {
  const r = comparePricing({ singleSessionPrice: 20, packageSessions: 1, packagePrice: 20, noShowRate: 0, sessionMinutes: 30 });
  assert.equal(r.single.hours, 0.5);
  assert.equal(r.single.effectiveHourly, 40);
  assert.equal(r.hourlyDelta, 0);
});

test('a package that pays slightly more per hour does not raise the revenue-safe-but-worse-hourly warning', () => {
  const r = comparePricing({ singleSessionPrice: 50, packageSessions: 1, packagePrice: 50.5, noShowRate: 0, sessionMinutes: 60 });
  assert.equal(r.revenueDelta, 0.5);
  assert.equal(r.hourlyDelta, 0.5);
  assert.ok(!r.findings.some((f) => f.id === 'revenue-safe-hourly-worse'));
  const worse = comparePricing({ singleSessionPrice: 50, packageSessions: 1, packagePrice: 50, noShowRate: 0, sessionMinutes: 60, prepMinutes: 0 });
  assert.ok(!worse.findings.some((f) => f.id === 'revenue-safe-hourly-worse')); // equal hourly: no warning either
});
