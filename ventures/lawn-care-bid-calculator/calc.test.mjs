import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, WEEKS_PER_MONTH, SQFT_PER_ACRE, SERVICE_PRESETS } from './calc.mjs';

const suburban = () => ({
  services: [
    { name: 'Turf mowing', quantity: 10000, productionRate: 20000, unit: 'sqft' },
    { name: 'Edging & blowing', quantity: 25, productionRate: 60, unit: 'minutes' },
    { name: 'Bed weeding / detail', quantity: 350, productionRate: 400, unit: 'sqft' },
  ],
  visitsPerWeek: 1,
  serviceWeeksPerYear: 32,
  oneWayMinutes: 18,
  crewSize: 1,
  hourlyWage: 18,
  burdenRate: 25,
  fuelPerVisit: 8,
  dumpPerVisit: 0,
  equipmentMonthly: 40,
  otherMonthly: 0,
  overheadRate: 12,
  targetMargin: 25,
});

test('on-property hours come from each service rate, not lot size alone', () => {
  const result = calculateBid(suburban());
  // 10000/20000 + 25/60 + 350/400 = 0.5 + 0.4166... + 0.875
  assert.ok(Math.abs(result.onPropertyHoursPerVisit - (0.5 + 25 / 60 + 0.875)) < 1e-9);
  assert.ok(Math.abs(result.travelHoursPerVisit - 36 / 60) < 1e-9);
  assert.ok(Math.abs(result.hoursPerVisit - (result.onPropertyHoursPerVisit + 0.6)) < 1e-9);
});

test('beds and travel consume labor out of all proportion to the turf', () => {
  const result = calculateBid(suburban());
  const turf = result.services.find(s => s.name === 'Turf mowing');
  const beds = result.services.find(s => s.name === 'Bed weeding / detail');
  assert.ok(turf.hoursShare < 25, `turf is ${turf.hoursShare.toFixed(1)}% of the stop`);
  assert.ok(beds.hoursShare > turf.hoursShare, 'beds take more time than the mow');
  assert.ok(result.travelHoursShare > 20, `travel is only ${result.travelHoursShare.toFixed(1)}%`);
});

test('price stacks burden, fuel, overhead, then margin as a share of price', () => {
  const result = calculateBid(suburban());
  assert.equal(result.loadedWage, 18 * 1.25);

  const visits = 1 * WEEKS_PER_MONTH;
  assert.ok(Math.abs(result.inSeasonMonthlyVisits - visits) < 1e-9);
  assert.ok(Math.abs(result.monthlyFuel - 8 * visits) < 1e-9);

  // $40 a calendar month, paid 12 months, billed over 32 weeks: 40 * 52 / 32 = 65.
  assert.ok(Math.abs(result.equipmentInSeasonMonthly - 65) < 1e-9);
  const direct = result.monthlyLaborCost + result.monthlyFuel + result.monthlyDump + 65;
  assert.ok(Math.abs(result.monthlyOverhead - direct * 0.12) < 1e-9);
  assert.ok(Math.abs(result.monthlyCost - direct * 1.12) < 1e-9);
  assert.ok(Math.abs(result.monthlyProfit / result.monthlyPrice * 100 - 25) < 1e-9);
});

test('annual is service weeks times the per-visit price, not monthly times twelve', () => {
  const result = calculateBid(suburban());
  assert.ok(Math.abs(result.annualVisits - 32) < 1e-9);
  assert.ok(Math.abs(result.annualPrice - result.pricePerVisit * 32) < 1e-9);
  assert.ok(result.annualPrice < result.monthlyPrice * 12 - 1, 'winter is not billed');
  assert.ok(Math.abs(result.smoothedMonthly - result.annualPrice / 12) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...suburban(), targetMargin: 0 });
  assert.ok(Math.abs(result.monthlyPrice - result.monthlyCost) < 1e-9);
  assert.ok(Math.abs(result.monthlyProfit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(suburban());
  const scored = calculateBid({ ...suburban(), proposedPrice: bid.monthlyPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(suburban());
  const scored = calculateBid({ ...suburban(), proposedPrice: bid.monthlyCost - 20 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(suburban()).proposed, null);
  assert.equal(calculateBid({ ...suburban(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...suburban(), proposedPrice: 0 }).proposed.price, 0);
});

test('acres convert to square feet before the rate is applied', () => {
  const acres = calculateBid({
    ...suburban(),
    services: [{ name: 'Turf mowing', quantity: 0.5, productionRate: 20000, unit: 'acres' }],
    oneWayMinutes: 0,
  });
  const sqft = calculateBid({
    ...suburban(),
    services: [{ name: 'Turf mowing', quantity: 0.5 * SQFT_PER_ACRE, productionRate: 20000, unit: 'sqft' }],
    oneWayMinutes: 0,
  });
  assert.ok(Math.abs(acres.onPropertyHoursPerVisit - sqft.onPropertyHoursPerVisit) < 1e-9);
  assert.ok(Math.abs(acres.turfAcres - 0.5) < 1e-9);
});

test('crew size shortens clock time, keeps on-property hours, and pays everyone for the drive', () => {
  const one = calculateBid(suburban());
  const two = calculateBid({ ...suburban(), crewSize: 2 });
  assert.ok(Math.abs(two.onPropertyHoursPerVisit - one.onPropertyHoursPerVisit) < 1e-9);
  assert.ok(Math.abs(two.clockHoursOnSite * 2 - one.clockHoursOnSite) < 1e-9);
  // 18 min each way = 0.6 h on the clock; two people in the truck = 1.2 paid hours.
  assert.ok(Math.abs(one.travelHoursPerVisit - 0.6) < 1e-9);
  assert.ok(Math.abs(two.travelHoursPerVisit - 1.2) < 1e-9);
  assert.ok(Math.abs(two.travelClockHoursPerVisit - 0.6) < 1e-9);
  const extra = 0.6 * WEEKS_PER_MONTH * 18 * 1.25;
  assert.ok(Math.abs(two.monthlyLaborCost - one.monthlyLaborCost - extra) < 1e-9);
});

test('fixed monthly costs are recovered in full over a seasonal year (quality audit 2026-11-19)', () => {
  // Annual price attributable to a $40/month equipment share must cover
  // $480 a year, marked up by overhead (12%) and margin (25% of price).
  const withEquip = calculateBid(suburban());
  const without = calculateBid({ ...suburban(), equipmentMonthly: 0 });
  const recovered = withEquip.annualPrice - without.annualPrice;
  assert.ok(Math.abs(recovered - 480 * 1.12 / 0.75) < 1e-9, `recovered ${recovered}`);
  // Same for other monthly cost, and a 52-week year leaves the figure unchanged.
  const other = calculateBid({ ...suburban(), equipmentMonthly: 0, otherMonthly: 40 });
  assert.ok(Math.abs(other.annualPrice - without.annualPrice - 480 * 1.12 / 0.75) < 1e-9);
  const yearRound = calculateBid({ ...suburban(), serviceWeeksPerYear: 52 });
  assert.ok(Math.abs(yearRound.equipmentInSeasonMonthly - 40) < 1e-9);
});

test('a blank cost or wage field is an error, not a silent zero (quality audit 2026-11-19)', () => {
  for (const field of ['hourlyWage', 'burdenRate', 'fuelPerVisit', 'otherMonthly', 'equipmentMonthly']) {
    assert.throws(() => calculateBid({ ...suburban(), [field]: '' }), /is blank/, field);
    assert.throws(() => calculateBid({ ...suburban(), [field]: '  ' }), /is blank/, field);
  }
  assert.ok(calculateBid({ ...suburban(), hourlyWage: '18' }).loadedWage === 22.5);
});

test('a proposed price exactly at break-even is not flagged as a loss', () => {
  const cost = calculateBid(suburban()).monthlyCost;
  assert.equal(calculateBid({ ...suburban(), proposedPrice: cost }).proposed.belowBreakEven, false);
  assert.equal(calculateBid({ ...suburban(), proposedPrice: cost - 0.01 }).proposed.belowBreakEven, true);
});

test('a stop with no visits still reports equipment and leaves ratios empty', () => {
  const result = calculateBid({ ...suburban(), visitsPerWeek: 0, equipmentMonthly: 50 });
  assert.equal(result.inSeasonMonthlyHours, 0);
  assert.equal(result.pricePerVisit, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.ok(result.monthlyPrice > 50);
});

test('a nameless service still reports under a stable label', () => {
  const result = calculateBid({
    ...suburban(),
    services: [{ quantity: 1000, productionRate: 2000, unit: 'sqft' }, { name: '   ', quantity: 10, productionRate: 60, unit: 'minutes' }],
  });
  assert.equal(result.services[0].name, 'Service 1');
  assert.equal(result.services[1].name, 'Service 2');
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...suburban(), services: [] }), /at least one service/);
  assert.throws(
    () => calculateBid({ ...suburban(), services: [{ name: 'Mow', quantity: 100, productionRate: 0 }] }),
    /Mow: production rate must be greater than zero/,
  );
  assert.throws(() => calculateBid({ ...suburban(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...suburban(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...suburban(), crewSize: 0 }), /Crew size must be at least 1/);
  assert.throws(() => calculateBid({ ...suburban(), serviceWeeksPerYear: 53 }), /at most 52/);
});

test('production-rate presets are usable positive numbers', () => {
  assert.ok(SERVICE_PRESETS.length >= 5);
  for (const preset of SERVICE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.rate) && preset.rate > 0);
    assert.ok(['sqft', 'minutes', 'linear_ft'].includes(preset.unit));
  }
});

test('monthly conversion uses averaged weeks, not a flat four', () => {
  assert.ok(Math.abs(WEEKS_PER_MONTH - 52 / 12) < 1e-12);
  assert.ok(WEEKS_PER_MONTH > 4.3);
});

test('FAQ travel-share sentence matches the starting figures (quality round 88)', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const r = calculateBid({ services: [
    { name: 'Turf mowing', quantity: 10000, productionRate: 20000 },
    { name: 'Edging & blowing', unit: 'minutes', quantity: 25, productionRate: 60 },
    { name: 'Bed weeding / detail', quantity: 350, productionRate: 400 },
  ], visitsPerWeek: 1, serviceWeeksPerYear: 32, oneWayMinutes: 18, crewSize: 1, hourlyWage: 18,
  burdenRate: 25, fuelPerVisit: 8, equipmentMonthly: 40, overheadRate: 12, targetMargin: 25 });
  const [, edging, beds] = r.services.map(s => s.hoursShare);
  assert.ok(r.travelHoursShare > edging, 'page says travel exceeds edging');
  assert.ok(r.travelHoursShare < beds, 'page says travel is less than bed weeding');
  assert.ok(html.includes('though less than the bed weeding'));
  assert.ok(!html.includes('more than either the edging or the bed-weeding'));
});
