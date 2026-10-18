import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, payoutGap, plusPlan, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.tier1Revenue, 239.6);
  close(r.tier2Revenue, 99.9);
  close(r.tier3Revenue, 74.97);
  close(r.grossSubRevenue, 414.47);
  close(r.subPayout, 207.235);
  close(r.bitsPayout, 80);
  close(r.totalPayout, 287.235);
  close(r.tier1PayoutPerSub, 2.995);
  close(r.effectiveSubTakeRatePct, 50);
});

test('Partner Plus (70%) keeps more of the identical sub month than the standard 50% split', () => {
  const standard = calculate(DEFAULTS);
  const partnerPlus = calculate({ ...DEFAULTS, splitPct: 70 });
  close(partnerPlus.subPayout, 290.129);
  assert.ok(partnerPlus.totalPayout > standard.totalPayout);
  // The extra 20 points of split apply only to sub revenue, not Bits or
  // other income, which is why the gap is exactly 20% of grossSubRevenue.
  close(partnerPlus.totalPayout - standard.totalPayout, standard.grossSubRevenue * 0.2);
});

test('Bits payout is flat at one cent each regardless of the revenue split', () => {
  const low = calculate({ ...DEFAULTS, splitPct: 50, bitsCheered: 10000 });
  const high = calculate({ ...DEFAULTS, splitPct: 70, bitsCheered: 10000 });
  close(low.bitsPayout, 100);
  close(high.bitsPayout, 100);
});

test('other monthly income passes straight through to the total, uncomputed', () => {
  const r = calculate({ ...DEFAULTS, otherMonthlyIncome: 250 });
  close(r.totalPayout, 287.235 + 250);
});

test('zero subs of every tier still prices Bits and other income without dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, tier1Subs: 0, tier2Subs: 0, tier3Subs: 0 });
  assert.equal(r.grossSubRevenue, 0);
  assert.equal(r.subPayout, 0);
  assert.equal(r.effectiveSubTakeRatePct, null, 'cannot express a take rate of zero sub revenue');
  close(r.totalPayout, r.bitsPayout);
});

test('a higher Tier 1 price raises payout per Tier 1 sub proportionally', () => {
  const r = calculate({ ...DEFAULTS, tier1Price: 7.99 });
  close(r.tier1PayoutPerSub, 3.995);
});

test('rejects a negative sub count', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier1Subs: -1 }), /tier 1 subs/i);
});

test('rejects a negative price', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier2Price: -1 }), /tier 2 price/i);
});

test('rejects a split percentage above 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, splitPct: 101 }), /revenue split percentage/i);
});

test('rejects a negative Bits count', () => {
  assert.throws(() => calculate({ ...DEFAULTS, bitsCheered: -1 }), /bits cheered/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, tier1Subs: 'a lot' }), /tier 1 subs/i);
});

test('payoutGap reports the shortfall and Tier 1 subs needed to close it', () => {
  const r = calculate(DEFAULTS);
  const gap = payoutGap(DEFAULTS.targetMonthlyPayout, r.totalPayout, r.tier1PayoutPerSub);
  close(gap.gap, 1212.765);
  assert.equal(gap.additionalTier1SubsNeeded, 405);
  assert.equal(gap.meetsTarget, false);
});

test('payoutGap reports goal met with zero additional subs needed once payout clears the target', () => {
  const gap = payoutGap(200, 250, 2.995);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalTier1SubsNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('payoutGap cannot compute additional subs needed when payout per sub is zero or negative', () => {
  const gap = payoutGap(1000, 0, 0);
  assert.equal(gap.additionalTier1SubsNeeded, null);
  assert.equal(gap.meetsTarget, false);
});

test('plusPlan() counts 1/2/6 points per tier and reports the next level', () => {
  const p = plusPlan(DEFAULTS); // 40 + 20 + 18 = 78 points
  assert.equal(p.points, 78);
  assert.equal(p.splitPct, 50);
  assert.equal(p.next.splitPct, 60);
  assert.equal(p.next.pointsNeeded, 22);
  assert.equal(p.next.tier3SubsNeeded, 4);
  close(p.next.monthlyUplift, 414.47 * 0.1);
  assert.deepEqual(p.scenarios.map((s) => s.reached), [true, false, false]);
  close(p.scenarios[2].totalPayout, 414.47 * 0.7 + 80);
});

test('plusPlan() at 300 points is at the top level and has no next step', () => {
  const p = plusPlan({ ...DEFAULTS, pointTier1Subs: 300, pointTier2Subs: 0, pointTier3Subs: 0 });
  assert.equal(p.splitPct, 70);
  assert.equal(p.next, null);
  const mid = plusPlan({ ...DEFAULTS, pointTier1Subs: 100, pointTier2Subs: 0, pointTier3Subs: 0 });
  assert.equal(mid.splitPct, 60);
  assert.equal(mid.next.pointsNeeded, 200);
});

test('plusPlan() rejects negative point counts', () => {
  assert.throws(() => plusPlan({ ...DEFAULTS, pointTier1Subs: -1 }), /Tier 1/);
});
