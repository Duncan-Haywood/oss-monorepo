import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, planComparison, DEFAULTS, PLAN_KEYS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.grossPledgeRevenue, 545);
  close(r.processingFee, 46.825);
  close(r.platformFee, 54.5);
  close(r.netMembershipIncome, 443.675);
  close(r.takeHome, 443.675);
  close(r.effectiveTakeRatePct, 81.4083);
  assert.equal(r.plan, 'standard');
  assert.equal(r.platformFeeRatePct, 10);
  assert.equal(r.microTierPatrons, 120);
  assert.equal(r.microTierRevenue, 120);
});

test('Legacy Lite (5%) keeps more take-home than Standard (10%) on an identical month', () => {
  const standard = calculate(DEFAULTS);
  const legacyLite = calculate({ ...DEFAULTS, plan: 'legacyLite' });
  close(legacyLite.platformFee, 27.25);
  close(legacyLite.takeHome, 470.925);
  assert.ok(legacyLite.takeHome > standard.takeHome);
  // Processing is identical across plans -- only the platform fee changes --
  // so the whole gap is exactly the rate difference applied to gross revenue.
  close(legacyLite.takeHome - standard.takeHome, standard.grossPledgeRevenue * 0.05);
});

test('Legacy Premium (12%) keeps less take-home than Standard (10%) on an identical month', () => {
  const standard = calculate(DEFAULTS);
  const legacyPremium = calculate({ ...DEFAULTS, plan: 'legacyPremium' });
  close(legacyPremium.platformFee, 65.4);
  close(legacyPremium.takeHome, 432.775);
  assert.ok(legacyPremium.takeHome < standard.takeHome);
});

test('a $1 tier is charged the worse micropayment processing rate, not a smaller standard one', () => {
  const oneDollarOnly = { ...DEFAULTS, tier2Patrons: 0, tier3Patrons: 0 };
  const r = calculate(oneDollarOnly);
  // 120 patrons at $1: micropayment rate is 5% + $0.10 per charge, so
  // 120 * (1 * 0.05 + 0.10) = 120 * 0.15 = $18 processing on $120 gross --
  // 15% of gross, far worse than the 2.9% + $0.30 headline rate.
  close(r.grossPledgeRevenue, 120);
  close(r.processingFee, 18);
});

test('crossing the $3 threshold by one cent can make take-home go DOWN even though the pledge went up', () => {
  // The cliff this calculator exists to surface: at exactly $3.00 a charge
  // is billed at the micropayment rate (5% + $0.10 = $0.25 on $3.00); one
  // cent higher, at $3.01, it is billed at the standard rate
  // (2.9% + $0.30 = $0.38729 on $3.01) -- a bigger fee on almost the same
  // gross, so the fee alone eats more than the extra cent of pledge.
  const atThreshold = { tier1Patrons: 1, tier1Amount: 3, tier2Patrons: 0, tier2Amount: 0, tier3Patrons: 0, tier3Amount: 0, otherMonthlyIncome: 0, plan: 'standard' };
  const justAbove = { ...atThreshold, tier1Amount: 3.01 };
  const a = calculate(atThreshold);
  const b = calculate(justAbove);
  close(a.processingFee, 0.25);
  close(b.processingFee, 0.38729);
  close(a.takeHome, 2.45);
  close(b.takeHome, 2.32171);
  assert.ok(b.takeHome < a.takeHome, 'take-home should drop when a pledge crosses just above the $3 threshold');
});

test('a pledge just at $3.00 and one just above it price the rest of the month identically otherwise', () => {
  const atThreshold = calculate({ ...DEFAULTS, tier1Amount: 3 });
  const justAbove = calculate({ ...DEFAULTS, tier1Amount: 3.01 });
  assert.equal(atThreshold.microTierPatrons, DEFAULTS.tier1Patrons);
  assert.equal(justAbove.microTierPatrons, 0, 'a $3.01 pledge must not be counted as a micropayment tier');
});

test('otherMonthlyIncome passes straight through to take-home, uncomputed', () => {
  const r = calculate({ ...DEFAULTS, otherMonthlyIncome: 250 });
  close(r.takeHome, 443.675 + 250);
});

test('zero patrons in every tier still prices other income without dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, tier1Patrons: 0, tier2Patrons: 0, tier3Patrons: 0 });
  assert.equal(r.grossPledgeRevenue, 0);
  assert.equal(r.processingFee, 0);
  assert.equal(r.platformFee, 0);
  assert.equal(r.effectiveTakeRatePct, null, 'cannot express a take rate of zero gross revenue');
  close(r.takeHome, 0);
});

test('rejects a negative patron count', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier1Patrons: -1 }), /tier 1 patron count/i);
});

test('rejects a negative pledge amount', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier2Amount: -1 }), /tier 2 pledge amount/i);
});

test('rejects a negative other income figure', () => {
  assert.throws(() => calculate({ ...DEFAULTS, otherMonthlyIncome: -5 }), /other monthly income/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier1Patrons: 'a lot' }), /tier 1 patron count/i);
});

test('rejects a plan that is not one of the four known plans', () => {
  assert.throws(() => calculate({ ...DEFAULTS, plan: 'gold' }), /plan must be one of/i);
});

test('PLAN_KEYS lists exactly the four plans Patreon offers', () => {
  assert.deepEqual(PLAN_KEYS, ['standard', 'legacyLite', 'legacyPro', 'legacyPremium']);
});

test('planComparison prices the same patron month under all four plans', () => {
  const c = planComparison(DEFAULTS);
  assert.equal(c.currentPlan, 'standard');
  close(c.byPlan.standard.takeHome, 443.675);
  close(c.byPlan.legacyLite.takeHome, 470.925);
  close(c.byPlan.legacyPro.takeHome, 454.575);
  close(c.byPlan.legacyPremium.takeHome, 432.775);
  assert.equal(c.byPlan.standard.platformFeeRatePct, 10);
  assert.equal(c.byPlan.legacyLite.platformFeeRatePct, 5);
});

test('planComparison reports zero loss when already on Standard', () => {
  const c = planComparison(DEFAULTS);
  assert.equal(c.lossIfMovedToStandard, 0);
});

test('planComparison reports what a legacy creator would lose per month by reverting to Standard', () => {
  const c = planComparison({ ...DEFAULTS, plan: 'legacyLite' });
  // Processing is identical either way, so the loss is exactly the platform
  // fee gap: 10% - 5% of gross pledge revenue.
  close(c.lossIfMovedToStandard, 27.25);
  close(c.lossIfMovedToStandard, c.byPlan.legacyLite.takeHome - c.byPlan.standard.takeHome);
});

test('planComparison loss is never negative even if a plan somehow paid worse than Standard', () => {
  // legacyPremium (12%) is worse than Standard (10%), so a creator on
  // legacyPremium loses nothing by "reverting" -- there is nothing to lose.
  const c = planComparison({ ...DEFAULTS, plan: 'legacyPremium' });
  assert.equal(c.lossIfMovedToStandard, 0);
});
