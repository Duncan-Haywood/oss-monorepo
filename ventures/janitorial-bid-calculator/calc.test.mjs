import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  compareFrequencyReduction,
  frequencyReductionNote,
  compareSupplyResponsibility,
  supplyResponsibilityNote,
  compareInitialClean,
  initialCleanNote,
  WEEKS_PER_MONTH,
  PRODUCTION_RATE_PRESETS,
  PROJECT_RATE_PRESETS,
  SHIFT_ROLE_PRESETS,
} from './calc.mjs';

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

test('a minimum monthly price protects small accounts without lowering the target price', () => {
  const bid = calculateBid(office());
  const floored = calculateBid({ ...office(), minimumMonthlyPrice: bid.monthlyPrice + 250 });
  assert.equal(floored.minimumMonthlyPrice, bid.monthlyPrice + 250);
  assert.equal(floored.minimumPriceApplied, true);
  assert.equal(floored.monthlyPrice, bid.monthlyPrice + 250);
  assert.ok(floored.monthlyProfit > bid.monthlyProfit);
  assert.match(formatBidSummary(floored), /Minimum charge floor applied/);

  const lowerFloor = calculateBid({ ...office(), minimumMonthlyPrice: bid.monthlyPrice - 250 });
  assert.equal(lowerFloor.minimumPriceApplied, false);
  assert.equal(lowerFloor.monthlyPrice, bid.monthlyPrice);
  assert.doesNotMatch(formatBidSummary(lowerFloor), /Minimum charge floor applied/);
});

test('an empty minimum monthly price leaves the margin calculation unchanged', () => {
  const bid = calculateBid(office());
  const empty = calculateBid({ ...office(), minimumMonthlyPrice: '' });
  assert.equal(empty.minimumMonthlyPrice, null);
  assert.equal(empty.monthlyPrice, bid.monthlyPrice);
});

test('turns labor hours into a per-visit crew capacity check', () => {
  const result = calculateBid({ ...office(), crewSize: 2, shiftHours: 1.5 });
  assert.equal(result.visitCapacityHours, 3);
  assert.ok(Math.abs(result.visitUtilization - 80) < 1e-9);
  assert.equal(result.visitOverCapacity, false);

  const overloaded = calculateBid({ ...office(), crewSize: 1, shiftHours: 2 });
  assert.ok(overloaded.visitUtilization > 100);
  assert.equal(overloaded.visitOverCapacity, true);
});

test('rejects invalid crew capacity inputs', () => {
  assert.throws(() => calculateBid({ ...office(), crewSize: 0 }), /Crew size must be greater than zero/);
  assert.throws(() => calculateBid({ ...office(), crewSize: 1.5 }), /Crew size must be a whole number/);
  assert.throws(() => calculateBid({ ...office(), shiftHours: 0 }), /Available hours per cleaner must be greater than zero/);
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

test('a custom Other-space name is what the labor split reports', () => {
  const result = calculateBid({
    ...office(),
    areas: [
      { name: 'Server room', squareFeet: 200, productionRate: 1500, cleaningsPerWeek: 5 },
      { name: 'Loading dock', squareFeet: 800, productionRate: 6000, cleaningsPerWeek: 3 },
    ],
  });
  assert.equal(result.areas[0].name, 'Server room');
  assert.equal(result.areas[1].name, 'Loading dock');
  assert.ok(result.areas[0].hoursShare > 0);
});

test('a nameless area still reports under a stable label', () => {
  const result = calculateBid({
    ...office(),
    areas: [{ squareFeet: 1000, productionRate: 2000, cleaningsPerWeek: 5 }, { name: '   ', squareFeet: 500, productionRate: 2000, cleaningsPerWeek: 5 }],
  });
  assert.equal(result.areas[0].name, 'Area 1');
  assert.equal(result.areas[1].name, 'Area 2');
});

test('custom area names are preserved for proposal-ready scope', () => {
  const result = calculateBid({
    ...office(),
    areas: [{ name: 'Second-floor restrooms', squareFeet: 500, productionRate: 1200, cleaningsPerWeek: 5 }],
  });
  assert.equal(result.areas[0].name, 'Second-floor restrooms');
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
  assert.throws(() => calculateBid({ ...office(), minimumMonthlyPrice: -1 }), /Minimum monthly price must be at least 0/);
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

test('periodic work is averaged into monthly cost and annual contract value', () => {
  const baseline = calculateBid(office());
  const result = calculateBid({
    ...office(),
    periodicServices: [{ name: 'Quarterly floor care', costPerOccurrence: 1200, occurrencesPerYear: 4 }],
  });
  assert.equal(result.monthlyPeriodicCost, 400);
  assert.equal(result.annualPeriodicCost, 4800);
  assert.ok(Math.abs(result.monthlyCost - (baseline.monthlyCost + 400 * 1.15)) < 1e-9);
  assert.equal(result.periodicServices[0].name, 'Quarterly floor care');
  assert.equal(result.hasPeriodicWork, true);
});

test('multiple periodic services aggregate and validate their inputs', () => {
  const result = calculateBid({
    ...office(),
    periodicServices: [
      { costPerOccurrence: 600, occurrencesPerYear: 12 },
      { name: 'Annual extraction', costPerOccurrence: 1800, occurrencesPerYear: 1 },
    ],
  });
  assert.equal(result.periodicServices[0].name, 'Periodic service 1');
  assert.equal(result.monthlyPeriodicCost, 750);
  assert.throws(
    () => calculateBid({ ...office(), periodicServices: [{ costPerOccurrence: -1, occurrencesPerYear: 1 }] }),
    /cost per occurrence/,
  );
  assert.throws(
    () => calculateBid({ ...office(), periodicServices: [{ costPerOccurrence: 1, occurrencesPerYear: 'nope' }] }),
    /occurrences per year/,
  );
});

test('bid summary lists periodic work separately from one-time projects', () => {
  const text = formatBidSummary(calculateBid({
    ...office(),
    periodicServices: [{ name: 'Quarterly floor care', costPerOccurrence: 1200, occurrencesPerYear: 4 }],
  }));
  assert.match(text, /PERIODIC SERVICES \(MONTHLY AVERAGE\)/);
  assert.match(text, /Quarterly floor care/);
  assert.doesNotMatch(text, /ONE-TIME PROJECT WORK/);
});

test('a 5× to 3× cut scales labor and leaves supplies and equipment on the job', () => {
  const comparison = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  assert.equal(comparison.reductionFactor, 0.6);
  assert.ok(Math.abs(comparison.reduced.monthlyHours - comparison.baseline.monthlyHours * 0.6) < 1e-9);
  assert.ok(Math.abs(comparison.reduced.monthlyLaborCost - comparison.baseline.monthlyLaborCost * 0.6) < 1e-9);
  assert.equal(comparison.suppliesUnchanged, true);
  assert.equal(comparison.equipmentUnchanged, true);
  assert.ok(Math.abs(comparison.reduced.monthlySupplies - comparison.baseline.monthlySupplies) < 1e-9);
  assert.ok(Math.abs(comparison.unscaledMonthly - (40 + 25)) < 1e-9);
  // Hours per visit stay the same — the crew still cleans the same building.
  assert.equal(comparison.reduced.hoursPerVisitTotal, comparison.baseline.hoursPerVisitTotal);
});

test('a linear 60% of the 5× price is not the 3× price that holds the target margin', () => {
  const comparison = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  assert.ok(Math.abs(comparison.naiveLinearPrice - comparison.baseline.monthlyPrice * 0.6) < 1e-9);
  // Fixed costs mean the correct 3× price is higher than 60% of the 5× price.
  assert.ok(comparison.priceToHoldTargetMargin > comparison.naiveLinearPrice);
  assert.ok(comparison.leftOnTable > 0);
  assert.ok(Math.abs(comparison.reduced.monthlyProfit / comparison.reduced.monthlyPrice * 100 - 20) < 1e-9);
  assert.ok(comparison.naiveMargin < 20);
  assert.equal(comparison.naiveBelowBreakEven, false);
});

test('high travel cost makes a linear 40% cut a losing bid', () => {
  const comparison = compareFrequencyReduction(
    { ...office(), equipmentMonthly: 800 },
    { currentWeekly: 5, proposedWeekly: 3 },
  );
  assert.equal(comparison.naiveBelowBreakEven, true);
  assert.ok(comparison.naiveProfit < 0);
  assert.ok(comparison.walkAwayAtReduced > comparison.naiveLinearPrice);
  assert.ok(comparison.priceToHoldTargetMargin > comparison.walkAwayAtReduced);
});

test('mixed area frequencies stay proportional when the building drops a day', () => {
  const input = {
    ...office(),
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 3 },
    ],
  };
  const comparison = compareFrequencyReduction(input, { currentWeekly: 5, proposedWeekly: 3 });
  const officeArea = comparison.reduced.areas.find(a => a.name === 'Open office');
  const restrooms = comparison.reduced.areas.find(a => a.name === 'Restrooms');
  assert.ok(Math.abs(officeArea.cleaningsPerWeek - 3) < 1e-9);
  assert.ok(Math.abs(restrooms.cleaningsPerWeek - 1.8) < 1e-9);
});

test('building-level currentWeekly wins when area rows still show a different week', () => {
  // Contractor typed 5→3 on the comparison, but left every area row at 3.
  // Baseline labor must be the 5-day building, not the leftover 3-day rows.
  const threeDayRows = {
    ...office(),
    areas: office().areas.map(area => ({ ...area, cleaningsPerWeek: 3 })),
  };
  const aligned = compareFrequencyReduction(threeDayRows, { currentWeekly: 5, proposedWeekly: 3 });
  const matching = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  assert.ok(Math.abs(aligned.baseline.monthlyHours - matching.baseline.monthlyHours) < 1e-9);
  assert.ok(Math.abs(aligned.reduced.monthlyHours - matching.reduced.monthlyHours) < 1e-9);
  assert.ok(Math.abs(aligned.priceToHoldTargetMargin - matching.priceToHoldTargetMargin) < 1e-9);
  assert.ok(Math.abs(aligned.baseline.monthlyHours - aligned.reduced.monthlyHours / 0.6) < 1e-6);
});

test('an optional client offer is scored against the reduced cost, not the 5× cost', () => {
  const fiveDay = calculateBid(office());
  const comparison = compareFrequencyReduction(office(), {
    currentWeekly: 5,
    proposedWeekly: 3,
    clientOfferMonthly: fiveDay.monthlyPrice * 0.6,
  });
  assert.ok(comparison.clientOffer);
  assert.ok(Math.abs(comparison.clientOffer.price - comparison.naiveLinearPrice) < 1e-9);
  assert.ok(Math.abs(comparison.clientOffer.profit - comparison.naiveProfit) < 1e-9);
});

test('the same schedule compares as a no-op rather than a fake discount', () => {
  const comparison = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 5 });
  assert.equal(comparison.reductionFactor, 1);
  assert.ok(Math.abs(comparison.leftOnTable) < 1e-9);
  assert.ok(Math.abs(comparison.laborHoursDropped) < 1e-9);
  assert.ok(Math.abs(comparison.naiveLinearPrice - comparison.baseline.monthlyPrice) < 1e-9);
});

test('a zero proposed week is a shutdown, not a free contract', () => {
  const comparison = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 0 });
  assert.equal(comparison.reduced.monthlyHours, 0);
  assert.equal(comparison.naiveLinearPrice, 0);
  assert.equal(comparison.naiveBelowBreakEven, true);
  // Supplies and equipment remain, so the walk-away is not zero.
  assert.ok(comparison.walkAwayAtReduced > 0);
});

test('frequency comparison rejects a zero current week rather than dividing by zero', () => {
  assert.throws(
    () => compareFrequencyReduction(office(), { currentWeekly: 0, proposedWeekly: 3 }),
    /Current cleanings per week must be greater than zero/,
  );
  assert.throws(
    () => compareFrequencyReduction(office(), { currentWeekly: 'often', proposedWeekly: 3 }),
    /Current cleanings per week must be a number/,
  );
});

test('the pasteable note names the true 3× price and the linear mistake', () => {
  const comparison = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  const note = frequencyReductionNote(comparison, { targetMargin: 20 });
  assert.match(note, /3×\/week/);
  assert.match(note, /\$1,069\.37/);
  assert.match(note, /not a linear cut/);
  assert.match(note, /Supplies, equipment, and travel stay on the job/);
  assert.match(note, /\$1,032\.00/);
  const losing = compareFrequencyReduction(
    { ...office(), equipmentMonthly: 800 },
    { currentWeekly: 5, proposedWeekly: 3 },
  );
  const warning = frequencyReductionNote(losing, { targetMargin: 20 });
  assert.match(warning, /would lose/);
  assert.match(warning, /Walk-away/);
});

test('they-buy-restroom-stock drops only that share of supplies and leaves labor alone', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 35,
  });
  assert.ok(Math.abs(comparison.restroomSuppliesMonthly - 26) < 1e-9);
  assert.ok(Math.abs(comparison.chemicalSuppliesMonthly - 14) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyRestroom.monthlySupplies - 14) < 1e-9);
  assert.equal(comparison.theyBuyAll.monthlySupplies, 0);
  assert.equal(comparison.theyBuyRestroom.monthlyHours, comparison.youSupply.monthlyHours);
  assert.equal(comparison.theyBuyAll.monthlyHours, comparison.youSupply.monthlyHours);
  assert.equal(comparison.theyBuyButYouFill.monthlyHours, comparison.youSupply.monthlyHours);
  assert.equal(comparison.theyBuyRestroom.equipmentMonthly, comparison.youSupply.equipmentMonthly);
});

test('dropping the whole supplies line is the they-buy-everything price, not the restroom-only price', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 35,
  });
  // $40 supplies × 1.15 overhead / 0.80 margin = $57.50 of today's price.
  assert.ok(Math.abs(comparison.suppliesInPrice - 57.5) < 1e-9);
  assert.ok(Math.abs(comparison.naiveDropPrice - comparison.theyBuyAll.monthlyPrice) < 1e-9);
  assert.ok(comparison.theyBuyRestroom.monthlyPrice > comparison.theyBuyAll.monthlyPrice);
  assert.ok(comparison.theyBuyRestroom.monthlyPrice < comparison.youSupply.monthlyPrice);
  assert.ok(Math.abs(comparison.leftoverIfTheyBuyRestroom - 37.375) < 1e-9);
  assert.ok(Math.abs(comparison.youSupply.monthlyPrice - 1719.9975) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyRestroom.monthlyPrice - 1682.6225) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyAll.monthlyPrice - 1662.4975) < 1e-9);
});

test('emergency-fill after they run out can cost more than you-supplying', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 35,
  });
  assert.equal(comparison.fillCostsMoreThanYouSupply, true);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlyPrice - 1732.935) < 1e-9);
  assert.ok(Math.abs(comparison.fillPremiumVsYouSupply - 12.9375) < 1e-9);
  // Chemicals stay; the $35 fill is layered on other monthly cost.
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlySupplies - 14) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.otherMonthly - 35) < 1e-9);
  assert.ok(comparison.naiveMarginAtFill < comparison.naiveMarginAtRestroom);
  assert.ok(comparison.naiveMarginAtRestroom < 20);
});

test('a zero emergency fill makes the fill row the same as they-buy-restroom', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 0,
  });
  assert.equal(comparison.fillCostsMoreThanYouSupply, false);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlyPrice - comparison.theyBuyRestroom.monthlyPrice) < 1e-9);
  assert.ok(Math.abs(comparison.fillPremiumVsYouSupply - (comparison.theyBuyRestroom.monthlyPrice - comparison.youSupply.monthlyPrice)) < 1e-9);
});

test('a 100% restroom share is they-buy-everything; a 0% share is you-supply', () => {
  const allRestroom = compareSupplyResponsibility(office(), { restroomSharePercent: 100 });
  assert.ok(Math.abs(allRestroom.theyBuyRestroom.monthlyPrice - allRestroom.theyBuyAll.monthlyPrice) < 1e-9);
  assert.equal(allRestroom.chemicalSuppliesMonthly, 0);
  const none = compareSupplyResponsibility(office(), { restroomSharePercent: 0 });
  assert.ok(Math.abs(none.theyBuyRestroom.monthlyPrice - none.youSupply.monthlyPrice) < 1e-9);
  assert.ok(Math.abs(none.restroomSuppliesMonthly) < 1e-9);
});

test('their drop-supplies offer is scored against the cost you still carry', () => {
  const you = calculateBid(office());
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 35,
    clientOfferMonthly: you.monthlyPrice - 57.5,
  });
  assert.ok(comparison.clientOfferRestroom);
  assert.ok(Math.abs(comparison.clientOfferRestroom.price - comparison.naiveDropPrice) < 1e-9);
  assert.ok(Math.abs(comparison.clientOfferRestroom.profit - comparison.naiveProfitAtRestroom) < 1e-9);
  assert.ok(Math.abs(comparison.clientOfferFill.profit - comparison.naiveProfitAtFill) < 1e-9);
  assert.equal(comparison.clientOfferAll.belowBreakEven, false);
});

test('a large emergency fill makes dropping the supplies line a losing bid', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 300,
  });
  assert.equal(comparison.naiveBelowBreakEvenAtFill, true);
  assert.ok(comparison.naiveProfitAtFill < 0);
  assert.ok(comparison.theyBuyButYouFill.breakEvenMonthlyPrice > comparison.naiveDropPrice);
});

test('supply comparison rejects a restroom share above 100 rather than inventing a credit', () => {
  assert.throws(
    () => compareSupplyResponsibility(office(), { restroomSharePercent: 140 }),
    /Restroom stock share of supplies must be at most 100/,
  );
  assert.throws(
    () => compareSupplyResponsibility(office(), { restroomSharePercent: 'most' }),
    /Restroom stock share of supplies must be a number/,
  );
  assert.throws(
    () => compareSupplyResponsibility(office(), { emergencyFillMonthly: -1 }),
    /Emergency fill when they run out must be at least 0/,
  );
});

test('the pasteable supplies note names the restroom-only price and the emergency-fill trap', () => {
  const comparison = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 35,
  });
  const note = supplyResponsibilityNote(comparison, { targetMargin: 20 });
  assert.match(note, /\$26\.00/);
  assert.match(note, /\$14\.00/);
  assert.match(note, /\$1,682\.62/);
  assert.match(note, /\$1,720\.00/);
  assert.match(note, /\$1,662\.50/);
  assert.match(note, /\$1,732\.94/);
  assert.match(note, /above you-supplying/);
  const losing = compareSupplyResponsibility(office(), {
    restroomSharePercent: 65,
    emergencyFillMonthly: 300,
  });
  const warning = supplyResponsibilityNote(losing, { targetMargin: 20 });
  assert.match(warning, /would lose/);
});

test('a 5× takeover initial is extra labor and supplies, not another month of the contract', () => {
  const monthly = calculateBid(office());
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    amortizeMonths: 12,
    cancelAfterMonths: 1,
  });
  assert.ok(Math.abs(comparison.hoursPerVisit - 2.4) < 1e-9);
  assert.ok(Math.abs(comparison.initialHours - 12) < 1e-9);
  assert.ok(Math.abs(comparison.initialLabor - 12 * monthly.loadedWage) < 1e-9);
  assert.ok(Math.abs(comparison.initialDirect - (comparison.initialLabor + 80)) < 1e-9);
  assert.ok(Math.abs(comparison.initialOverhead - comparison.initialDirect * 0.15) < 1e-9);
  assert.ok(Math.abs(comparison.initialCost - comparison.initialDirect * 1.15) < 1e-9);
  assert.ok(Math.abs(comparison.initialPrice - comparison.initialCost / 0.8) < 1e-9);
  assert.equal(comparison.monthly.monthlyHours, monthly.monthlyHours);
  assert.ok(Math.abs(comparison.monthly.monthlyPrice - monthly.monthlyPrice) < 1e-9);
});

test('throwing a 5× initial into today\'s monthly loses money in month 1', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    amortizeMonths: 12,
    cancelAfterMonths: 1,
  });
  assert.equal(comparison.thrownInBelowBreakEven, true);
  assert.ok(comparison.thrownInMonth1Profit < 0);
  assert.ok(comparison.walkAwayMonth1 > comparison.monthly.monthlyPrice);
  assert.ok(Math.abs(comparison.thrownInMonth1Cost - (comparison.monthly.monthlyCost + comparison.initialCost)) < 1e-9);
  // Locked worked example used by the SEO page.
  assert.ok(Math.abs(comparison.monthly.monthlyPrice - 1719.9975) < 1e-9);
  assert.ok(Math.abs(comparison.initialPrice - 490.36) < 0.005);
  assert.ok(Math.abs(comparison.thrownInMonth1Profit + 48.288) < 0.01);
  assert.ok(Math.abs(comparison.amortizedMonthlyPrice - 1760.860833333) < 0.01);
  assert.ok(Math.abs(comparison.amortizedAddOn - 40.863333) < 0.01);
});

test('amortizing the initial over 12 months is a small add-on, not a doubled month', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    amortizeMonths: 12,
  });
  assert.ok(comparison.amortizedAddOn > 0);
  assert.ok(comparison.amortizedAddOn < comparison.initialPrice);
  assert.ok(comparison.amortizedMonthlyPrice < comparison.monthly.monthlyPrice + comparison.initialPrice);
  assert.ok(Math.abs(comparison.amortizedMonthlyCost - (comparison.monthly.monthlyCost + comparison.initialCost / 12)) < 1e-9);
  // Same target margin on the combined cost.
  assert.ok(Math.abs((comparison.amortizedMonthlyPrice - comparison.amortizedMonthlyCost) / comparison.amortizedMonthlyPrice * 100 - 20) < 1e-9);
});

test('a 30-day cancel after a free initial finishes under water', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    cancelAfterMonths: 1,
  });
  assert.ok(comparison.thrownInCashIfCancel < 0);
  assert.ok(comparison.quotedSeparatelyCashIfCancel > 0);
  // Throwing it in vs invoicing it costs the one-time price, regardless of tenure.
  assert.ok(Math.abs(comparison.giveawayVsQuotedIfCancel + comparison.initialPrice) < 1e-9);
  assert.ok(Math.abs(comparison.thrownInCashIfCancel - (comparison.monthly.monthlyProfit - comparison.initialCost)) < 1e-9);
});

test('a 12-month stay still leaves the giveaway equal to the unpaid one-time', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    cancelAfterMonths: 12,
  });
  assert.ok(comparison.thrownInCashIfCancel > 0);
  assert.ok(Math.abs(comparison.giveawayVsQuotedIfCancel + comparison.initialPrice) < 1e-9);
  assert.ok(comparison.monthsOfProfitToCoverGiveaway > 1);
  assert.ok(comparison.monthsOfProfitToCoverGiveaway < 2);
});

test('a 2× maintained-building initial still prices as a project, not as free', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 2,
    extraSupplies: 20,
  });
  assert.ok(Math.abs(comparison.initialHours - 4.8) < 1e-9);
  assert.equal(comparison.thrownInBelowBreakEven, false);
  assert.ok(comparison.thrownInMonth1Profit > 0);
  assert.ok(comparison.thrownInMonth1Margin < 20);
  assert.ok(comparison.initialPrice > 0);
});

test('their include-the-initial monthly is scored against month-1 cost, not the periodic cost', () => {
  const monthly = calculateBid(office());
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    clientOfferMonthly: monthly.monthlyPrice,
  });
  assert.ok(comparison.clientOffer);
  assert.equal(comparison.clientOffer.belowBreakEvenMonth1, true);
  assert.ok(Math.abs(comparison.clientOffer.month1Profit - comparison.thrownInMonth1Profit) < 1e-9);
  assert.equal(comparison.clientOffer.laterBelowBreakEven, false);
  assert.ok(Math.abs(comparison.clientOffer.laterProfit - monthly.monthlyProfit) < 1e-9);
});

test('initial-clean comparison rejects a zero multiplier rather than a free project', () => {
  assert.throws(
    () => compareInitialClean(office(), { visitMultiplier: 0 }),
    /Initial-clean visit multiplier must be greater than zero/,
  );
  assert.throws(
    () => compareInitialClean(office(), { amortizeMonths: 0 }),
    /Months to recover the initial must be greater than zero/,
  );
  assert.throws(
    () => compareInitialClean(office(), { cancelAfterMonths: 0 }),
    /If they cancel after this many months must be greater than zero/,
  );
  assert.throws(
    () => compareInitialClean(office(), { extraSupplies: -1 }),
    /Extra initial-clean supplies must be at least 0/,
  );
  assert.throws(
    () => compareInitialClean(office(), { visitMultiplier: 'deep' }),
    /Initial-clean visit multiplier must be a number/,
  );
});

test('the pasteable initial-clean note names the one-time and the month-1 loss', () => {
  const comparison = compareInitialClean(office(), {
    visitMultiplier: 5,
    extraSupplies: 80,
    amortizeMonths: 12,
    cancelAfterMonths: 1,
  });
  const note = initialCleanNote(comparison, { targetMargin: 20 });
  assert.match(note, /\$490\.36/);
  assert.match(note, /\$1,720\.00/);
  assert.match(note, /loses \$48\.29/);
  assert.match(note, /\$1,760\.86/);
  assert.match(note, /under water/);
  const easy = compareInitialClean(office(), { visitMultiplier: 2, extraSupplies: 20 });
  const easyNote = initialCleanNote(easy, { targetMargin: 20 });
  assert.match(easyNote, /leaves \$/);
  assert.doesNotMatch(easyNote, /loses \$/);
});

const weekdayPorter = () => ({
  name: 'Day porter / lobby attendant',
  people: 1,
  hoursPerShift: 8,
  shiftsPerWeek: 5,
});

test('omitting shifts leaves the production-rate bid unchanged', () => {
  const without = calculateBid(office());
  const empty = calculateBid({ ...office(), shifts: [] });
  assert.deepEqual(empty.shifts, []);
  assert.equal(empty.shiftMonthlyHours, 0);
  assert.equal(empty.shiftMonthlyLaborCost, 0);
  assert.equal(empty.monthlyPrice, without.monthlyPrice);
  assert.equal(empty.monthlyHours, without.monthlyHours);
  assert.equal(empty.areaMonthlyHours, without.monthlyHours);
});

test('a weekday day porter is priced as scheduled coverage, not square feet', () => {
  const production = calculateBid(office());
  const withPorter = calculateBid({ ...office(), shifts: [weekdayPorter()] });
  const expectedHours = 1 * 8 * 5 * WEEKS_PER_MONTH;
  assert.ok(Math.abs(withPorter.shiftMonthlyHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(withPorter.areaMonthlyHours - production.monthlyHours) < 1e-9);
  assert.ok(Math.abs(withPorter.monthlyHours - (production.monthlyHours + expectedHours)) < 1e-9);
  assert.ok(Math.abs(withPorter.shiftMonthlyLaborCost - expectedHours * 17 * 1.28) < 1e-9);
  assert.equal(withPorter.hoursPerVisitTotal, production.hoursPerVisitTotal);
  assert.ok(withPorter.monthlyPrice > production.monthlyPrice);
  const porter = withPorter.shifts[0];
  assert.ok(porter.hoursShare > 70);
  assert.ok(porter.hoursShare < 90);
});

test('day-porter hours are not amortized into a cheaper monthly production rate', () => {
  const production = calculateBid(office());
  const withPorter = calculateBid({ ...office(), shifts: [weekdayPorter()] });
  assert.ok(Math.abs(withPorter.areaMonthlyLaborCost - production.monthlyLaborCost) < 1e-9);
  assert.ok(withPorter.shiftMonthlyLaborCost > 0);
});

test('a porter-only contract can be priced without production areas', () => {
  const result = calculateBid({
    ...office(),
    areas: [],
    shifts: [weekdayPorter()],
    suppliesPerSqFtMonth: 0.005,
  });
  assert.equal(result.areas.length, 0);
  assert.equal(result.totalSquareFeet, 0);
  assert.equal(result.hoursPerVisitTotal, 0);
  assert.equal(result.pricePerSqFtMonth, null);
  assert.ok(Math.abs(result.monthlyHours - 8 * 5 * WEEKS_PER_MONTH) < 1e-9);
  assert.ok(result.monthlyPrice > 0);
  assert.equal(result.shifts[0].name, 'Day porter / lobby attendant');
});

test('a shift can use its own wage when the porter is paid more than the night crew', () => {
  const same = calculateBid({ ...office(), shifts: [weekdayPorter()] });
  const higher = calculateBid({
    ...office(),
    shifts: [{ ...weekdayPorter(), hourlyWage: 20 }],
  });
  assert.equal(same.shifts[0].hourlyWage, 17);
  assert.equal(higher.shifts[0].hourlyWage, 20);
  assert.ok(Math.abs(higher.shifts[0].loadedWage - 20 * 1.28) < 1e-9);
  assert.ok(higher.shiftMonthlyLaborCost > same.shiftMonthlyLaborCost);
  assert.equal(higher.areaMonthlyLaborCost, same.areaMonthlyLaborCost);
});

test('blank or omitted shift wages fall back to the contract cleaner wage', () => {
  const fallback = calculateBid({
    ...office(),
    shifts: [
      { ...weekdayPorter(), hourlyWage: '' },
      { ...weekdayPorter(), name: 'Floater', hourlyWage: null },
    ],
  });
  assert.equal(fallback.shifts[0].hourlyWage, 17);
  assert.equal(fallback.shifts[1].hourlyWage, 17);
});

test('two people on the same shift double the hours', () => {
  const one = calculateBid({ ...office(), shifts: [weekdayPorter()] });
  const two = calculateBid({
    ...office(),
    shifts: [{ ...weekdayPorter(), people: 2 }],
  });
  assert.ok(Math.abs(two.shiftMonthlyHours - one.shiftMonthlyHours * 2) < 1e-9);
});

test('a nameless shift still reports under a stable label', () => {
  const result = calculateBid({
    ...office(),
    shifts: [{ people: 1, hoursPerShift: 4, shiftsPerWeek: 5 }, { name: '   ', people: 1, hoursPerShift: 4, shiftsPerWeek: 3 }],
  });
  assert.equal(result.shifts[0].name, 'Shift 1');
  assert.equal(result.shifts[1].name, 'Shift 2');
});

test('a zero-hour or zero-headcount shift costs nothing', () => {
  const result = calculateBid({
    ...office(),
    shifts: [
      { name: 'Vacant desk', people: 0, hoursPerShift: 8, shiftsPerWeek: 5 },
      { name: 'Unscheduled', people: 1, hoursPerShift: 0, shiftsPerWeek: 5 },
    ],
  });
  assert.equal(result.shiftMonthlyHours, 0);
  assert.equal(result.shiftMonthlyLaborCost, 0);
  assert.equal(result.monthlyPrice, calculateBid(office()).monthlyPrice);
});

test('shift inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(
    () => calculateBid({ ...office(), areas: [], shifts: [] }),
    /at least one area or day-porter shift/,
  );
  assert.throws(
    () => calculateBid({ ...office(), shifts: [{ name: 'Porter', people: -1, hoursPerShift: 8, shiftsPerWeek: 5 }] }),
    /Porter: people must be at least 0/,
  );
  assert.throws(
    () => calculateBid({ ...office(), shifts: [{ name: 'Porter', people: 1, hoursPerShift: 'abc', shiftsPerWeek: 5 }] }),
    /Porter: hours per shift must be a number/,
  );
});

test('shift-role presets are named roles, not production rates', () => {
  assert.ok(SHIFT_ROLE_PRESETS.length >= 4);
  assert.ok(SHIFT_ROLE_PRESETS.some(role => /day porter/i.test(role.label)));
  for (const preset of SHIFT_ROLE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.equal(preset.rate, undefined);
  }
});

test('a day porter and strip-and-wax stay on separate invoices', () => {
  const production = calculateBid(office());
  const both = calculateBid({
    ...office(),
    shifts: [weekdayPorter()],
    projects: [{ name: 'Strip & wax (VCT)', squareFeet: 2000, productionRate: 250, passes: 2, materials: 80 }],
  });
  assert.ok(both.shiftMonthlyHours > 0);
  assert.ok(both.hasProjectWork);
  assert.ok(Math.abs(both.areaMonthlyLaborCost - production.monthlyLaborCost) < 1e-9);
  assert.ok(Math.abs(both.firstMonthInvoice - (both.monthlyPrice + both.projectPrice)) < 1e-9);
  const summary = formatBidSummary(both);
  assert.match(summary, /DAY PORTER \/ SCHEDULED SHIFTS/);
  assert.match(summary, /ONE-TIME PROJECT WORK/);
  assert.match(summary, /Day porter \/ lobby attendant/);
  assert.match(summary, /Strip & wax/);
});

// The three scenario panels each rebuilt their input object inline and left
// `shifts` and `projects` out of it, so a contract with a day porter was
// compared against a cost base that did not include that porter's wages. The
// page now prices every panel from the same `readInput()` the headline uses;
// these tests pin the consequence, which is what made the defect worth finding:
// the numbers move by multiples, not by rounding.
test('a day porter belongs in the frequency comparison cost base', () => {
  const without = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  const withPorter = compareFrequencyReduction(
    { ...office(), shifts: [weekdayPorter()] },
    { currentWeekly: 5, proposedWeekly: 3 },
  );

  // The porter is scheduled against the building's week, not the cleaning
  // cadence, so the hours that drop are the same either way...
  assert.ok(Math.abs(withPorter.laborHoursDropped - without.laborHoursDropped) < 1e-9);
  // ...but their wages stay in the base, so every price the panel quotes moves.
  assert.ok(withPorter.priceToHoldTargetMargin > without.priceToHoldTargetMargin * 2);
  assert.ok(withPorter.walkAwayAtReduced > without.walkAwayAtReduced * 2);
  assert.ok(withPorter.unscaledShiftLabor > 0);
  assert.equal(without.unscaledShiftLabor, 0);
});

test('the pasteable note names the shift labor that does not drop with the visits', () => {
  const withPorter = compareFrequencyReduction(
    { ...office(), shifts: [weekdayPorter()] },
    { currentWeekly: 5, proposedWeekly: 3 },
  );
  const note = frequencyReductionNote(withPorter, { targetMargin: 20 });
  assert.match(note, /day-porter wages are not part of that drop/);

  // A bid with no shift must not grow a sentence about a porter it does not have.
  const plain = compareFrequencyReduction(office(), { currentWeekly: 5, proposedWeekly: 3 });
  assert.doesNotMatch(frequencyReductionNote(plain, { targetMargin: 20 }), /day-porter wages/);
});

test('a day porter belongs in the supply and initial-clean comparisons too', () => {
  const supplyWithout = compareSupplyResponsibility(office(), { restroomSharePercent: 40 });
  const supplyWith = compareSupplyResponsibility(
    { ...office(), shifts: [weekdayPorter()] },
    { restroomSharePercent: 40 },
  );
  assert.ok(supplyWith.youSupply.monthlyCost > supplyWithout.youSupply.monthlyCost);

  const initialWithout = compareInitialClean(office(), { visitMultiplier: 3 });
  const initialWith = compareInitialClean(
    { ...office(), shifts: [weekdayPorter()] },
    { visitMultiplier: 3 },
  );
  assert.ok(initialWith.monthly.monthlyCost > initialWithout.monthly.monthlyCost);
});
