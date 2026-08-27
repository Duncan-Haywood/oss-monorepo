import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  SURFACE_PRESETS,
  AFTER_TRAVEL_HOURLY_TARGETS,
} from './calc.mjs';

const house = () => ({
  surfaces: [
    { name: 'Concrete driveway', squareFeet: 1200, productionRate: 1000, chemicalCost: 18 },
    { name: 'House siding (soft wash)', squareFeet: 2200, productionRate: 500, chemicalCost: 44 },
    { name: 'Sidewalk / walkway', squareFeet: 250, productionRate: 900, chemicalCost: 3 },
  ],
  hourlyWage: 22,
  burdenRate: 25,
  roundTripMinutes: 40,
  setupMinutes: 20,
  waterCost: 8,
  equipmentWear: 15,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 25,
  minimumJob: 175,
});

test('wash hours come from production rates, not a blended square-foot guess', () => {
  const result = calculateBid(house());
  // 1200/1000 + 2200/500 + 250/900 = 1.2 + 4.4 + 0.277...
  assert.ok(Math.abs(result.washHours - (1.2 + 4.4 + 250 / 900)) < 1e-9);
  assert.equal(result.totalSquareFeet, 3650);
});

test('house siding consumes labor out of all proportion to the driveway the customer called about', () => {
  const result = calculateBid(house());
  const siding = result.surfaces.find(s => s.name === 'House siding (soft wash)');
  const driveway = result.surfaces.find(s => s.name === 'Concrete driveway');
  const sidingAreaShare = siding.squareFeet / result.totalSquareFeet * 100;
  assert.ok(sidingAreaShare < 65, `siding is ${sidingAreaShare.toFixed(1)}% of the area`);
  assert.ok(siding.hoursShare > driveway.hoursShare, 'siding should be most of the wash hours');
  assert.ok(siding.hoursShare > 70, `siding is only ${siding.hoursShare.toFixed(1)}% of wash hours`);
});

test('travel and setup are billed hours, not a footnote', () => {
  const result = calculateBid(house());
  assert.ok(Math.abs(result.travelHours - 40 / 60) < 1e-9);
  assert.ok(Math.abs(result.setupHours - 20 / 60) < 1e-9);
  assert.ok(Math.abs(result.totalHours - (result.washHours + 1)) < 1e-9);
  assert.ok(result.travelShare > 10, 'an hour of drive+setup should be a visible share of the day');
});

test('price stacks burden, chemicals, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 22 * 1.25);
  assert.ok(Math.abs(result.chemicalCost - 65) < 1e-9);

  const direct = result.laborCost + 65 + 8 + 15;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);

  // Margin is a share of the target price. The bid may be higher if the
  // minimum applies, but on this house job the target is well above $175.
  assert.ok(result.bidPrice > 175);
  assert.equal(result.minimumApplied, false);
  assert.ok(Math.abs(result.profit / result.bidPrice * 100 - 25) < 1e-9);
});

test('after-travel hourly is lower than the on-site hourly a per-foot quote pretends', () => {
  const result = calculateBid(house());
  assert.ok(result.afterTravelHourly !== null);
  assert.ok(result.onSiteHourly !== null);
  assert.ok(result.afterTravelHourly < result.onSiteHourly);
});

test('a nearby job with the same surfaces pays a higher after-travel hourly', () => {
  const far = calculateBid(house());
  const near = calculateBid({ ...house(), roundTripMinutes: 10 });
  assert.ok(near.afterTravelHourly > far.afterTravelHourly);
  assert.ok(near.totalHours < far.totalHours);
  // Same wash, same chemicals — the only difference is the drive.
  assert.equal(near.washHours, far.washHours);
  assert.equal(near.chemicalCost, far.chemicalCost);
});

test('a minimum job lifts a tiny pad above cost-plus-margin', () => {
  const result = calculateBid({
    ...house(),
    surfaces: [{ name: 'Dumpster pad', squareFeet: 80, productionRate: 200, chemicalCost: 4 }],
    roundTripMinutes: 20,
    setupMinutes: 15,
    waterCost: 2,
    equipmentWear: 5,
    minimumJob: 175,
  });
  assert.equal(result.minimumApplied, true);
  assert.equal(result.bidPrice, 175);
  assert.ok(result.bidPrice > result.targetPrice);
  assert.ok(result.profit > 0);
});

test('a zero-margin bid prices at cost unless the minimum is higher', () => {
  const result = calculateBid({ ...house(), targetMargin: 0, minimumJob: 0 });
  assert.ok(Math.abs(result.bidPrice - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base, including after-travel hourly', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.bidPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.afterTravelHourly - bid.afterTravelHourly) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('a proposed price under the minimum is flagged even when it still covers cost', () => {
  const scored = calculateBid({
    ...house(),
    minimumJob: 400,
    proposedPrice: 350,
  });
  assert.equal(scored.proposed.belowMinimum, true);
  assert.equal(scored.proposed.belowBreakEven, scored.proposed.price < scored.totalCost);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: null }).proposed, null);
  // Zero is a real answer ("they want it for free"), not an absent one.
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('the rate card prices the hour they actually keep after the drive', () => {
  const result = calculateBid(house());
  assert.deepEqual(
    result.rateCard.map(row => row.hourly),
    [...AFTER_TRAVEL_HOURLY_TARGETS],
  );
  for (const row of result.rateCard) {
    assert.ok(Math.abs(row.price - row.hourly * result.totalHours) < 1e-9);
    assert.equal(row.coversCost, row.price >= result.totalCost);
  }
});

test('a maintenance package discounts each visit and multiplies the year', () => {
  const once = calculateBid(house());
  const quarterly = calculateBid({ ...house(), packageVisits: 4, packageDiscount: 15 });
  assert.ok(Math.abs(quarterly.annualPackageEach - once.bidPrice * 0.85) < 1e-9);
  assert.ok(Math.abs(quarterly.annualPackageTotal - quarterly.annualPackageEach * 4) < 1e-9);
  assert.equal(once.packageVisits, 1);
});

test('a nameless surface still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    surfaces: [
      { squareFeet: 400, productionRate: 800, chemicalCost: 5 },
      { name: '   ', squareFeet: 200, productionRate: 800, chemicalCost: 2 },
    ],
  });
  assert.equal(result.surfaces[0].name, 'Surface 1');
  assert.equal(result.surfaces[1].name, 'Surface 2');
});

test('a job with no washable area still prices travel and mobilization', () => {
  const result = calculateBid({
    ...house(),
    surfaces: [{ name: 'Empty', squareFeet: 0, productionRate: 1000, chemicalCost: 0 }],
    minimumJob: 0,
  });
  assert.equal(result.washHours, 0);
  assert.equal(result.pricePerSqFt, null);
  assert.equal(result.onSiteHourly, null);
  assert.ok(result.totalHours > 0);
  assert.ok(result.bidPrice > 0);
  assert.ok(result.afterTravelHourly !== null);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), surfaces: [] }), /at least one surface/);
  assert.throws(
    () => calculateBid({
      ...house(),
      surfaces: [{ name: 'Deck', squareFeet: 200, productionRate: 0, chemicalCost: 4 }],
    }),
    /Deck: production rate must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({
      ...house(),
      surfaces: [{ name: 'Deck', squareFeet: -5, productionRate: 350, chemicalCost: 4 }],
    }),
    /Deck: square feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), packageDiscount: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), packageVisits: 0 }), /at least 1/);
  assert.throws(() => calculateBid({ ...house(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('surface presets are usable positive numbers', () => {
  assert.ok(SURFACE_PRESETS.length >= 8);
  for (const preset of SURFACE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.rate) && preset.rate > 0);
    assert.ok(Number.isFinite(preset.chemicalPerSqFt) && preset.chemicalPerSqFt >= 0);
  }
});

test('the copied summary names every surface and the after-travel hourly', () => {
  const result = calculateBid(house());
  const text = formatBidSummary(result);
  assert.match(text, /Concrete driveway/);
  assert.match(text, /House siding/);
  assert.match(text, /After-travel hourly/);
  assert.match(text, /Walk-away price/);
  assert.doesNotMatch(text, /Maintenance package/);
  const packaged = formatBidSummary(calculateBid({ ...house(), packageVisits: 4, packageDiscount: 15 }));
  assert.match(packaged, /4 visits/);
});
