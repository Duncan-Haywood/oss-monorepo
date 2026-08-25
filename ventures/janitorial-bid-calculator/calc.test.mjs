import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, formatBidSummary, WEEKS_PER_MONTH, PRODUCTION_RATE_PRESETS, PROJECT_RATE_PRESETS } from './calc.mjs';

const office = () => ({
  areas: [
    { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
    { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
    { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
    { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
  ],
  hourlyWage: 17,
  burdenRate: 28,
  suppliesPerSqFtMonth: 0.005,
  equipmentMonthly: 25,
  otherMonthly: 0,
  overheadRate: 15,
  targetMargin: 20,
});

test('labor hours come from production rates, not floor area alone', () => {
  const result = calculateBid(office());
  // 6000/4000 + 600/1200 + 400/2000 + 1000/5000 = 1.5 + 0.5 + 0.2 + 0.2
  assert.ok(Math.abs(result.hoursPerVisitTotal - 2.4) < 1e-9);
  assert.ok(Math.abs(result.monthlyHours - 2.4 * 5 * WEEKS_PER_MONTH) < 1e-9);
  assert.equal(result.totalSquareFeet, 8000);
});

test('restrooms consume labor out of all proportion to their floor area', () => {
  const result = calculateBid(office());
  const restrooms = result.areas.find(a => a.name === 'Restrooms');
  const areaShare = restrooms.squareFeet / result.totalSquareFeet * 100;
  assert.ok(areaShare < 8, `restrooms are ${areaShare.toFixed(1)}% of the floor`);
  assert.ok(restrooms.hoursShare > 20, `but only ${restrooms.hoursShare.toFixed(1)}% of the hours`);
});

test('price stacks burden, supplies, overhead, then margin as a share of price', () => {
  const result = calculateBid(office());
  assert.equal(result.loadedWage, 17 * 1.28);
  assert.ok(Math.abs(result.monthlySupplies - 40) < 1e-9);

  const direct = result.monthlyLaborCost + result.monthlySupplies + 25;
  assert.ok(Math.abs(result.monthlyOverhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.monthlyCost - direct * 1.15) < 1e-9);

  // Margin is a share of price: profit / price == target, not profit / cost.
  assert.ok(Math.abs(result.monthlyProfit / result.monthlyPrice * 100 - 20) < 1e-9);
  assert.ok(Math.abs(result.annualPrice - result.monthlyPrice * 12) < 1e-9);
});

test('sanity ratios land in the range a contractor recognises', () => {
  const result = calculateBid(office());
  assert.ok(result.pricePerSqFtMonth > 0.1 && result.pricePerSqFtMonth < 0.3);
  assert.ok(result.effectiveHourlyRate > 25 && result.effectiveHourlyRate < 45);
  assert.equal(result.breakEvenMonthlyPrice, result.monthlyCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...office(), targetMargin: 0 });
  assert.ok(Math.abs(result.monthlyPrice - result.monthlyCost) < 1e-9);
  assert.ok(Math.abs(result.monthlyProfit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(office());
  const scored = calculateBid({ ...office(), proposedPrice: bid.monthlyPrice });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(office());
  const scored = calculateBid({ ...office(), proposedPrice: bid.monthlyCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(office()).proposed, null);
  assert.equal(calculateBid({ ...office(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...office(), proposedPrice: null }).proposed, null);
  // Zero is a real answer ("they want it for free"), not an absent one.
  assert.equal(calculateBid({ ...office(), proposedPrice: 0 }).proposed.price, 0);
});

test('frequency scales monthly hours but never the one-visit figure', () => {
  const daily = calculateBid(office());
  const weekly = calculateBid({
    ...office(),
    areas: office().areas.map(a => ({ ...a, cleaningsPerWeek: 1 })),
  });
  assert.equal(weekly.hoursPerVisitTotal, daily.hoursPerVisitTotal);
  assert.ok(Math.abs(weekly.monthlyHours * 5 - daily.monthlyHours) < 1e-9);
});

test('an area cleaned zero times a week costs nothing and is left out of the visit', () => {
  const input = office();
  input.areas.push({ name: 'Vacant wing', squareFeet: 3000, productionRate: 4000, cleaningsPerWeek: 0 });
  const result = calculateBid(input);
  const vacant = result.areas.find(a => a.name === 'Vacant wing');
  assert.equal(vacant.monthlyHours, 0);
  assert.equal(vacant.monthlyLaborCost, 0);
  assert.ok(Math.abs(result.hoursPerVisitTotal - 2.4) < 1e-9);
  // Supplies still follow the floor area, since the space is in the contract.
  assert.equal(result.totalSquareFeet, 11000);
});

test('a nameless area still reports under a stable label', () => {
  const result = calculateBid({
    ...office(),
    areas: [{ squareFeet: 1000, productionRate: 2000, cleaningsPerWeek: 5 }, { name: '   ', squareFeet: 500, productionRate: 2000, cleaningsPerWeek: 5 }],
  });
  assert.equal(result.areas[0].name, 'Area 1');
  assert.equal(result.areas[1].name, 'Area 2');
});

test('a building with no cleanable area reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateBid({
    ...office(),
    areas: [{ name: 'Empty', squareFeet: 0, productionRate: 4000, cleaningsPerWeek: 5 }],
    equipmentMonthly: 100,
  });
  assert.equal(result.monthlyHours, 0);
  assert.equal(result.pricePerSqFtMonth, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.equal(result.areas[0].hoursShare, 0);
  // A minimum-call-out job still has a price: equipment and overhead remain.
  assert.ok(result.monthlyPrice > 100);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...office(), areas: [] }), /at least one area/);
  assert.throws(
    () => calculateBid({ ...office(), areas: [{ name: 'Lobby', squareFeet: 100, productionRate: 0, cleaningsPerWeek: 5 }] }),
    /Lobby: production rate must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({ ...office(), areas: [{ name: 'Lobby', squareFeet: -5, productionRate: 4000, cleaningsPerWeek: 5 }] }),
    /Lobby: cleanable square feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...office(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...office(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...office(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('production-rate presets are usable positive numbers', () => {
  assert.ok(PRODUCTION_RATE_PRESETS.length >= 8);
  for (const preset of PRODUCTION_RATE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.rate) && preset.rate > 0);
  }
});

test('monthly conversion uses averaged weeks, not a flat four', () => {
  assert.ok(Math.abs(WEEKS_PER_MONTH - 52 / 12) < 1e-12);
  assert.ok(WEEKS_PER_MONTH > 4.3);
});

test('omitted project work leaves the monthly contract unchanged', () => {
  const without = calculateBid(office());
  const empty = calculateBid({ ...office(), projects: [] });
  assert.equal(without.hasProjectWork, false);
  assert.equal(empty.hasProjectWork, false);
  assert.equal(without.monthlyPrice, empty.monthlyPrice);
  assert.equal(without.projectPrice, 0);
  assert.equal(without.firstMonthInvoice, without.monthlyPrice);
  assert.equal(without.breakEvenFirstMonth, without.monthlyCost);
});

test('strip and wax hours are square feet divided by rate times coats', () => {
  const result = calculateBid({
    ...office(),
    projects: [{
      name: 'Strip & wax (VCT)',
      squareFeet: 2000,
      productionRate: 250,
      passes: 2,
      materials: 80,
    }],
  });
  const line = result.projects[0];
  assert.ok(Math.abs(line.hours - 16) < 1e-9);
  assert.ok(Math.abs(line.laborCost - 16 * result.loadedWage) < 1e-9);
  assert.equal(line.materials, 80);
  assert.ok(result.hasProjectWork);
  assert.ok(Math.abs(result.projectHours - 16) < 1e-9);
  // Same margin-on-price rule as the monthly contract, applied only to the
  // one-time work — not amortized into the eleven months that follow.
  assert.ok(Math.abs(result.projectProfit / result.projectPrice * 100 - 20) < 1e-9);
  assert.ok(Math.abs(result.firstMonthInvoice - (result.monthlyPrice + result.projectPrice)) < 1e-9);
  assert.ok(result.projectPrice > 80);
});

test('project work does not change the recurring monthly price', () => {
  const monthlyOnly = calculateBid(office());
  const withProject = calculateBid({
    ...office(),
    projects: [{ name: 'Carpet extraction', squareFeet: 1500, productionRate: 300, passes: 1, materials: 40 }],
  });
  assert.ok(Math.abs(withProject.monthlyPrice - monthlyOnly.monthlyPrice) < 1e-9);
  assert.ok(Math.abs(withProject.annualPrice - monthlyOnly.annualPrice) < 1e-9);
  assert.ok(withProject.firstMonthInvoice > withProject.monthlyPrice);
  assert.ok(withProject.breakEvenFirstMonth > withProject.breakEvenMonthlyPrice);
});

test('a zero-area project with no materials is idle, not an error', () => {
  const result = calculateBid({
    ...office(),
    projects: [{ name: 'Not yet scoped', squareFeet: 0, productionRate: 250, passes: 2, materials: 0 }],
  });
  assert.equal(result.hasProjectWork, false);
  assert.equal(result.projectHours, 0);
  assert.equal(result.projectPrice, 0);
});

test('materials-only project work still prices and is flagged', () => {
  const result = calculateBid({
    ...office(),
    projects: [{ name: 'Extra chemical charge', squareFeet: 0, productionRate: 250, passes: 1, materials: 120 }],
  });
  assert.equal(result.hasProjectWork, true);
  assert.equal(result.projectHours, 0);
  assert.ok(result.projectPrice > 120);
});

test('zero passes means no labor hours on that project', () => {
  const result = calculateBid({
    ...office(),
    projects: [{ name: 'Hold finish', squareFeet: 2000, productionRate: 250, passes: 0, materials: 10 }],
  });
  assert.equal(result.projects[0].hours, 0);
  assert.equal(result.projects[0].laborCost, 0);
  assert.equal(result.hasProjectWork, true);
});

test('project inputs that would produce a nonsense price are rejected', () => {
  assert.throws(
    () => calculateBid({
      ...office(),
      projects: [{ name: 'Strip', squareFeet: 1000, productionRate: 0, passes: 2 }],
    }),
    /Strip: project production rate must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({
      ...office(),
      projects: [{ name: 'Strip', squareFeet: -1, productionRate: 250 }],
    }),
    /Strip: project square feet must be at least 0/,
  );
  assert.throws(
    () => calculateBid({
      ...office(),
      projects: [{ name: 'Strip', squareFeet: 1000, productionRate: 250, passes: -1 }],
    }),
    /Strip: passes must be at least 0/,
  );
});

test('a nameless project still reports under a stable label', () => {
  const result = calculateBid({
    ...office(),
    projects: [{ squareFeet: 500, productionRate: 250, passes: 1, materials: 0 }],
  });
  assert.equal(result.projects[0].name, 'Project 1');
});

test('project-rate presets are usable positive numbers', () => {
  assert.ok(PROJECT_RATE_PRESETS.length >= 4);
  for (const preset of PROJECT_RATE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.rate) && preset.rate > 0);
    assert.ok(Number.isFinite(preset.passes) && preset.passes >= 1);
  }
});

test('bid summary keeps one-time work out of the monthly line', () => {
  const result = calculateBid({
    ...office(),
    projects: [{ name: 'Strip & wax (VCT)', squareFeet: 2000, productionRate: 250, passes: 2, materials: 80 }],
  });
  const text = formatBidSummary(result);
  assert.match(text, /Proposed monthly service:/);
  assert.match(text, /ONE-TIME PROJECT WORK/);
  assert.match(text, /Strip & wax \(VCT\)/);
  assert.match(text, /First-month invoice/);
  assert.match(text, /SERVICE AREAS/);
  assert.match(text, /Open office/);
  assert.doesNotMatch(text, /undefined/);
});

test('bid summary omits the project block when there is no project work', () => {
  const text = formatBidSummary(calculateBid(office()));
  assert.doesNotMatch(text, /ONE-TIME PROJECT WORK/);
  assert.doesNotMatch(text, /First-month invoice/);
});
