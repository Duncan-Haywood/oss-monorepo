import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, formatPlanSummary } from './calc.mjs';

const base = {
  visitsPerYear: 4, laborHoursPerVisit: 2, loadedHourlyRate: 45,
  travelCostPerVisit: 20, partsReservePerVisit: 35, callbackVisitsPerYear: 1,
  callbackHours: 1, callbackCostPerVisit: 25, annualOverhead: 120,
  targetMargin: 20,
};

test('prices scheduled maintenance, callbacks, overhead, and margin', () => {
  const result = calculatePlan(base);
  assert.equal(result.annualCost, 770);
  assert.equal(result.breakEvenMonthlyPrice, 770 / 12);
  assert.equal(result.annualPrice, 962.5);
  assert.equal(result.monthlyPrice, 962.5 / 12);
  assert.equal(result.totalTechnicianHours, 9);
});

test('flags a proposed monthly price below the floor', () => {
  const result = calculatePlan({ ...base, proposedMonthlyPrice: '50' });
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(result.proposed.annualProfit < 0);
});

test('renders a copyable summary', () => {
  const summary = formatPlanSummary(calculatePlan({ ...base, proposedMonthlyPrice: '90' }));
  assert.match(summary, /Price at target margin: \$80\.21\/month/);
  assert.match(summary, /Price considered: \$90\.00\/month/);
});

test('rejects a plan with no visits or a full margin target', () => {
  assert.throws(() => calculatePlan({ ...base, visitsPerYear: 0 }), /visits per year/);
  assert.throws(() => calculatePlan({ ...base, targetMargin: 100 }), /less than 100/);
});

test('retention and pull-through stay absent unless asked for', () => {
  // The plan-fee arithmetic is what a contractor who has never measured
  // pull-through should see. Defaulting these to a guess would quietly change
  // the floor every existing user reads.
  const result = calculatePlan(base);
  assert.equal(result.pullThroughProfitPerYear, 0);
  assert.equal(result.cancellation, null);
  assert.equal(result.breakEvenMonthlyPriceWithPullThrough, result.breakEvenMonthlyPrice);
  assert.equal(result.totalAnnualProfit, result.annualProfit);
  assert.equal(formatPlanSummary(result).includes('Repair pull-through'), false);
});

test('the first visit lands at signing, so early months are underwater', () => {
  // 4 visits a year is one every 3 months, and the first happens the day the
  // agreement is signed. At month 3 the second visit is due, so two full
  // visits (2 x $145) are spent against three months of fees. Straight-line
  // proration would report this month as roughly break-even; it is not.
  const result = calculatePlan({ ...base, cancelAfterMonths: 3 });
  assert.equal(result.costPerVisit, 145);
  assert.equal(result.cancellation.visitsDelivered, 2);
  assert.equal(result.cancellation.costIncurred, 2 * 145 + (70 + 120) * (3 / 12));
  assert.ok(result.cancellation.net < 0, 'a month-3 cancellation should lose money');
  // Break-even arrives at month 5, not month 1: that gap is the argument for a
  // term commitment or an enrollment fee, and it is invisible in annual margin.
  assert.equal(result.monthsToBreakEven, 5);
  assert.match(formatPlanSummary(result), /If cancelled after month 3: 2 visit\(s\) delivered, -\$96\.88 net/);
});

test('a cancellation month outside the first year is rejected', () => {
  assert.throws(() => calculatePlan({ ...base, cancelAfterMonths: 13 }), /within the first 12 months/);
  assert.throws(() => calculatePlan({ ...base, cancelAfterMonths: 0 }), /greater than zero/);
});

test('repair pull-through lowers the floor without hiding the plan-fee floor', () => {
  const result = calculatePlan({ ...base, pullThroughProfitPerYear: 600 });
  assert.equal(result.breakEvenMonthlyPrice, 770 / 12, 'the plan-only floor must survive');
  assert.equal(result.breakEvenMonthlyPriceWithPullThrough, (770 - 600) / 12);
  assert.equal(result.totalAnnualProfit, result.annualProfit + 600);
  assert.equal(result.pullThroughCoversPlan, false);
  assert.ok(result.effectiveHourlyValue > result.effectiveHourlyRevenue);
  assert.match(formatPlanSummary(result), /floor drops to \$14\.17\/month/);
});

test('pull-through larger than the plan cost never implies a negative price', () => {
  const result = calculatePlan({ ...base, pullThroughProfitPerYear: 2000 });
  assert.equal(result.pullThroughCoversPlan, true);
  assert.equal(result.breakEvenMonthlyPriceWithPullThrough, 0);
  assert.match(formatPlanSummary(result), /repair profit alone covers the plan/);
});

test('a haggled price is measured on its own break-even and exposure', () => {
  // $55/month is under the $64.17 plan floor, so it never catches up inside
  // the year -- but with $600 of repair pull-through the member is still
  // profitable overall. Both facts have to be visible; either alone misleads.
  const result = calculatePlan({ ...base, proposedMonthlyPrice: '55', pullThroughProfitPerYear: 600, cancelAfterMonths: 6 });
  assert.equal(result.proposed.belowBreakEven, true);
  assert.equal(result.proposed.monthsToBreakEven, null);
  assert.equal(result.proposed.belowBreakEvenWithPullThrough, false);
  assert.equal(result.proposed.totalAnnualProfit, 55 * 12 - (770 - 600));
  // The summary must quote the exposure for the price under discussion, not
  // the healthier target-margin one.
  assert.equal(result.proposed.cancellation.revenueCollected, 55 * 6);
  assert.match(formatPlanSummary(result), new RegExp(`${result.proposed.cancellation.net.toFixed(2)} net`.replace('-', '-\\$')));
});
