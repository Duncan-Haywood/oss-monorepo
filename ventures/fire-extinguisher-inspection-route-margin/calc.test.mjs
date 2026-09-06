import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.inspectionRevenue, 162);
  close(r.tagRevenue, 45);
  close(r.tagCost, 7.2);
  close(r.rechargeRevenue, 136.8);
  close(r.rechargeCost, 50.4);
  close(r.hydroRevenue, 83.52);
  close(r.hydroCost, 31.68);
  close(r.replaceRevenue, 68.4);
  close(r.replaceCost, 41.76);
  close(r.visitRevenue, 495.72);
  close(r.materialsCost, 131.04);
  close(r.mileageCost, 6.03);
  close(r.laborHours, 1.6);
  close(r.laborCost, 51.2);
  close(r.visitProfit, 307.45);
  close(r.monthlyRevenue, 495.72 / 12);
  close(r.netProfit, 211.45 / 12);
  close(r.profitMarginPct, ((211.45 / 12) / (495.72 / 12)) * 100);
  close(r.effectiveHourlyRate, 211.45 / 1.6);
  close(r.perUnitProfit, 307.45 / 18);
  assert.ok(r.netProfit > 0, 'the default site should be profitable');
});

test('a site with zero extinguishers still pays drive time and recordkeeping cost', () => {
  const r = calculate({ ...DEFAULTS, extinguisherCount: 0 });
  assert.equal(r.inspectionRevenue, 0);
  assert.equal(r.visitRevenue, 0);
  assert.equal(r.perUnitProfit, null);
  assert.ok(r.netProfit < 0, 'drive time and recordkeeping cost still apply with zero extinguishers');
});

test('a higher recharge percentage raises both revenue and cost by the recharge margin', () => {
  const low = calculate({ ...DEFAULTS, rechargePct: 10 });
  const high = calculate({ ...DEFAULTS, rechargePct: 20 });
  const extraUnits = DEFAULTS.extinguisherCount * 0.10;
  close(high.rechargeRevenue - low.rechargeRevenue, extraUnits * DEFAULTS.rechargeFeePerUnit);
  close(high.visitProfit - low.visitProfit, extraUnits * (DEFAULTS.rechargeFeePerUnit - DEFAULTS.rechargeCostPerUnit));
});

test('two visits a year roughly doubles monthly profit relative to labor, minus the fixed monthly recordkeeping cost twice diluted', () => {
  const once = calculate({ ...DEFAULTS, visitsPerYear: 1 });
  const twice = calculate({ ...DEFAULTS, visitsPerYear: 2 });
  // Same per-visit economics, twice the visits: the per-visit profit portion
  // doubles, and the fixed monthly recordkeeping cost is unchanged either way.
  close(twice.netProfit - once.netProfit, once.visitProfit / 12);
});

test('recordkeeping cost is a flat monthly deduction, independent of visit count', () => {
  const cheap = calculate({ ...DEFAULTS, recordkeepingMonthlyCost: 0 });
  const pricier = calculate({ ...DEFAULTS, recordkeepingMonthlyCost: 20 });
  close(cheap.netProfit - pricier.netProfit, 20);
});

test('rejects a recharge percentage over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, rechargePct: 101 }), /recharge/i);
});

test('rejects a hydro test percentage over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, hydroTestPct: 150 }), /hydro test/i);
});

test('rejects a negative extinguisher count', () => {
  assert.throws(() => calculate({ ...DEFAULTS, extinguisherCount: -1 }), /extinguisher count/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, inspectionFeePerUnit: 'free' }), /inspection fee/i);
});

test('computeRouteProfit sums monthly profit across sites and averages it', () => {
  const route = computeRouteProfit([{ monthlyProfit: 40 }, { monthlyProfit: 15 }, { monthlyProfit: -5 }]);
  assert.equal(route.totalMonthlyProfit, 50);
  assert.equal(route.siteCount, 3);
  close(route.averageProfitPerSite, 50 / 3);
});

test('computeRouteProfit on an empty route returns zero without dividing by zero', () => {
  const route = computeRouteProfit([]);
  assert.equal(route.totalMonthlyProfit, 0);
  assert.equal(route.siteCount, 0);
  assert.equal(route.averageProfitPerSite, 0);
});

test('incomeGap reports the shortfall and sites needed to close it', () => {
  const gap = incomeGap(1000, 700, 100);
  assert.equal(gap.gap, 300);
  assert.equal(gap.additionalSitesNeeded, 3);
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap reports goal met with zero sites needed once profit clears the target', () => {
  const gap = incomeGap(1000, 1200, 100);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalSitesNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap cannot compute additional sites needed when the average profit per site is zero or negative', () => {
  const gap = incomeGap(1000, 0, 0);
  assert.equal(gap.additionalSitesNeeded, null);
  assert.equal(gap.meetsTarget, false);
});
