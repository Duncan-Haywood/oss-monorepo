import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateEffectiveLaborRate, gapShares, notes, NUMERIC_IDS } from './calc.mjs';

/**
 * The worked example the page ships with: a three-technician independent shop,
 * one ordinary month. Every figure below is checkable by hand against the
 * comments in `calc.mjs`, which is the point — a shop owner who does not trust
 * the tool has to be able to reproduce it on paper.
 */
const SHOP = Object.freeze({
  postedLaborRate: 165,
  customerPayHours: 320,
  customerPayLaborSales: 46400,
  warrantyHours: 45,
  warrantyLaborSales: 4275,
  internalHours: 28,
  technicianCount: 3,
  totalClockHours: 480,
  totalTechnicianPay: 19200,
  monthlyOverhead: 34000,
  partsGrossProfit: 21000,
  targetLaborGrossProfit: 70,
});

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test('the effective rate is labor sales over sold hours, not over hours worked', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  assert.equal(r.ok, true);
  assert.equal(r.soldHours, 365);
  assert.equal(r.consumedHours, 393);
  assert.equal(r.laborSales, 50675);
  near(r.effectiveLaborRate, 138.84);
  // The harsher figure, reported beside it rather than instead of it.
  near(r.effectiveRateOnAllHours, 128.94);
  assert.ok(r.effectiveRateOnAllHours < r.effectiveLaborRate);
});

test('the billing gap is exactly the two causes that were billed, and no more', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  near(r.laborSalesAtPostedRate, 60225);
  near(r.totalBillingGap, 9550);
  near(r.customerPayGap, 6400);
  near(r.warrantyGap, 3150);
  // The decomposition must close. If it ever does not, the page is attributing
  // a shortfall to a cause that did not produce it.
  near(r.customerPayGap + r.warrantyGap, r.totalBillingGap);
});

test('internal hours are forgone capacity, kept out of the billing gap', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  near(r.internalOpportunity, 4620);
  // The load-bearing assertion behind the third design decision in calc.mjs:
  // adding this into the gap would double-count, because the payroll for those
  // hours is already inside costPerBilledHour.
  assert.ok(!Number.isNaN(r.totalBillingGap));
  near(r.totalBillingGap, r.customerPayGap + r.warrantyGap);
});

test('a shop with no internal hours has no capacity loss and the two rates agree', () => {
  const r = calculateEffectiveLaborRate({ ...SHOP, internalHours: 0 });
  assert.equal(r.internalOpportunity, 0);
  near(r.effectiveRateOnAllHours, r.effectiveLaborRate);
});

test('efficiency below 100% is what makes a billed hour cost more than a clock hour', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  near(r.costPerClockHour, 40);
  near(r.costPerBilledHour, 52.6);
  near(r.technicianEfficiency, 76.04);
  near(r.unproductiveClockHours, 115);
  assert.ok(r.costPerBilledHour > r.costPerClockHour);
});

test('a flat-rate shop beating book time sells more hours than it pays for', () => {
  const r = calculateEffectiveLaborRate({ ...SHOP, totalClockHours: 340 });
  assert.ok(r.technicianEfficiency > 100);
  // The relationship inverts rather than breaking.
  assert.ok(r.costPerBilledHour < r.costPerClockHour);
  assert.ok(r.notes.some((n) => n.includes('which is what flat-rate pay is designed to produce')));
});

test('overhead carried by labor is what parts gross profit does not cover', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  assert.equal(r.overheadCarriedByLabor, 13000);
  near(r.breakEvenLaborRate, 88.22);
  assert.equal(r.coversCost, true);
});

test('parts gross profit above overhead leaves labor carrying nothing, never a negative', () => {
  const r = calculateEffectiveLaborRate({ ...SHOP, partsGrossProfit: 40000 });
  assert.equal(r.overheadCarriedByLabor, 0);
  // Break-even then falls back to technician cost alone rather than going below it.
  near(r.breakEvenLaborRate, r.totalTechnicianPay / r.soldHours);
});

test('the required posted rate is the required effective rate grossed up for realization', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  near(r.laborGrossProfitPercent, 62.11);
  assert.equal(r.meetsTarget, false);
  near(r.requiredEffectiveRate, 175.34);
  near(r.realizationRatio, 0.8414, 0.0005);
  // The whole point of the page: posting $175 collects $147, not $175.
  near(r.requiredPostedRate, 208.39, 0.05);
  assert.ok(r.requiredPostedRate > r.requiredEffectiveRate);
});

test('a shop already at its target is told so rather than given a rate to chase', () => {
  const r = calculateEffectiveLaborRate({ ...SHOP, targetLaborGrossProfit: 60 });
  assert.equal(r.meetsTarget, true);
  assert.ok(r.notes.some((n) => n.includes('at or above the')));
  assert.ok(!r.notes.some((n) => n.includes('needs') && n.includes('to actually reach the invoice')));
});

test('the month closes: labor GP plus parts GP less overhead is the net', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  assert.equal(r.laborGrossProfitDollars, 31475);
  assert.equal(r.netBeforeTax, 18475);
  near(r.laborGrossProfitDollars + r.partsGrossProfit - r.monthlyOverhead, r.netBeforeTax);
});

test('the annual figures are this month at this month s mix, and say so', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  near(r.annualBillingGap, 9550 * 12);
  near(r.annualInternalOpportunity, 4620 * 12);
  assert.ok(r.notes.some((n) => n.includes("at this month's mix")));
});

test('billing above the posted rate is reported, not refused', () => {
  const r = calculateEffectiveLaborRate({ ...SHOP, customerPayLaborSales: 60000 });
  assert.equal(r.ok, true);
  assert.ok(r.totalBillingGap < 0);
  assert.ok(r.realizationRatio > 1);
  assert.equal(r.gapShares, null, 'a negative gap has no shares to apportion');
  assert.ok(r.notes.some((n) => n.includes('more than your posted rate would have produced')));
});

test('gapShares refuses to apportion a gap that is zero or negative', () => {
  assert.equal(gapShares({ customerPayGap: 0, warrantyGap: 0, totalBillingGap: 0 }), null);
  assert.equal(gapShares({ customerPayGap: -5, warrantyGap: -5, totalBillingGap: -10 }), null);
  const shares = gapShares({ customerPayGap: 75, warrantyGap: 25, totalBillingGap: 100 });
  near(shares.customerPay, 75);
  near(shares.warranty, 25);
});

test('the notes name whichever cause is the larger share of the gap', () => {
  const warrantyHeavy = calculateEffectiveLaborRate({
    ...SHOP,
    customerPayLaborSales: 52800, // customer pay billed at the full posted rate
    warrantyHours: 120,
    warrantyLaborSales: 10200,
  });
  assert.ok(warrantyHeavy.notes.some((n) => n.includes('Warranty is')));
  assert.ok(!warrantyHeavy.notes.some((n) => n.includes('Customer-pay work is')));

  const customerPayHeavy = calculateEffectiveLaborRate({
    ...SHOP,
    warrantyHours: 0,
    warrantyLaborSales: 0,
  });
  assert.ok(customerPayHeavy.notes.some((n) => n.includes('Customer-pay work is')));
  assert.ok(!customerPayHeavy.notes.some((n) => n.includes('Warranty is')));
});

test('every required field is an error when blank, never a silent zero', () => {
  for (const id of NUMERIC_IDS) {
    const r = calculateEffectiveLaborRate({ ...SHOP, [id]: '' });
    assert.equal(r.ok, false, `${id} blank should not compute`);
    assert.ok(
      r.errors.some((e) => e.id === id),
      `${id} blank should be reported against ${id}`,
    );
  }
});

test('a month with no hours billed is a refusal, not a rate of zero', () => {
  const r = calculateEffectiveLaborRate({
    ...SHOP,
    customerPayHours: 0,
    warrantyHours: 0,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.id === 'customerPayHours'));
  assert.ok(r.errors[0].message.includes('no rate to measure'));
});

test('out-of-range inputs are refused against the field that carries them', () => {
  const negative = calculateEffectiveLaborRate({ ...SHOP, internalHours: -4 });
  assert.equal(negative.ok, false);
  assert.ok(negative.errors.some((e) => e.id === 'internalHours'));

  const impossible = calculateEffectiveLaborRate({ ...SHOP, targetLaborGrossProfit: 100 });
  assert.equal(impossible.ok, false);
  assert.ok(impossible.errors.some((e) => e.id === 'targetLaborGrossProfit'));

  const noTechs = calculateEffectiveLaborRate({ ...SHOP, technicianCount: 0 });
  assert.equal(noTechs.ok, false);
  assert.ok(noTechs.errors.some((e) => e.id === 'technicianCount'));
});

test('a shop below break-even is told the month is short, with the figure', () => {
  const r = calculateEffectiveLaborRate({
    ...SHOP,
    customerPayLaborSales: 12000,
    warrantyLaborSales: 1200,
    monthlyOverhead: 40000,
    partsGrossProfit: 2000,
  });
  assert.equal(r.coversCost, false);
  assert.ok(r.netBeforeTax < 0);
  assert.ok(r.notes.some((n) => n.includes('is not covering its own cost')));
  assert.ok(r.notes.some((n) => n.includes('short')));
});

test('notes are statements about the figures, never instructions to the shop', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  assert.ok(r.notes.length > 0);
  for (const note of r.notes) {
    assert.ok(
      !/\byou should\b|\byou must\b|\braise your\b|\bstop taking\b|\bwe recommend\b/i.test(note),
      `note reads as advice rather than arithmetic: ${note}`,
    );
  }
});

test('notes() is pure over the figures it is given', () => {
  const r = calculateEffectiveLaborRate(SHOP);
  const again = notes(r);
  assert.deepEqual(again, r.notes);
});
