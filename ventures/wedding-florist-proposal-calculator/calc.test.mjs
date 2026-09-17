import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProposal, DEFAULTS, STEM_LINES, STEM_FIELDS, stemFieldId } from './calc.mjs';

/** DEFAULTS with every stem line emptied, so one line can be tested alone. */
function oneLine({ stemsNeeded, bunchSize, bunchCost, ...rest }) {
  const input = { ...DEFAULTS, ...rest };
  for (let line = 1; line <= STEM_LINES; line += 1) {
    input[`stemsNeeded${line}`] = 0;
    input[`bunchSize${line}`] = 10;
    input[`bunchCost${line}`] = 0;
  }
  input.stemsNeeded1 = stemsNeeded;
  input.bunchSize1 = bunchSize;
  input.bunchCost1 = bunchCost;
  return input;
}

test('a recipe is bought in whole bunches, not in stems', () => {
  // 85 stems of a variety that ships in tens is ten bunches, not 8.5.
  const r = calculateProposal(oneLine({ stemsNeeded: 85, bunchSize: 10, bunchCost: 38, shrinkPercent: 0 }));
  const line = r.lines[0];
  assert.equal(line.bunchesToBuy, 9, '85 stems with no shrink is nine bunches of ten');
  assert.equal(line.stemsPurchased, 90);
  assert.equal(line.lineCost, 9 * 38);
  assert.equal(line.stemsLeftOver, 5);
});

test('the shrink allowance is added to the stem count BEFORE bunches are rounded up', () => {
  // The shortcut this replaces is adding the percentage to the line's cost
  // at the end, which buys a fraction of a bunch. These two cases are the
  // pair that shows it is wrong in BOTH directions, so neither can be
  // dismissed as conservative rounding.

  // Under-buys: 100 stems is exactly ten bunches, and the 5% allowance needs
  // a whole eleventh one. The cost shortcut would quote 10 x $20 x 1.05 =
  // $210 and leave the studio five stems short on the morning.
  const short = calculateProposal(oneLine({ stemsNeeded: 100, bunchSize: 10, bunchCost: 20, shrinkPercent: 5 }));
  assert.equal(short.lines[0].stemsWithShrink, 105);
  assert.equal(short.lines[0].bunchesToBuy, 11);
  assert.equal(short.lines[0].lineCost, 220);

  // Over-buys: 95 stems + 5% is 99.75, which fits inside the ten bunches the
  // recipe already forced. The cost shortcut would quote $210 for flowers
  // that cost $200 — a padded quote resting on a bunch nobody buys.
  const fits = calculateProposal(oneLine({ stemsNeeded: 95, bunchSize: 10, bunchCost: 20, shrinkPercent: 5 }));
  assert.equal(fits.lines[0].stemsWithShrink, 100);
  assert.equal(fits.lines[0].bunchesToBuy, 10);
  assert.equal(fits.lines[0].lineCost, 200);
});

test('a variety sold by the single stem uses bunch size 1 and rounds to nothing', () => {
  const r = calculateProposal(oneLine({ stemsNeeded: 37, bunchSize: 1, bunchCost: 4, shrinkPercent: 0 }));
  const line = r.lines[0];
  assert.equal(line.bunchesToBuy, 37);
  assert.equal(line.stemsPurchased, 37);
  assert.equal(line.lineCost, 148);
  assert.equal(line.lineRoundingGap, 0, 'a single-stem variety has no bunch rounding to recover');
});

test('bunch size 0 is read as 1 rather than dividing by zero', () => {
  // An unused line left at 0/0/0 must not produce NaN, and a florist who
  // types 0 into a row they are not using must not get an error dialog.
  const r = calculateProposal(oneLine({ stemsNeeded: 12, bunchSize: 0, bunchCost: 3, shrinkPercent: 0 }));
  assert.equal(r.lines[0].bunchSize, 1);
  assert.equal(r.lines[0].lineCost, 36);
  assert.ok(Number.isFinite(r.flowerCostActual));
});

test('an unused line contributes no cost, no stems and no rounding gap', () => {
  const r = calculateProposal(DEFAULTS);
  const spare = r.lines.find((l) => l.line === 6);
  assert.equal(spare.used, false);
  assert.equal(spare.lineCost, 0);
  assert.equal(spare.stemsPurchased, 0);
  assert.equal(spare.lineRoundingGap, 0);
});

test('the bunch-rounding gap is what a per-stem sheet would have missed', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(r.flowerCostActual, 804);
  assert.equal(r.flowerCostPerStemBasis, 669);
  assert.equal(r.bunchRoundingGap, 135);
  assert.ok(r.bunchRoundingGap > 0, 'the worked example exists to show a positive gap');
});

test('the markup multiplies the gap, so the revenue miss is larger than the cost miss', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(r.flowerRevenue, 804 * 3.5);
  assert.equal(r.flowerRevenuePerStemBasis, 669 * 3.5);
  // This is the number the page leads with: marking up a cost you never
  // paid under-quotes by the gap TIMES the multiple, not by the gap.
  assert.equal(r.flowerRevenueGap, 135 * 3.5);
  assert.ok(r.flowerRevenueGap > r.bunchRoundingGap);
});

test('markup is applied to what is bought, never to what the recipe calls for', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(
    r.flowerRevenue,
    r.flowerCostActual * DEFAULTS.flowerMarkupMultiple,
    'the quoted flower figure must be built from the purchase cost',
  );
});

test('labour is priced by the hour, with the percentage rule reported for comparison only', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(r.designLabor, 14 * 45);
  assert.equal(r.onSiteCrewHours, (3 + 1.5) * 3);
  assert.equal(r.installLabor, 13.5 * 45);
  assert.equal(r.laborRevenue, 630 + 607.5);
  assert.equal(r.laborByPercentRule, r.flowerRevenue * 0.35);
  assert.ok(r.laborRuleGap > 0, 'the worked example is install-heavy, so the rule under-prices it');
  // And the comparison never moves the total.
  const quiet = calculateProposal({ ...DEFAULTS, laborAsPercentOfFlowers: 0 });
  assert.equal(quiet.proposalTotal, r.proposalTotal);
  assert.equal(quiet.laborByPercentRule, 0);
});

test('the percentage rule over-prices a bouquets-only event, and the gap flips sign', () => {
  // No install at all: hours track stems, which is the case the rule fits.
  const r = calculateProposal({ ...DEFAULTS, setupHours: 0, strikeHours: 0, designHours: 6 });
  assert.equal(r.installLabor, 0);
  assert.equal(r.laborRevenue, 6 * 45);
  assert.ok(r.laborRuleGap < 0, 'a low-labour event should show the rule quoting more than the hours do');
});

test('the subtotal is the four billed components, and the minimum tops it up', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(
    r.proposalSubtotal,
    r.flowerRevenue + r.hardGoodsRevenue + r.laborRevenue + r.deliveryRevenue,
  );
  assert.equal(r.minimumTopUp, 0);
  assert.equal(r.belowMinimum, false);
  assert.equal(r.proposalTotal, r.proposalSubtotal);

  const small = calculateProposal({ ...DEFAULTS, minimumEventRevenue: 6000 });
  assert.equal(small.belowMinimum, true);
  assert.equal(small.minimumTopUp, 6000 - r.proposalSubtotal);
  assert.equal(small.proposalTotal, 6000);
});

test('delivery is mileage plus the flat fee', () => {
  const r = calculateProposal(DEFAULTS);
  assert.equal(r.deliveryRevenue, 46 * 1.25 + 75);
});

test('gross profit subtracts only cash that actually leaves the studio', () => {
  const r = calculateProposal(DEFAULTS);
  // Flowers at purchase cost, hard goods at cost, and crew payouts. The
  // studio's own design hours are not a payout, which is why they are
  // billed revenue here and not a cost.
  assert.equal(r.cashCostTotal, 804 + 260 + 540);
  assert.equal(r.grossProfit, r.proposalTotal - r.cashCostTotal);
  assert.ok(Math.abs(r.grossMarginPercent - 65.9) < 0.1);
  assert.equal(r.belowTargetMargin, false);
});

test('a thin proposal is flagged against the studio target margin', () => {
  const r = calculateProposal({ ...DEFAULTS, flowerMarkupMultiple: 1.2, targetMarginPercent: 55 });
  assert.equal(r.belowTargetMargin, true);
  assert.ok(r.grossMarginPercent < 55);
});

test('the flower cost ratio reports flowers as a share of what the client pays', () => {
  const r = calculateProposal(DEFAULTS);
  assert.ok(Math.abs(r.flowerCostRatioPercent - (804 / r.proposalTotal) * 100) < 1e-9);
});

test('an all-zero proposal reports null ratios rather than dividing by zero', () => {
  const zeroed = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, 0]));
  const r = calculateProposal(zeroed);
  assert.equal(r.proposalTotal, 0);
  assert.equal(r.grossMarginPercent, null);
  assert.equal(r.flowerCostRatioPercent, null);
  assert.equal(r.belowTargetMargin, false, 'a zero proposal is not a thin one');
});

test('every DEFAULTS field is required, and a non-numeric one is named in the error', () => {
  for (const key of Object.keys(DEFAULTS)) {
    assert.throws(
      () => calculateProposal({ ...DEFAULTS, [key]: 'abc' }),
      /must be a number/,
      `${key} accepted a non-number`,
    );
  }
});

test('a negative input is rejected rather than quietly reducing the total', () => {
  assert.throws(() => calculateProposal({ ...DEFAULTS, hardGoodsCost: -1 }), /at least 0/);
  assert.throws(() => calculateProposal({ ...DEFAULTS, stemsNeeded1: -5 }), /at least 0/);
});

test('a percentage above 100 is rejected where it would be meaningless', () => {
  assert.throws(() => calculateProposal({ ...DEFAULTS, shrinkPercent: 101 }), /at most 100/);
  assert.throws(() => calculateProposal({ ...DEFAULTS, targetMarginPercent: 101 }), /at most 100/);
});

test('the stem field helpers agree with the DEFAULTS keys the form is built from', () => {
  for (let line = 1; line <= STEM_LINES; line += 1) {
    for (const field of STEM_FIELDS) {
      assert.ok(stemFieldId(field, line) in DEFAULTS, `${stemFieldId(field, line)} is missing from DEFAULTS`);
    }
  }
});

test('the worked example demonstrates both findings the page is written about', () => {
  const r = calculateProposal(DEFAULTS);
  assert.ok(r.bunchRoundingGap > 0, 'the bunch-rounding finding must fire on the default');
  assert.ok(r.laborRuleGap > 0, 'the labour-rule finding must fire on the default');
  assert.equal(r.belowMinimum, false);
  assert.equal(r.belowTargetMargin, false);
});
