import test from 'node:test';
import assert from 'node:assert/strict';
import { planCashflow, csvRow, CSV_FIELDS } from './calc.mjs';

// The scenario the page ships with, and the one every figure on the
// payment-terms guide page is derived from.
const DEFAULTS = {
  invoice: 10000,
  materials: 2500,
  weeklyBurn: 700,
  terms: 30,
  retention: 10,
  delay: 14,
  retentionRelease: 60,
  startingCash: 5000,
};

test('includes retention and delay in the cash requirement', () => {
  const result = planCashflow(DEFAULTS);
  assert.equal(result.collectable, 9000);
  assert.equal(result.expectedCashDay, 44);
  assert.equal(result.cashNeeded, 6900);
  assert.equal(result.gap, 1900);
  assert.equal(result.retentionAmount, 1000);
  assert.equal(result.retentionCashDay, 104);
});

test('reports a surplus when current cash covers the scenario', () => {
  const result = planCashflow({ invoice: 5000, materials: 500, weeklyBurn: 350, terms: 14, startingCash: 2000 });
  assert.equal(result.gap, 0);
  assert.equal(result.surplus, 800);
  assert.equal(result.safe, true);
});

// The three fields added on 2026-08-31 all default to the neutral value, so a
// visitor who ignores them gets exactly the plan the tool always gave. This is
// what keeps the guide page's worked figures true.
test('the new levers are neutral at their defaults', () => {
  const before = planCashflow(DEFAULTS);
  const after = planCashflow({ ...DEFAULTS, deposit: 0, supplierTerms: 0, apr: 0 });
  assert.equal(after.cashNeeded, before.cashNeeded);
  assert.equal(after.gap, before.gap);
  assert.equal(after.bridgeCost, 0);
});

test('supplier terms only help once the client pays before the supplier does', () => {
  // Paid day 44. A net-30 supply account still puts the $2,500 out first, so
  // the requirement is unchanged -- it only shortens the borrowing window.
  const net30 = planCashflow({ ...DEFAULTS, supplierTerms: 30 });
  assert.equal(net30.materialsBeforePayment, true);
  assert.equal(net30.cashNeeded, 6900);
  assert.equal(net30.runsShortDay, 30, 'the shortfall starts on the supplier due date, not before it');

  // A net-45 account is due after the client pays, so the materials never need
  // bridging at all and the gap closes.
  const net45 = planCashflow({ ...DEFAULTS, supplierTerms: 45 });
  assert.equal(net45.materialsBeforePayment, false);
  assert.equal(net45.cashNeeded, 4400);
  assert.equal(net45.gap, 0);
  assert.equal(net45.runsShortDay, null);
});

test('a deposit counts as cash in hand and comes off the payment on terms', () => {
  const result = planCashflow({ ...DEFAULTS, deposit: 25 });
  assert.equal(result.depositAmount, 2500);
  assert.equal(result.available, 7500);
  assert.equal(result.paymentOnTerms, 6500, '$9,000 collectable less the $2,500 already paid');
  assert.equal(result.gap, 0);
});

test('a deposit cannot exceed what the contract releases before retention', () => {
  // 95% asked against 10% retention: clamped to the 90% that can actually
  // arrive, so the payment still due never goes negative.
  const result = planCashflow({ ...DEFAULTS, deposit: 95 });
  assert.equal(result.deposit, 90);
  assert.equal(result.paymentOnTerms, 0);
});

test('bridge cost accrues on the daily shortfall, not on the peak gap', () => {
  const result = planCashflow({ ...DEFAULTS, apr: 12 });
  assert.equal(result.runsShortDay, 26, '$5,000 of cash covers $2,500 materials plus 25 days of $100/day burn');
  assert.equal(result.shortDays, 18);

  // Charging the $1,900 peak for all 18 days would be $11.25. The shortfall
  // ramps from zero, so the honest number is close to half that.
  const peakForWholeWindow = 1900 * 0.12 * (18 / 365);
  assert.ok(result.bridgeCost > 0, 'a real gap on a real rate costs something');
  assert.ok(
    result.bridgeCost < peakForWholeWindow * 0.75,
    `expected the ramp to be priced, got ${result.bridgeCost} against a peak-basis ${peakForWholeWindow}`,
  );
});

test('no rate means no financing cost, however large the gap', () => {
  const result = planCashflow({ ...DEFAULTS, apr: 0 });
  assert.equal(result.gap, 1900);
  assert.equal(result.bridgeCost, 0);
});

test('absorbable delay is the slip the scenario survives past the buffer', () => {
  // Covered with $600 to spare at $100/day of burn.
  const covered = planCashflow({ ...DEFAULTS, deposit: 25 });
  assert.equal(covered.surplus, 600);
  assert.equal(covered.absorbableDelay, 6);

  // Already short: there is no slip left to absorb.
  assert.equal(planCashflow(DEFAULTS).absorbableDelay, 0);

  // Nothing burns while you wait, so waiting is free and nothing bounds it.
  const noBurn = planCashflow({ ...DEFAULTS, weeklyBurn: 0 });
  assert.equal(noBurn.absorbableDelay, null);
});

test('a supplier invoice falling due one day later is caught as a cliff', () => {
  // Due day 45, paid day 44: covered. One day of slip pulls the $2,500 in
  // before the money arrives, so there is no slack at all despite the surplus.
  const result = planCashflow({ ...DEFAULTS, supplierTerms: 45 });
  assert.equal(result.surplus, 600);
  assert.equal(result.absorbableDelay, 0);
});

test('csv row stays spreadsheet-safe and ordered', () => {
  const result = planCashflow({ ...DEFAULTS, retentionRelease: 0 });
  const row = csvRow(result).split(',');
  assert.equal(row.length, CSV_FIELDS.length, 'one column per declared field');
  assert.equal(row[CSV_FIELDS.indexOf('invoice')], '10000');
  assert.equal(row[CSV_FIELDS.indexOf('cashNeeded')], '6900');
  assert.equal(row[CSV_FIELDS.indexOf('gap')], '1900');
  assert.equal(row[CSV_FIELDS.indexOf('retentionCashDay')], '44');
  // A null day must not become the string "null" in a spreadsheet cell.
  assert.equal(csvRow(planCashflow({ ...DEFAULTS, supplierTerms: 45 })).split(',')[CSV_FIELDS.indexOf('runsShortDay')], '');
});

test('nonsense input clamps instead of throwing', () => {
  const result = planCashflow({ invoice: -100, materials: 'x', weeklyBurn: null, terms: -5, retention: 400, apr: 9999 });
  assert.equal(result.invoice, 0);
  assert.equal(result.materials, 0);
  assert.equal(result.weeklyBurn, 0);
  assert.equal(result.terms, 0);
  assert.equal(result.retention, 99);
  assert.equal(result.apr, 200);
  assert.equal(result.safe, true);
});
