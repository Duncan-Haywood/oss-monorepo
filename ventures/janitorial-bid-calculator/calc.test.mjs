import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, compareFrequencyReduction, frequencyReductionNote, WEEKS_PER_MONTH, PRODUCTION_RATE_PRESETS } from './calc.mjs';

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
