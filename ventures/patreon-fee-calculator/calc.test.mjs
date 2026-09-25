import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculate,
  payoutGap,
  compareBillingFrequency,
  tierBreakdown,
  processingRate,
  chargeFeeDollars,
  formatPayoutSummary,
  DEFAULTS,
  PLAN_PRESETS,
  BILLING_PRESETS,
  MICRO_THRESHOLD,
  STANDARD_PROCESSING,
  MICRO_PROCESSING,
} from './calc.mjs';

const STANDARD_PLAN = PLAN_PRESETS.find((p) => p.id === 'standard');
const LEGACY_PRO_PLAN = PLAN_PRESETS.find((p) => p.id === 'legacy-pro');

test('processingRate uses the micropayment rate strictly under the threshold, only when microDiscount is true', () => {
  assert.deepEqual(processingRate(MICRO_THRESHOLD - 0.01, true), MICRO_PROCESSING);
  assert.deepEqual(processingRate(MICRO_THRESHOLD, true), STANDARD_PROCESSING);
  assert.deepEqual(processingRate(MICRO_THRESHOLD + 0.01, true), STANDARD_PROCESSING);
  // The Standard plan (microDiscount: false) never gets the discount, even
  // on a charge that would otherwise qualify.
  assert.deepEqual(processingRate(MICRO_THRESHOLD - 0.01, false), STANDARD_PROCESSING);
});

test('chargeFeeDollars applies the right rate to the right charge and plan', () => {
  assert.equal(chargeFeeDollars(1.25, true).toFixed(4), (1.25 * 0.05 + 0.10).toFixed(4));
  assert.equal(chargeFeeDollars(1.25, false).toFixed(4), (1.25 * 0.029 + 0.30).toFixed(4));
  assert.equal(chargeFeeDollars(5, true).toFixed(4), (5 * 0.029 + 0.30).toFixed(4));
});

test('tierBreakdown multiplies patrons by charges per month, not just pledge', () => {
  const monthly = tierBreakdown(100, 5, 1, false);
  assert.equal(monthly.totalCharges, 100);
  assert.equal(monthly.grossRevenue, 500);
  assert.equal(monthly.isMicro, false);

  const perCreation = tierBreakdown(100, 5, 4, false);
  assert.equal(perCreation.totalCharges, 400);
  assert.equal(perCreation.grossRevenue, 2000);
});

test('every plan preset and billing preset has a distinct id', () => {
  assert.deepEqual(PLAN_PRESETS.map((p) => p.id), ['standard', 'legacy-lite', 'legacy-pro', 'legacy-premium']);
  assert.deepEqual(BILLING_PRESETS.map((b) => b.id), ['monthly', 'per-creation']);
});

test('only legacy plans offer the micropayment discount', () => {
  assert.equal(STANDARD_PLAN.microDiscount, false);
  for (const plan of PLAN_PRESETS.filter((p) => p.id !== 'standard')) {
    assert.equal(plan.microDiscount, true, `${plan.id} should offer the legacy micropayment discount`);
  }
});

test('calculate rejects an unknown plan or billing frequency', () => {
  assert.throws(() => calculate({ ...DEFAULTS, planTier: 'ultra' }), /Unknown plan/);
  assert.throws(() => calculate({ ...DEFAULTS, billingFrequency: 'weekly' }), /Unknown billing frequency/);
});

test('calculate on the shipped DEFAULTS (Standard plan) matches hand-verified arithmetic', () => {
  const r = calculate(DEFAULTS);

  assert.equal(r.plan, 'standard');
  assert.equal(r.tier1.grossRevenue, 600);
  assert.equal(r.tier2.grossRevenue, 500);
  assert.equal(r.tier3.grossRevenue, 300);
  assert.equal(r.grossRevenue, 1400);
  assert.equal(r.totalCharges, 330);

  // 200*(3*0.029+0.30) + 100*(5*0.029+0.30) + 30*(10*0.029+0.30) -- none of
  // these tiers is under $3, so the Standard-vs-legacy distinction does not
  // move this particular total (see the compareBillingFrequency tests below
  // for where it does).
  assert.equal(r.processingFees.toFixed(2), '139.60');
  // Standard plan: 10% of $1,400 gross
  assert.equal(r.platformFee.toFixed(2), '140.00');
  assert.equal(r.totalFees.toFixed(2), '279.60');
  assert.equal(r.netPatreonPayout.toFixed(2), '1120.40');
  assert.equal(r.netPayout.toFixed(2), '1120.40');
  assert.equal(r.effectiveTakeRatePct.toFixed(2), '80.03');
});

test('otherMonthlyIncome is added after fees, never run through processing or the platform cut', () => {
  const withOther = calculate({ ...DEFAULTS, otherMonthlyIncome: 200 });
  const without = calculate({ ...DEFAULTS, otherMonthlyIncome: 0 });
  assert.equal((withOther.netPayout - without.netPayout).toFixed(2), '200.00');
  // Fees themselves are unaffected by other income.
  assert.equal(withOther.totalFees.toFixed(2), without.totalFees.toFixed(2));
});

test('per-creation billing multiplies charges by postsPerMonth', () => {
  const monthly = calculate({ ...DEFAULTS, billingFrequency: 'monthly' });
  const perCreation = calculate({ ...DEFAULTS, billingFrequency: 'per-creation', postsPerMonth: 4 });

  assert.equal(monthly.totalCharges, 330);
  assert.equal(perCreation.totalCharges, 330 * 4);
  // Same per-charge pledges as DEFAULTS ($3/$5/$10) stay above the $3
  // threshold either way in this fixture, and the Standard plan never gets
  // the micropayment discount regardless -- the flip is demonstrated
  // separately in compareBillingFrequency, where the per-post amount is
  // derived from a monthly total instead of typed directly, and where the
  // plan is a legacy one.
  assert.equal(perCreation.tier1.isMicro, false);
});

test('payoutGap says how many more tier-1 patrons close a shortfall', () => {
  const r = calculate(DEFAULTS);
  const gap = payoutGap(DEFAULTS.targetMonthlyPayout, r.netPayout, r.tier1NetPerPatron);
  assert.equal(gap.meetsTarget, false);
  assert.equal(gap.gap.toFixed(2), '879.60');
  assert.equal(gap.additionalTier1PatronsNeeded, Math.ceil(879.6 / r.tier1NetPerPatron));
});

test('payoutGap reports the goal met with zero patrons needed once payout clears target', () => {
  const gap = payoutGap(1000, 1120.40, 2.313);
  assert.equal(gap.meetsTarget, true);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalTier1PatronsNeeded, 0);
});

// The page's central claim: the same total monthly pledge, billed as one
// monthly charge versus split across a month's posts, produces a different
// fee bill for identical gross revenue -- because splitting the charge pays
// the fixed part of the processing fee every time, on every plan.
test('compareBillingFrequency on the Standard plan shows per-creation costing much more (no micropayment discount)', () => {
  const cmp = compareBillingFrequency(5, 4, 100, STANDARD_PLAN);

  assert.equal(cmp.monthly.grossRevenue, 500);
  assert.equal(cmp.perCreation.grossRevenue, 500);

  assert.equal(cmp.monthly.pledge, 5);
  assert.equal(cmp.perCreation.pledge, 1.25);
  // Standard plan: never micro, even on a $1.25 charge.
  assert.equal(cmp.monthly.isMicro, false);
  assert.equal(cmp.perCreation.isMicro, false);

  assert.equal(cmp.monthly.totalFees.toFixed(2), '94.50');
  assert.equal(cmp.perCreation.totalFees.toFixed(2), '184.50');
  assert.equal(cmp.feeDifference.toFixed(2), '90.00');

  assert.equal(cmp.monthly.netPayout.toFixed(2), '405.50');
  assert.equal(cmp.perCreation.netPayout.toFixed(2), '315.50');
});

// A legacy plan's micropayment discount is a genuine partial mitigant: its
// lower fixed fee ($0.10 vs $0.30) on a small charge means a legacy creator
// pays less than a Standard-plan creator for the exact same per-creation
// split, even though the legacy plan's micro *percentage* (5%) is higher
// than the standard percentage (2.9%).
test('compareBillingFrequency on a legacy plan shows a smaller (but still real) per-creation penalty', () => {
  const cmp = compareBillingFrequency(5, 4, 100, LEGACY_PRO_PLAN);

  assert.equal(cmp.monthly.isMicro, false);
  assert.equal(cmp.perCreation.isMicro, true);

  assert.equal(cmp.monthly.totalFees.toFixed(2), '84.50');
  assert.equal(cmp.perCreation.totalFees.toFixed(2), '105.00');
  assert.equal(cmp.feeDifference.toFixed(2), '20.50');

  assert.equal(cmp.monthly.netPayout.toFixed(2), '415.50');
  assert.equal(cmp.perCreation.netPayout.toFixed(2), '395.00');

  // The legacy plan's per-creation fee bill ($105.00) is well below the
  // Standard plan's ($184.50) for the identical pledge and post count --
  // the micropayment discount is a real, if partial, mitigant.
  const standardCmp = compareBillingFrequency(5, 4, 100, STANDARD_PLAN);
  assert.ok(cmp.perCreation.totalFees < standardCmp.perCreation.totalFees);
});

test('compareBillingFrequency rejects a zero post count rather than dividing by zero', () => {
  assert.throws(() => compareBillingFrequency(5, 0, 100, STANDARD_PLAN), /Posts per month/);
});

test('formatPayoutSummary carries the plan-verification disclaimer and the headline number', () => {
  const r = calculate(DEFAULTS);
  const summary = formatPayoutSummary(r);
  assert.match(summary, /\$1,120\.40/);
  assert.match(summary, /verify every rate against your own current patreon creator dashboard/i);
});
