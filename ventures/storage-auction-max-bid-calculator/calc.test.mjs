import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMaxBid, DEFAULTS } from './calc.mjs';

test('retail value is cut twice before it becomes net resale revenue', () => {
  const r = calculateMaxBid(DEFAULTS);
  // $4000 retail x 35% recovery = $1400, then x (1 - 15% resale fee) = $1190.
  assert.equal(r.grossResaleValue, 1400);
  assert.equal(r.netResaleRevenue, 1190);
});

test('the cash cost stack is dump + labor + transport + holding, independent of bid', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.equal(r.dumpCost, 90 * 3);
  assert.equal(r.laborCost, 10 * 20);
  assert.equal(r.holdingCost, 60 * 2);
  assert.equal(r.nonBidCashCost, 270 + 200 + 60 + 120);
});

test('the buyer premium is added on top of the hammer bid, not included in it', () => {
  const r = calculateMaxBid({ ...DEFAULTS, plannedBid: 100, buyerPremiumPercent: 12 });
  assert.ok(Math.abs(r.plannedPurchaseCost - 112) < 1e-9);
  assert.ok(Math.abs(r.plannedPremiumCost - 12) < 1e-9);
});

test('the break-even bid is the hammer price at which profit is exactly zero', () => {
  const r = calculateMaxBid(DEFAULTS);
  // (netResaleRevenue - nonBidCashCost) / (1 + premium) = (1190 - 650) / 1.12
  assert.ok(Math.abs(r.breakEvenBid - 540 / 1.12) < 1e-9);

  const check = calculateMaxBid({ ...DEFAULTS, plannedBid: r.breakEvenBid, targetMarginPercent: 0 });
  assert.ok(Math.abs(check.plannedProfit) < 1e-6, 'bidding exactly the break-even figure should net ~$0 profit');
});

test('the max bid at the target margin leaves exactly that much margin on the table', () => {
  const r = calculateMaxBid(DEFAULTS);
  const atMax = calculateMaxBid({ ...DEFAULTS, plannedBid: r.maxBidAtTargetMargin });
  assert.ok(Math.abs(atMax.plannedMarginPercent - DEFAULTS.targetMarginPercent) < 1e-6);
});

test('a higher target margin always demands a lower or equal max bid', () => {
  const loose = calculateMaxBid({ ...DEFAULTS, targetMarginPercent: 10 });
  const strict = calculateMaxBid({ ...DEFAULTS, targetMarginPercent: 60 });
  assert.ok(strict.maxBidAtTargetMargin < loose.maxBidAtTargetMargin);
});

test('the naive percent-of-value rule ignores the cost stack and can bid past break-even', () => {
  const r = calculateMaxBid(DEFAULTS);
  // 20% of $4000 retail = $800, which is well past the $482.14 break-even --
  // the naive rule would bid you into a guaranteed loss before you've paid
  // for a single dump run.
  assert.equal(r.naiveRuleBid, 800);
  assert.equal(r.naiveRuleExceedsBreakEven, true);
  assert.ok(r.naiveRuleGap > 0, 'the worked example exists to show the naive rule overshoots');
});

test('the naive rule can also under-bid a genuinely cheap-to-clean unit', () => {
  // Low cost stack, high recovery: the real math supports a bid well above
  // a flat 5% of retail value.
  const r = calculateMaxBid({
    ...DEFAULTS,
    estimatedRetailValue: 10000,
    recoveryRatePercent: 60,
    dumpFeePerLoad: 0,
    estimatedDumpLoads: 0,
    transportCost: 20,
    cleanoutPersonHours: 2,
    holdingCostPerMonth: 0,
    naiveRuleBidPercent: 5,
  });
  assert.ok(r.naiveRuleBid < r.maxBidAtTargetMargin, 'a clean, high-recovery unit should support more than the flat rule allows');
});

test('a unit with a heavy cost stack relative to its value has no profitable bid', () => {
  const r = calculateMaxBid({
    ...DEFAULTS,
    estimatedRetailValue: 500,
    recoveryRatePercent: 20,
    dumpFeePerLoad: 90,
    estimatedDumpLoads: 6,
    transportCost: 150,
  });
  assert.equal(r.noProfitablePrice, true);
  assert.equal(r.breakEvenBid, 0);
  assert.equal(r.targetUnreachable, true);
  assert.equal(r.maxBidAtTargetMargin, 0);
});

test('planned bid above the target-margin ceiling is flagged, below it is not', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.equal(r.plannedExceedsTarget, false, 'the worked example plans a safe bid');

  const over = calculateMaxBid({ ...DEFAULTS, plannedBid: r.maxBidAtTargetMargin + 1 });
  assert.equal(over.plannedExceedsTarget, true);
});

test('planned bid above break-even is flagged as a guaranteed loss', () => {
  const r = calculateMaxBid(DEFAULTS);
  const overBreakEven = calculateMaxBid({ ...DEFAULTS, plannedBid: r.breakEvenBid + 1 });
  assert.equal(overBreakEven.plannedExceedsBreakEven, true);
  assert.ok(overBreakEven.plannedProfit < 0);
});

test('cleanout wall-clock hours divide person-hours across the crew', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.equal(r.elapsedCleanoutHours, 10 / 2);
  assert.equal(r.depositAtRisk, false, 'the worked example finishes well inside the 48-hour window');
});

test('a small crew against a short window is flagged as a deposit risk', () => {
  const r = calculateMaxBid({ ...DEFAULTS, cleanoutPersonHours: 20, crewSize: 1, cleanoutWindowHours: 12 });
  assert.equal(r.elapsedCleanoutHours, 20);
  assert.equal(r.depositAtRisk, true);
});

test('a solo bidder (crew size 1) divides by exactly one, not by zero', () => {
  const r = calculateMaxBid({ ...DEFAULTS, crewSize: 1 });
  assert.equal(r.elapsedCleanoutHours, DEFAULTS.cleanoutPersonHours);
});

test('the worked example is healthy: a safe planned bid, no deposit risk, a real profitable ceiling', () => {
  const r = calculateMaxBid(DEFAULTS);
  assert.equal(r.healthy, true);
  assert.equal(r.noProfitablePrice, false);
  assert.equal(r.depositAtRisk, false);
  assert.equal(r.plannedExceedsTarget, false);
});

test('the deposit amount passes through unchanged, for display only', () => {
  const r = calculateMaxBid({ ...DEFAULTS, cleanoutDepositAmount: 250 });
  assert.equal(r.cleanoutDepositAmount, 250);
});

test('every DEFAULTS field is required, and a non-numeric one is named in the error', () => {
  for (const key of Object.keys(DEFAULTS)) {
    assert.throws(
      () => calculateMaxBid({ ...DEFAULTS, [key]: 'abc' }),
      /must be a number/,
      `${key} accepted a non-number`,
    );
  }
});

test('a negative input is rejected rather than quietly producing a negative cost', () => {
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, estimatedRetailValue: -1 }), /at least 0/);
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, dumpFeePerLoad: -1 }), /at least 0/);
});

test('a percentage above 100 is rejected where it would be meaningless', () => {
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, recoveryRatePercent: 101 }), /at most 100/);
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, resaleFeePercent: 101 }), /at most 100/);
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, targetMarginPercent: 101 }), /at most 100/);
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, naiveRuleBidPercent: 101 }), /at most 100/);
});

test('crew size must be at least one person', () => {
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, crewSize: 0 }), /at least 1/);
});

test('the cleanout window must be greater than zero hours', () => {
  assert.throws(() => calculateMaxBid({ ...DEFAULTS, cleanoutWindowHours: 0 }), /greater than zero/);
});
