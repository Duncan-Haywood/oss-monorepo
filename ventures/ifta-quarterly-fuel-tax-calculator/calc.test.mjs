import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROW_COUNT,
  ROW_FIELDS,
  GLOBAL_INPUT_IDS,
  PLAUSIBLE_MPG,
  round2,
  fleetMileage,
  jurisdictionLine,
  interestOnRow,
  calculateReturn,
} from './calc.mjs';

/**
 * The worked example the page opens with: a two-truck carrier based in
 * Illinois running a Midwest lane for one quarter. The rates are illustrative
 * — real ones come from the quarter's official IFTA rate sheet — but the shape
 * is the one that matters: two surcharge jurisdictions, one jurisdiction the
 * carrier fuels heavily in and runs few miles through, and one it runs through
 * without buying a drop.
 */
const EXAMPLE_ROWS = [
  { jurisdiction: 'IL', totalMiles: '8400', taxableMiles: '', taxPaidGallons: '1420', taxRate: '0.627', surchargeRate: '' },
  { jurisdiction: 'IN', totalMiles: '6150', taxableMiles: '', taxPaidGallons: '380', taxRate: '0.34', surchargeRate: '0.62' },
  { jurisdiction: 'KY', totalMiles: '4820', taxableMiles: '', taxPaidGallons: '910', taxRate: '0.216', surchargeRate: '0.102' },
  { jurisdiction: 'OH', totalMiles: '7310', taxableMiles: '', taxPaidGallons: '1180', taxRate: '0.47', surchargeRate: '' },
  { jurisdiction: 'MI', totalMiles: '2640', taxableMiles: '', taxPaidGallons: '0', taxRate: '0.313', surchargeRate: '' },
];

const example = (overrides = {}) => calculateReturn({
  rows: EXAMPLE_ROWS,
  interestAnnualPercent: '0',
  monthsLate: '0',
  ...overrides,
});

test('round2 rounds half away from zero in both directions', () => {
  assert.equal(round2(0.125), 0.13);
  assert.equal(round2(-0.125), -0.13);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-1.005), -1.01);
  assert.equal(round2(2.4), 2.4);
});

test('fleet MPG is fleet-wide and carried to two decimals', () => {
  // 29,320 / 3,890 = 7.5372..., and the return carries 7.54.
  assert.equal(fleetMileage(29320, 3890), 7.54);
  assert.equal(fleetMileage(100, 0), null, 'no gallons means no MPG');
});

test('the worked example produces the figures the pages quote', () => {
  const r = example();
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.totalMiles, 29320);
  assert.equal(r.totalGallons, 3890);
  assert.equal(r.mpg, 7.54);
  // Every published sentence about this example is recomputed in page.test.mjs
  // from these fields, so the only literals that need to live here are the
  // three above, which fix the example itself.
  assert.ok(r.grandTotal > 0);
});

test('taxable gallons come from the fleet MPG, not from gallons bought there', () => {
  const r = example();
  const mi = r.lines.find((l) => l.jurisdiction === 'MI');
  // Michigan: 2,640 miles, no fuel bought. Its taxable gallons are still its
  // miles over the fleet's MPG, and the whole lot is owed.
  assert.equal(mi.taxPaidGallons, 0);
  assert.equal(mi.taxableGallons, round2(2640 / 7.54));
  assert.equal(mi.netTaxableGallons, mi.taxableGallons);
  assert.ok(mi.taxDue > 0);
});

test('a jurisdiction fuelled more than it is driven produces a credit', () => {
  const r = example();
  const il = r.lines.find((l) => l.jurisdiction === 'IL');
  assert.ok(il.netTaxableGallons < 0, 'Illinois bought more than it burned there');
  assert.ok(il.taxDue < 0, 'which is money coming back');
  assert.ok(r.creditTotal < 0);
  assert.ok(r.owedTotal > 0);
});

test('the surcharge is charged on taxable gallons and is never credited', () => {
  const r = example();
  const ky = r.lines.find((l) => l.jurisdiction === 'KY');
  assert.ok(ky.netTaxableGallons < 0, 'Kentucky is in credit on the tax line');
  assert.equal(ky.surchargeDue, round2(ky.taxableGallons * 0.102));
  assert.ok(ky.surchargeDue > 0, 'and still owes the surcharge in full');
  // The mistake this exists to catch: modelling the surcharge as another tax
  // rate would net it against the credit and under-report the row.
  const asIfNetted = round2(ky.netTaxableGallons * 0.102);
  assert.ok(asIfNetted < 0);
  assert.notEqual(ky.surchargeDue, asIfNetted);
  assert.ok(r.warnings.some((w) => w.code === 'surcharge-not-credited'));
});

test('jurisdictionLine is the whole per-row rule in one place', () => {
  const line = jurisdictionLine({
    taxableMiles: 1000, taxPaidGallons: 100, taxRate: 0.5, surchargeRate: 0.1,
  }, 8);
  assert.equal(line.taxableGallons, 125);
  assert.equal(line.netTaxableGallons, 25);
  assert.equal(line.taxDue, 12.5);
  assert.equal(line.surchargeDue, 12.5); // 125 x 0.1, not 25 x 0.1
  assert.equal(line.rowTotal, 25);
});

test('blank taxable miles means all miles are taxable, never zero', () => {
  const r = calculateReturn({
    rows: [
      { jurisdiction: 'IL', totalMiles: '1000', taxableMiles: '', taxPaidGallons: '100', taxRate: '0.5', surchargeRate: '' },
      { jurisdiction: 'IN', totalMiles: '1000', taxableMiles: '', taxPaidGallons: '150', taxRate: '0.5', surchargeRate: '' },
    ],
  });
  assert.equal(r.ok, true);
  for (const line of r.lines) {
    assert.equal(line.taxableMiles, 1000);
    assert.equal(line.taxableMilesWasImplied, true);
  }
});

test('exempt miles are subtracted when they are given', () => {
  const r = calculateReturn({
    rows: [
      { jurisdiction: 'IL', totalMiles: '1000', taxableMiles: '800', taxPaidGallons: '100', taxRate: '0.5', surchargeRate: '' },
      { jurisdiction: 'IN', totalMiles: '1000', taxableMiles: '', taxPaidGallons: '150', taxRate: '0.5', surchargeRate: '' },
    ],
  });
  assert.equal(r.ok, true);
  const il = r.lines.find((l) => l.jurisdiction === 'IL');
  assert.equal(il.taxableMiles, 800);
  assert.equal(il.taxableMilesWasImplied, false);
  // Exempt miles come off the taxable line but stay in the fleet MPG, because
  // the fleet really did drive them on the fuel it really did burn.
  assert.equal(r.totalMiles, 2000);
});

test('taxable miles above total miles is rejected, naming the jurisdiction', () => {
  const r = calculateReturn({
    rows: [{ jurisdiction: 'OH', totalMiles: '500', taxableMiles: '900', taxPaidGallons: '80', taxRate: '0.4', surchargeRate: '' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /^OH: taxable miles/);
});

test('a return with no gallons anywhere says why it cannot be computed', () => {
  const r = calculateReturn({
    rows: [{ jurisdiction: 'OH', totalMiles: '500', taxableMiles: '', taxPaidGallons: '', taxRate: '0.4', surchargeRate: '' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /Average fleet MPG is total miles over total gallons/);
});

test('an entirely empty form asks for a jurisdiction rather than throwing', () => {
  const blank = () => ({ jurisdiction: '', totalMiles: '', taxableMiles: '', taxPaidGallons: '', taxRate: '', surchargeRate: '' });
  const r = calculateReturn({ rows: [blank(), blank(), blank()] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /at least one jurisdiction/);
});

test('unused rows are ignored, not counted as jurisdictions', () => {
  const blank = { jurisdiction: '', totalMiles: '', taxableMiles: '', taxPaidGallons: '', taxRate: '', surchargeRate: '' };
  const r = calculateReturn({ rows: [...EXAMPLE_ROWS, blank, blank, blank] });
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, EXAMPLE_ROWS.length);
});

test('interest accrues per jurisdiction owed, and a credit does not offset it', () => {
  const r = calculateReturn({
    rows: [
      // Over-fuelled, in the higher-rate jurisdiction: a credit large enough
      // to carry the whole return into the negative. The rates have to differ
      // for that — at one rate the two rows net to exactly nothing, which is
      // the symmetry that makes this rule easy to miss in the first place.
      { jurisdiction: 'IL', totalMiles: '8000', taxableMiles: '', taxPaidGallons: '1400', taxRate: '0.8', surchargeRate: '' },
      // Under-fuelled, at a lower rate: a smaller amount owed.
      { jurisdiction: 'IN', totalMiles: '8000', taxableMiles: '', taxPaidGallons: '700', taxRate: '0.6', surchargeRate: '' },
    ],
    interestAnnualPercent: '12',
    monthsLate: '2',
  });
  assert.equal(r.ok, true);
  assert.ok(r.subtotal < 0, 'the return as a whole nets to a credit');
  assert.ok(r.interest > 0, 'and interest is still owed on the jurisdiction in debit');
  const il = r.lines.find((l) => l.jurisdiction === 'IL');
  const inn = r.lines.find((l) => l.jurisdiction === 'IN');
  assert.equal(il.interest, 0, 'a credit accrues no interest');
  assert.equal(inn.interest, round2(inn.rowTotal * 0.01 * 2));
  assert.ok(r.warnings.some((w) => w.code === 'interest-despite-credit'));
});

test('a part month of lateness counts as a whole month', () => {
  assert.equal(interestOnRow(1200, 0.12, 1), 12);
  assert.equal(interestOnRow(1200, 0.12, 1.1), 24, 'IFTA charges the whole month');
  assert.equal(interestOnRow(-1200, 0.12, 3), 0, 'credits accrue nothing');
  assert.equal(interestOnRow(1200, 0, 3), 0);
  assert.equal(interestOnRow(1200, 0.12, 0), 0);
});

test('an implausible fleet MPG is flagged but still computes', () => {
  const r = calculateReturn({
    rows: [
      // Gallons typed where miles belong: 40 mpg.
      { jurisdiction: 'IL', totalMiles: '20000', taxableMiles: '', taxPaidGallons: '250', taxRate: '0.5', surchargeRate: '' },
      { jurisdiction: 'IN', totalMiles: '20000', taxableMiles: '', taxPaidGallons: '250', taxRate: '0.5', surchargeRate: '' },
    ],
  });
  assert.equal(r.ok, true, 'still answers');
  assert.ok(r.mpg > PLAUSIBLE_MPG.max);
  const flagged = r.warnings.find((w) => w.code === 'implausible-mpg');
  assert.ok(flagged);
  assert.match(flagged.message, /litres entered as gallons/);
});

test('fuel bought where no miles were run is flagged as the audit query it is', () => {
  const r = calculateReturn({
    rows: [
      { jurisdiction: 'IL', totalMiles: '8000', taxableMiles: '', taxPaidGallons: '1000', taxRate: '0.5', surchargeRate: '' },
      { jurisdiction: 'WI', totalMiles: '', taxableMiles: '', taxPaidGallons: '120', taxRate: '0.33', surchargeRate: '' },
    ],
  });
  assert.equal(r.ok, true);
  const flagged = r.warnings.find((w) => w.code === 'fuel-without-miles');
  assert.ok(flagged);
  assert.match(flagged.message, /^WI:/);
});

test('taxable miles at a zero rate are flagged rather than silently dropped', () => {
  const r = calculateReturn({
    rows: [
      { jurisdiction: 'IL', totalMiles: '8000', taxableMiles: '', taxPaidGallons: '1000', taxRate: '0.5', surchargeRate: '' },
      { jurisdiction: 'OH', totalMiles: '3000', taxableMiles: '', taxPaidGallons: '200', taxRate: '', surchargeRate: '' },
    ],
  });
  assert.equal(r.ok, true);
  const flagged = r.warnings.find((w) => w.code === 'zero-rate');
  assert.ok(flagged);
  assert.match(flagged.message, /official rate table/);
});

test('a single jurisdiction is flagged as possibly not needing a return', () => {
  const r = calculateReturn({
    rows: [{ jurisdiction: 'IL', totalMiles: '8000', taxableMiles: '', taxPaidGallons: '1000', taxRate: '0.5', surchargeRate: '' }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === 'single-jurisdiction'));
});

test('the clean worked example raises no warning except the surcharge note', () => {
  const codes = example().warnings.map((w) => w.code);
  assert.deepEqual(codes, ['surcharge-not-credited']);
});

test('totals reconcile: rows sum to the subtotal, and interest to the grand total', () => {
  const r = example({ interestAnnualPercent: '9', monthsLate: '1' });
  const rowSum = round2(r.lines.reduce((n, l) => n + l.rowTotal, 0));
  assert.equal(rowSum, r.subtotal);
  assert.equal(round2(r.taxDue + r.surchargeDue), r.subtotal);
  assert.equal(round2(r.owedTotal + r.creditTotal), r.subtotal);
  assert.equal(round2(r.subtotal + r.interest), r.grandTotal);
});

test('out-of-range figures are rejected with the jurisdiction named', () => {
  const r = calculateReturn({
    rows: [{ jurisdiction: 'IL', totalMiles: '-5', taxableMiles: '', taxPaidGallons: '10', taxRate: '0.5', surchargeRate: '' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /^IL: Total miles cannot be below 0\./);
});

test('a non-numeric figure is rejected rather than becoming NaN', () => {
  const r = calculateReturn({
    rows: [{ jurisdiction: 'IL', totalMiles: 'eight thousand', taxableMiles: '', taxPaidGallons: '10', taxRate: '0.5', surchargeRate: '' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /needs a number/);
});

test('the row shape the page renders is the row shape the calculator reads', () => {
  assert.equal(ROW_COUNT, 12);
  assert.deepEqual(ROW_FIELDS, [
    'jurisdiction', 'totalMiles', 'taxableMiles', 'taxPaidGallons', 'taxRate', 'surchargeRate',
  ]);
  assert.deepEqual(GLOBAL_INPUT_IDS, ['interestAnnualPercent', 'monthsLate']);
});

export { EXAMPLE_ROWS };
