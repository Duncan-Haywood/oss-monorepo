import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  SERVICE_PRESETS,
  VISITS_PER_YEAR,
  FREQUENCY_LABELS,
} from './calc.mjs';

const house = () => ({
  services: [
    { name: 'Exterior perimeter spray', minutes: 18, quantity: 1, everyVisit: true, materialPerUnit: 4.5 },
    { name: 'Interior crack & crevice', minutes: 22, quantity: 1, everyVisit: true, materialPerUnit: 3.25 },
    { name: 'Rodent bait station check', minutes: 4, quantity: 8, everyVisit: true, materialPerUnit: 1.75 },
    { name: 'Initial knockdown spray', minutes: 35, quantity: 1, everyVisit: false, materialPerUnit: 8 },
    { name: 'Station install (each)', minutes: 12, quantity: 8, everyVisit: false, materialPerUnit: 12 },
  ],
  oneWayMinutes: 22,
  frequency: 'quarterly',
  hourlyWage: 20,
  burdenRate: 30,
  vehicleCostPerVisit: 8,
  otherPerVisit: 0,
  overheadRate: 15,
  targetMargin: 25,
});

test('recurring hours add drive to on-site work, not house size', () => {
  const result = calculateBid(house());
  // Spray 18 + interior 22 + 8 stations × 4 = 72 on-site minutes = 1.2 h
  assert.ok(Math.abs(result.recurringOnSiteHours - 1.2) < 1e-9);
  // 22 min each way = 44 min = 0.733... h
  assert.ok(Math.abs(result.driveHours - 44 / 60) < 1e-9);
  assert.ok(Math.abs(result.recurringVisitHours - (1.2 + 44 / 60)) < 1e-9);
  assert.equal(result.visitsPerYear, 4);
});

test('stations consume labor out of all proportion to a house-size quote', () => {
  const result = calculateBid(house());
  const stations = result.services.find(s => s.name === 'Rodent bait station check');
  const spray = result.services.find(s => s.name === 'Exterior perimeter spray');
  assert.ok(stations.hours > spray.hours, 'eight station checks take longer than the exterior spray');
  assert.ok(result.driveShare > 25, `drive is only ${result.driveShare.toFixed(1)}% of the stop`);
  assert.ok(result.driveShare < 50);
});

test('initial visit is a different job from the recurring stop', () => {
  const result = calculateBid(house());
  // Knockdown 35 + 8 installs × 12 = 35 + 96 = 131 extra minutes
  assert.ok(Math.abs(result.initialOnlyHours - 131 / 60) < 1e-9);
  assert.ok(result.initialVisitHours > result.recurringVisitHours);
  assert.ok(result.initialPrice > result.recurringPrice);
  // First-visit materials include the recurring chemicals plus stations.
  assert.ok(result.initialMaterials > result.recurringMaterials);
  assert.ok(Math.abs(result.initialMaterials - (4.5 + 3.25 + 8 * 1.75 + 8 + 8 * 12)) < 1e-9);
});

test('price stacks burden, chemicals, vehicle, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 20 * 1.3);

  const recurringDirect = result.recurringLabor + result.recurringMaterials + 8;
  assert.ok(Math.abs(result.recurringOverhead - recurringDirect * 0.15) < 1e-9);
  assert.ok(Math.abs(result.recurringCost - recurringDirect * 1.15) < 1e-9);
  assert.ok(Math.abs(result.recurringProfit / result.recurringPrice * 100 - 25) < 1e-9);
  assert.ok(Math.abs(result.annualPrice - (result.initialPrice + result.recurringPrice * 4)) < 1e-9);
});

test('effective hourly with the drive is lower than the on-site-only figure', () => {
  const result = calculateBid(house());
  assert.ok(result.effectiveHourlyWithDrive < result.effectiveHourlyOnSite);
  assert.ok(result.effectiveHourlyWithDrive > 20);
  assert.equal(result.breakEvenRecurring, result.recurringCost);
  assert.equal(result.breakEvenInitial, result.initialCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...house(), targetMargin: 0 });
  assert.ok(Math.abs(result.recurringPrice - result.recurringCost) < 1e-9);
  assert.ok(Math.abs(result.initialPrice - result.initialCost) < 1e-9);
  assert.ok(Math.abs(result.recurringProfit) < 1e-9);
});

test('a proposed recurring price is scored against the same cost base', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedRecurring: bid.recurringPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyWithDrive) < 1e-9);
});

test('a proposed recurring price under cost is flagged as a losing stop', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedRecurring: bid.recurringCost - 10 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedRecurring: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedRecurring: null }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedRecurring: 0 }).proposed.price, 0);
});

test('frequency changes annual invoices without changing the stop itself', () => {
  const quarterly = calculateBid(house());
  const monthly = calculateBid({ ...house(), frequency: 'monthly' });
  assert.equal(monthly.recurringVisitHours, quarterly.recurringVisitHours);
  assert.equal(monthly.recurringPrice, quarterly.recurringPrice);
  assert.equal(monthly.visitsPerYear, 12);
  assert.ok(Math.abs(monthly.annualRecurring - quarterly.annualRecurring * 3) < 1e-9);
});

test('waiving the initial reports how many later stops recover it', () => {
  const result = calculateBid({ ...house(), waiveInitial: true });
  assert.equal(result.waiveInitial, true);
  assert.ok(result.visitsToRecover >= 1);
  assert.ok(result.monthsToRecover >= 3);
  assert.ok(result.visitsToRecover * result.recurringProfit >= result.initialCost - 1e-9);
});

test('an unprofitable recurring stop cannot recover a waived initial', () => {
  const result = calculateBid({ ...house(), targetMargin: 0, waiveInitial: true });
  assert.equal(result.visitsToRecover, null);
  assert.equal(result.monthsToRecover, null);
});

test('a nameless service still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    services: [
      { minutes: 10, quantity: 1, everyVisit: true, materialPerUnit: 1 },
      { name: '   ', minutes: 5, quantity: 1, everyVisit: true, materialPerUnit: 1 },
    ],
  });
  assert.equal(result.services[0].name, 'Service 1');
  assert.equal(result.services[1].name, 'Service 2');
});

test('a stop with no on-site work still prices the drive', () => {
  const result = calculateBid({
    ...house(),
    services: [{ name: 'Empty', minutes: 0, quantity: 1, everyVisit: true, materialPerUnit: 0 }],
  });
  assert.equal(result.recurringOnSiteHours, 0);
  assert.equal(result.effectiveHourlyOnSite, null);
  assert.ok(result.recurringVisitHours > 0);
  assert.ok(result.recurringPrice > 0);
  assert.ok(Math.abs(result.driveShare - 100) < 1e-9);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), services: [] }), /at least one service/);
  assert.throws(() => calculateBid({ ...house(), frequency: 'weekly' }), /Frequency must be/);
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(
    () => calculateBid({
      ...house(),
      services: [{ name: 'Spray', minutes: -5, quantity: 1, everyVisit: true }],
    }),
    /Spray: minutes must be at least 0/,
  );
});

test('service presets are usable positive starting points', () => {
  assert.ok(SERVICE_PRESETS.length >= 8);
  assert.ok(SERVICE_PRESETS.some(p => p.unit && p.everyVisit));
  assert.ok(SERVICE_PRESETS.some(p => !p.everyVisit));
  for (const preset of SERVICE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.minutes) && preset.minutes >= 0);
    assert.ok(Number.isFinite(preset.materialPerUnit) && preset.materialPerUnit >= 0);
  }
});

test('frequency table matches the labels the page shows', () => {
  assert.deepEqual(Object.keys(VISITS_PER_YEAR).sort(), Object.keys(FREQUENCY_LABELS).sort());
  assert.equal(VISITS_PER_YEAR.monthly, 12);
  assert.equal(VISITS_PER_YEAR.bimonthly, 6);
  assert.equal(VISITS_PER_YEAR.quarterly, 4);
  assert.equal(VISITS_PER_YEAR.semiannual, 2);
});
