import { test } from 'node:test';
import assert from 'node:assert/strict';

import { comparePricing, formatComparisonSummary, COMPARISON_DISCLAIMER, INPUT_FIELDS, VENUE_MODELS } from './calc.mjs';

test('INPUT_FIELDS lists every field comparePricing reads', () => {
  assert.deepEqual(INPUT_FIELDS, [
    'ratePerSession', 'packageSessions', 'packagePrice', 'noShowRate', 'makeupOwed',
    'sessionMinutes', 'venueModel', 'venuePercent', 'venueFlatFee', 'targetTakeHomeHourly',
  ]);
});

test('VENUE_MODELS lists the three cost structures', () => {
  assert.deepEqual(VENUE_MODELS, ['none', 'percent', 'flat']);
});

// The dilution case shared with tutor-package-pricing-calculator: a package
// discounted deeper than the no-show rate, with a makeup owed on every miss,
// pays worse per hour than pay-per-session even though its revenue is fully
// guaranteed -- with no venue cost in play, so this isolates that mechanic.
test('a package discounted below the no-show rate, with makeup owed, pays a worse net hourly than pay-per-session', () => {
  const result = comparePricing({
    ratePerSession: 60,
    packageSessions: 10,
    packagePrice: 450, // $45/session equivalent = 25% discount
    noShowRate: 10, // discount (25%) exceeds no-show rate (10%)
    makeupOwed: true,
    sessionMinutes: 60,
    venueModel: 'none',
  });
  assert.equal(result.discountPercent, 25);
  assert.equal(result.single.gross, 540);
  assert.equal(result.single.net, 540);
  assert.equal(result.single.hours, 9);
  assert.equal(result.single.effectiveHourly, 60);
  assert.equal(result.package.net, 450);
  assert.equal(result.package.hours, 10);
  assert.equal(result.package.effectiveHourly, 45);
  assert.equal(result.hourlyDelta, -15);
  assert.ok(result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
});

// The mechanic tutoring has no equivalent of: a flat per-session facility
// fee does not shrink with the trainer's own discount, so it takes a bigger
// percentage bite out of the package's discounted rate than out of full
// price. Zero no-show rate isolates this from the dilution finding above.
test('a flat venue fee erodes the discounted package rate more, in percentage terms, than the full rate', () => {
  const result = comparePricing({
    ratePerSession: 75,
    packageSessions: 10,
    packagePrice: 580, // $58/session equivalent
    noShowRate: 0,
    makeupOwed: true,
    sessionMinutes: 60,
    venueModel: 'flat',
    venueFlatFee: 12,
  });
  assert.equal(result.perSessionEquivalent, 58);
  assert.equal(result.discountPercent, 22.67);
  assert.equal(result.single.gross, 750);
  assert.equal(result.single.net, 630); // 750 - 12*10
  assert.equal(result.single.effectiveHourly, 63);
  assert.equal(result.package.gross, 580);
  assert.equal(result.package.net, 460); // 580 - 12*10
  assert.equal(result.package.effectiveHourly, 46);
  assert.ok(!result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'), 'zero no-show rate must not trigger the dilution finding');
  const flag = result.findings.find((f) => f.id === 'flat-fee-erodes-package-more');
  assert.ok(flag, 'expected a flat-fee-erodes-package-more finding');
  assert.match(flag.detail, /\$12\.00/);
});

test('a flat fee that is the same or smaller share of the package rate does not trigger the erosion finding', () => {
  // No discount at all: perSessionEquivalent === ratePerSession, so the fee
  // is exactly the same percentage of both -- nothing to flag.
  const result = comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 600, noShowRate: 0,
    venueModel: 'flat', venueFlatFee: 10,
  });
  assert.equal(result.discountPercent, 0);
  assert.ok(!result.findings.some((f) => f.id === 'flat-fee-erodes-package-more'));
});

// A percentage revenue-share takes the same cut of both pricing models, so
// it scales the comparison down without changing which one wins -- the
// finding this file's own docstring says a percentage cut does NOT trigger.
test('a percentage venue cut scales both models down proportionally and never triggers the flat-fee finding', () => {
  const result = comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 600, noShowRate: 15,
    makeupOwed: true, sessionMinutes: 60, venueModel: 'percent', venuePercent: 40,
  });
  // sessionsAttended = 8.5, single gross = 510, net = 510*0.6 = 306
  assert.equal(result.single.gross, 510);
  assert.equal(result.single.net, 306);
  assert.equal(result.single.hours, 8.5);
  // package: gross 600, net 600*0.6=360, hours 10 (makeup owed)
  assert.equal(result.package.net, 360);
  assert.equal(result.package.hours, 10);
  assert.ok(!result.findings.some((f) => f.id === 'flat-fee-erodes-package-more'));
  assert.ok(result.revenueDelta > 0, 'the un-discounted package still guarantees more net revenue than an 85%-attended single-session run');
});

test('a package net hourly below the target is flagged, with the price (net of a flat venue fee) that would clear it', () => {
  const result = comparePricing({
    ratePerSession: 75, packageSessions: 10, packagePrice: 580, noShowRate: 0,
    makeupOwed: true, sessionMinutes: 60, venueModel: 'flat', venueFlatFee: 12,
    targetTakeHomeHourly: 50,
  });
  assert.equal(result.package.effectiveHourly, 46);
  const flag = result.findings.find((f) => f.id === 'below-target-hourly');
  assert.ok(flag, 'expected a below-target-hourly finding');
  // target(50) * hours(10) + flat(12) * sessionsWorked(10) = 500 + 120 = 620
  assert.equal(result.minPackagePriceForTarget, 620);
  assert.match(flag.detail, /\$620\.00/);
});

test('the minimum package price for a target also accounts for a percentage venue cut', () => {
  const result = comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 300, noShowRate: 0,
    venueModel: 'percent', venuePercent: 40, targetTakeHomeHourly: 50,
  });
  // target(50) * hours(10) / (1 - 0.4) = 500 / 0.6 = 833.33
  assert.equal(result.minPackagePriceForTarget, 833.33);
});

// When no makeup is owed, a package no-show frees the same hour a
// pay-per-session no-show would, and (under a flat fee) the venue is not
// charging for a session that never happened either.
test('with no makeup owed, package hours and flat-fee charges match pay-per-session exactly', () => {
  const result = comparePricing({
    ratePerSession: 50, packageSessions: 8, packagePrice: 350, noShowRate: 20,
    makeupOwed: false, sessionMinutes: 45, venueModel: 'flat', venueFlatFee: 5,
  });
  assert.equal(result.single.hours, result.package.hours);
  assert.ok(result.findings.some((f) => f.id === 'no-makeup-owed'));
  assert.ok(!result.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
});

test('rejects a no-show rate above 100%', () => {
  assert.throws(() => comparePricing({
    ratePerSession: 60, packageSessions: 5, packagePrice: 300, noShowRate: 150,
  }), /100/);
});

test('rejects a venue percentage of 100% or more', () => {
  assert.throws(() => comparePricing({
    ratePerSession: 60, packageSessions: 5, packagePrice: 300, venueModel: 'percent', venuePercent: 100,
  }), /less than 100/);
});

test('rejects a zero or missing single-session rate, package sessions, or package price', () => {
  assert.throws(() => comparePricing({ packageSessions: 5, packagePrice: 300 }), /Single-session rate/);
  assert.throws(() => comparePricing({ ratePerSession: 60, packagePrice: 300 }), /Sessions per package/);
  assert.throws(() => comparePricing({ ratePerSession: 60, packageSessions: 5 }), /Package price/);
});

test('rejects a negative input', () => {
  assert.throws(() => comparePricing({
    ratePerSession: -5, packageSessions: 5, packagePrice: 300,
  }), /non-negative/);
});

test('an unrecognised venueModel falls back to none rather than throwing', () => {
  const result = comparePricing({
    ratePerSession: 60, packageSessions: 5, packagePrice: 300, venueModel: 'nonsense',
  });
  assert.equal(result.venueModel, 'none');
  assert.equal(result.single.net, result.single.gross);
});

test('formatComparisonSummary renders both models, the venue cut, the deltas, and the disclaimer', () => {
  const result = comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 450, noShowRate: 10,
    venueModel: 'percent', venuePercent: 30,
  });
  const text = formatComparisonSummary(result);
  assert.match(text, /Pay-per-session:/);
  assert.match(text, /Package:/);
  assert.match(text, /Venue cut: 30% of every session's revenue/);
  assert.match(text, /Net revenue difference/);
  assert.match(text, /Net effective hourly difference/);
  assert.ok(text.includes(COMPARISON_DISCLAIMER));
});

test('formatComparisonSummary names a flat fee and a no-venue-cost run distinctly', () => {
  const flat = formatComparisonSummary(comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 450, venueModel: 'flat', venueFlatFee: 8,
  }));
  assert.match(flat, /Venue cut: \$8\.00 flat facility fee per session worked/);
  const none = formatComparisonSummary(comparePricing({
    ratePerSession: 60, packageSessions: 10, packagePrice: 450,
  }));
  assert.match(none, /Venue cut: none entered/);
});
