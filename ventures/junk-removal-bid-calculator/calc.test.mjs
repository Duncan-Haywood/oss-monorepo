import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  LBS_PER_TON,
  MATERIAL_PRESETS,
} from './calc.mjs';

const garage = () => ({
  piles: [
    { name: 'Mixed household junk', quantity: 6, unit: 'cubic_yards', lbsPerUnit: 200 },
    { name: 'Furniture / bulky items', quantity: 2, unit: 'cubic_yards', lbsPerUnit: 125 },
    { name: 'Appliance (each)', quantity: 2, unit: 'each', lbsPerUnit: 200, specialFeeEach: 25, cubicYardsEach: 1.5 },
  ],
  truckCapacityCubicYards: 12,
  dumpFeePerTon: 65,
  dumpMinimum: 45,
  surchargeRate: 10,
  onSiteHours: 2,
  stairsFlights: 0,
  minutesPerFlight: 15,
  longCarryMinutes: 0,
  oneWayMinutes: 18,
  dumpMinutes: 30,
  crewSize: 2,
  hourlyWage: 18,
  burdenRate: 28,
  fuelPerJob: 18,
  otherJobCost: 0,
  overheadRate: 15,
  targetMargin: 25,
  minimumCharge: 149,
});

test('weight comes from material density, not from the picture of the truck', () => {
  const result = calculateBid(garage());
  // 6*200 + 2*125 + 2*200 = 1200 + 250 + 400 = 1850 lb
  assert.equal(result.totalPounds, 1850);
  assert.ok(Math.abs(result.estimatedTons - 1850 / LBS_PER_TON) < 1e-12);
  // Volume: 6 + 2 + 2*1.5 = 11 cu yd — almost a full 12-yard trailer.
  assert.ok(Math.abs(result.totalCubicYards - 11) < 1e-12);
  assert.equal(result.dumpRuns, 1);
});

test('concrete of the same volume dominates the dump ticket', () => {
  const mixed = calculateBid({
    ...garage(),
    piles: [{ name: 'Mixed household junk', quantity: 4, unit: 'cubic_yards', lbsPerUnit: 200 }],
  });
  const concrete = calculateBid({
    ...garage(),
    piles: [{ name: 'Concrete / masonry', quantity: 4, unit: 'cubic_yards', lbsPerUnit: 4000 }],
  });
  assert.equal(mixed.totalCubicYards, concrete.totalCubicYards);
  assert.ok(concrete.estimatedTons > mixed.estimatedTons * 15);
  assert.ok(concrete.dumpCost > mixed.dumpCost * 10);
});

test('a light furniture load still pays the landfill minimum', () => {
  const result = calculateBid({
    ...garage(),
    piles: [{ name: 'Furniture / bulky items', quantity: 2, unit: 'cubic_yards', lbsPerUnit: 125 }],
    dumpMinimum: 45,
    dumpFeePerTon: 65,
    surchargeRate: 0,
  });
  // 250 lb = 0.125 tons * $65 = $8.13, so the $45 minimum binds.
  assert.equal(result.dumpTicket, 45);
  assert.ok(result.estimatedTons * 65 < 45);
});

test('a heavy load pays tons, not the minimum', () => {
  const result = calculateBid({
    ...garage(),
    piles: [{ name: 'Concrete / masonry', quantity: 3, unit: 'cubic_yards', lbsPerUnit: 4000 }],
    dumpMinimum: 45,
    dumpFeePerTon: 65,
    surchargeRate: 0,
  });
  const expected = 3 * 4000 / LBS_PER_TON * 65;
  assert.ok(Math.abs(result.dumpTicket - expected) < 1e-9);
  assert.ok(result.dumpTicket > 45);
});

test('appliance special fees sit on top of the weight ticket', () => {
  const result = calculateBid(garage());
  assert.equal(result.specialFees, 50);
  const ticketPlusSurcharge = result.dumpTicket * 1.10;
  assert.ok(Math.abs(result.dumpCost - (ticketPlusSurcharge + 50)) < 1e-9);
});

test('a volume over truck capacity forces a second dump run', () => {
  const result = calculateBid({
    ...garage(),
    piles: [{ name: 'Mixed household junk', quantity: 20, unit: 'cubic_yards', lbsPerUnit: 200 }],
    truckCapacityCubicYards: 12,
    dumpMinutes: 30,
  });
  assert.equal(result.dumpRuns, 2);
  assert.ok(Math.abs(result.dumpHours - 1) < 1e-12);
});

test('stairs, carry, travel, and the dump run are loaded labor', () => {
  const result = calculateBid({
    ...garage(),
    onSiteHours: 2,
    stairsFlights: 2,
    minutesPerFlight: 15,
    longCarryMinutes: 20,
    oneWayMinutes: 18,
    dumpMinutes: 30,
    crewSize: 2,
  });
  // Clock: 2 + 0.5 + 20/60 + 36/60 + 0.5 = 2 + 0.5 + 0.333... + 0.6 + 0.5
  const expectedClock = 2 + 0.5 + 20 / 60 + 36 / 60 + 0.5;
  assert.ok(Math.abs(result.clockHours - expectedClock) < 1e-12);
  assert.ok(Math.abs(result.personHours - expectedClock * 2) < 1e-12);
  assert.equal(result.loadedWage, 18 * 1.28);
  assert.ok(Math.abs(result.laborCost - result.personHours * result.loadedWage) < 1e-9);
});

test('price stacks dump, labor, fuel, overhead, then margin as a share of price', () => {
  const result = calculateBid({ ...garage(), minimumCharge: 0 });
  const direct = result.laborCost + result.dumpCost + 18;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.bidPrice * 100 - 25) < 1e-9);
  assert.equal(result.minimumApplied, false);
  assert.equal(result.breakEvenPrice, result.jobCost);
});

test('a posted minimum lifts the bid without hiding that cost is still the walk-away', () => {
  const raw = calculateBid({ ...garage(), minimumCharge: 0 });
  const floored = calculateBid({ ...garage(), minimumCharge: raw.marginPrice + 80 });
  assert.equal(floored.minimumApplied, true);
  assert.equal(floored.bidPrice, raw.marginPrice + 80);
  assert.equal(floored.breakEvenPrice, raw.jobCost);
  assert.ok(floored.profit > raw.profit);
});

test('a proposed half-truck special is scored against the same cost base', () => {
  const bid = calculateBid({ ...garage(), minimumCharge: 0 });
  const scored = calculateBid({ ...garage(), minimumCharge: 0, proposedPrice: bid.bidPrice });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);

  const losing = calculateBid({ ...garage(), proposedPrice: bid.jobCost - 40 });
  assert.equal(losing.proposed.belowBreakEven, true);
  assert.ok(losing.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(garage()).proposed, null);
  assert.equal(calculateBid({ ...garage(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...garage(), proposedPrice: 0 }).proposed.price, 0);
});

test('an empty load reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateBid({
    ...garage(),
    piles: [{ name: 'Empty trailer', quantity: 0, unit: 'cubic_yards', lbsPerUnit: 200 }],
    fuelPerJob: 10,
    minimumCharge: 0,
  });
  assert.equal(result.totalCubicYards, 0);
  assert.equal(result.dumpRuns, 0);
  assert.equal(result.pricePerCubicYard, null);
  assert.equal(result.piles[0].weightShare, 0);
  // Travel and on-site time still have a price even with an empty trailer.
  assert.ok(result.bidPrice > 0);
});

test('a nameless pile still reports under a stable label', () => {
  const result = calculateBid({
    ...garage(),
    piles: [
      { quantity: 2, unit: 'cubic_yards', lbsPerUnit: 200 },
      { name: '   ', quantity: 1, unit: 'cubic_yards', lbsPerUnit: 200 },
    ],
  });
  assert.equal(result.areas?.[0]?.name, undefined);
  assert.equal(result.piles[0].name, 'Pile 1');
  assert.equal(result.piles[1].name, 'Pile 2');
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...garage(), piles: [] }), /at least one pile/);
  assert.throws(() => calculateBid({ ...garage(), truckCapacityCubicYards: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...garage(), crewSize: 0 }), /Crew size/);
  assert.throws(() => calculateBid({ ...garage(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...garage(), targetMargin: 100 }), /less than 100/);
  assert.throws(
    () => calculateBid({
      ...garage(),
      piles: [{ name: 'Dirt', quantity: -1, unit: 'cubic_yards', lbsPerUnit: 2200 }],
    }),
    /Dirt: quantity must be at least 0/,
  );
});

test('material presets are usable positive densities', () => {
  assert.ok(MATERIAL_PRESETS.length >= 8);
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.lbsPerUnit) && preset.lbsPerUnit > 0);
    assert.ok(preset.unit === 'cubic_yards' || preset.unit === 'each');
    if (preset.unit === 'each') assert.ok(preset.cubicYardsEach > 0);
  }
});

test('the copyable summary names the price, the tons, and the dump ticket', () => {
  const result = calculateBid(garage());
  const text = formatBidSummary(result);
  assert.match(text, /JUNK REMOVAL BID/);
  assert.match(text, /Proposed job price:/);
  assert.match(text, /Estimated weight:/);
  assert.match(text, /Dump ticket/);
  assert.match(text, /Mixed household junk/);
  assert.match(text, /draft for review/);
  assert.doesNotMatch(text, /you are compliant/i);
});
