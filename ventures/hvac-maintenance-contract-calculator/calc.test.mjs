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
