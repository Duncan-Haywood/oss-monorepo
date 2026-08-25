import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, WEEKS_PER_MONTH, PRODUCTION_RATE_PRESETS, SHIFT_ROLE_PRESETS } from './calc.mjs';

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
  // Production hours are unchanged: the porter is extra labor, not a faster clean.
  assert.equal(withPorter.hoursPerVisitTotal, production.hoursPerVisitTotal);
  assert.ok(withPorter.monthlyPrice > production.monthlyPrice);
  // An 8-hour weekday porter dwarfs a 2.4-hour night clean.
  const porter = withPorter.shifts[0];
  assert.ok(porter.hoursShare > 70);
  assert.ok(porter.hoursShare < 90);
});

test('day-porter hours are not amortized into a cheaper monthly production rate', () => {
  const production = calculateBid(office());
  const withPorter = calculateBid({ ...office(), shifts: [weekdayPorter()] });
  // The failure mode this feature exists to prevent: baking the porter into
  // the night-clean price so the eleven months after "they already have
  // someone there" look cheaper than they are.
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
  const one = calculateBid({ ...office(), areas: office().areas, shifts: [weekdayPorter()] });
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
