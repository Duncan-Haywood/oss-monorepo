import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, weeklyIncomeGap, DEFAULTS, FOUNDATION_TYPES } from './calc.mjs';

test('DEFAULTS price a sane, positive inspection', () => {
  const r = calculateQuote(DEFAULTS);
  assert.ok(r.finalPrice > 0);
  assert.equal(r.onSiteHours, 3.75); // 2000*0.00125=2.5 base + 0.25 (2nd story) + 0.5 (crawlspace) + 0.5 (25yr age band)
  assert.equal(r.laborCost, 375);
  assert.equal(r.travelCost, 14);
  assert.equal(r.addOnsTotal, 0);
  assert.equal(r.rushSurcharge, 0);
  assert.equal(r.cost, 424);
  assert.ok(Math.abs(r.finalPrice - 565.33) < 0.01);
  assert.ok(Math.abs(r.profitMarginPct - 25) < 0.01);
});

test('a worked job with every line item populated matches hand-computed figures', () => {
  const r = calculateQuote({
    squareFootage: 2800, stories: 2, foundationType: 'crawlspace', homeAgeYears: 45,
    roundTripMiles: 30, mileageRate: 0.7, baseHourlyRate: 95,
    rushReport: true, rushFeePct: 15,
    radon: true, radonFee: 150,
    sewerScope: true, sewerScopeFee: 175,
    termiteWdo: false, termiteWdoFee: 90,
    moldTest: false, moldTestFee: 125,
    overheadPerJob: 35, targetMarginPct: 25,
  });
  assert.equal(r.onSiteHours, 4.75);
  assert.equal(r.laborCost, 451.25);
  assert.ok(Math.abs(r.rushSurcharge - 67.6875) < 1e-6);
  assert.equal(r.travelCost, 21);
  assert.equal(r.addOnsTotal, 325);
  assert.ok(Math.abs(r.cost - 899.9375) < 1e-6);
  assert.ok(Math.abs(r.finalPrice - 1199.9166666667) < 1e-4);
  assert.ok(Math.abs(r.profit - 299.9791666667) < 1e-4);
  assert.ok(Math.abs(r.effectiveHourlyRate - 158.1535) < 1e-3);
});

test('a rush report only surcharges billed labor time, never travel or add-ons', () => {
  const withoutAddons = calculateQuote({ ...DEFAULTS, rushReport: false });
  const withRush = calculateQuote({ ...DEFAULTS, rushReport: true, rushFeePct: 20 });
  assert.equal(withRush.travelCost, withoutAddons.travelCost);
  assert.equal(withRush.addOnsTotal, withoutAddons.addOnsTotal);
  assert.ok(Math.abs(withRush.rushSurcharge - withRush.laborCost * 0.2) < 1e-9);
});

test('every foundation type is accepted and crawlspace/basement cost more time than slab', () => {
  for (const foundationType of FOUNDATION_TYPES) {
    const r = calculateQuote({ ...DEFAULTS, foundationType });
    assert.ok(r.finalPrice > 0, foundationType);
  }
  const slab = calculateQuote({ ...DEFAULTS, foundationType: 'slab' });
  const crawl = calculateQuote({ ...DEFAULTS, foundationType: 'crawlspace' });
  const basement = calculateQuote({ ...DEFAULTS, foundationType: 'basement' });
  assert.ok(crawl.onSiteHours > slab.onSiteHours);
  assert.ok(basement.onSiteHours > slab.onSiteHours);
  assert.ok(crawl.onSiteHours > basement.onSiteHours);
});

test('home age adds time in bands: newer than 10y adds nothing, 60y+ adds a full hour', () => {
  const young = calculateQuote({ ...DEFAULTS, homeAgeYears: 5 });
  const old = calculateQuote({ ...DEFAULTS, homeAgeYears: 65 });
  assert.ok(old.onSiteHours - young.onSiteHours >= 1 - 1e-9);
});

test('each selected add-on adds exactly its own fee, and an unselected add-on adds nothing', () => {
  const base = calculateQuote(DEFAULTS);
  const withRadon = calculateQuote({ ...DEFAULTS, radon: true, radonFee: 150 });
  assert.ok(Math.abs((withRadon.addOnsTotal - base.addOnsTotal) - 150) < 1e-9);
  const withAll = calculateQuote({
    ...DEFAULTS,
    radon: true, radonFee: 150,
    sewerScope: true, sewerScopeFee: 175,
    termiteWdo: true, termiteWdoFee: 90,
    moldTest: true, moldTestFee: 125,
  });
  assert.equal(withAll.addOnsTotal, 150 + 175 + 90 + 125);
  const selected = withAll.addOns.filter((a) => a.selected).map((a) => a.key);
  assert.deepEqual(selected.sort(), ['moldTest', 'radon', 'sewerScope', 'termiteWdo'].sort());
});

test('invalid inputs throw a readable error instead of returning NaN or a negative price', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, squareFootage: 0 }), /square footage/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, squareFootage: -100 }), /square footage/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, stories: 0 }), /stories/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, foundationType: 'houseboat' }), /foundation type/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, homeAgeYears: -1 }), /home age/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, baseHourlyRate: 0 }), /hourly rate/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMarginPct: 100 }), /target margin/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMarginPct: -1 }), /target margin/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, radon: true, radonFee: -1 }), /radon/i);
});

test('weeklyIncomeGap says whether a week of inspections clears the target and by how many jobs', () => {
  const short = weeklyIncomeGap(2000, 299.98, 5);
  assert.ok(Math.abs(short.totalWeeklyProfit - 1499.9) < 0.1);
  assert.ok(!short.meetsTarget);
  assert.equal(short.additionalJobsNeeded, 2);

  const met = weeklyIncomeGap(1000, 300, 5);
  assert.ok(met.meetsTarget);
  assert.equal(met.additionalJobsNeeded, 0);

  const zeroProfit = weeklyIncomeGap(500, 0, 5);
  assert.ok(!zeroProfit.meetsTarget);
  assert.equal(zeroProfit.additionalJobsNeeded, null);
});
