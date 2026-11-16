import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  ACCESS_VOLUME_BASIS_CU_FT,
  ACCESS_DEFAULTS,
  INVENTORY_PRESETS,
} from './calc.mjs';

const threeBed = () => ({
  inventory: [
    { name: '3 bedroom house', cubicFeet: 1100, clockHours: 5 },
  ],
  originFlights: 0,
  destFlights: 0,
  carryFeet: 20,
  elevatorWaitMinutes: 0,
  minutesPerFlightPer200CuFt: ACCESS_DEFAULTS.minutesPerFlightPer200CuFt,
  minutesPer50ftCarryPer200CuFt: ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt,
  packingHours: 0,
  driveHours: 1,
  crewSize: 3,
  hourlyWage: 22,
  burdenRate: 25,
  truckCost: 150,
  fuelTolls: 40,
  materials: 35,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 20,
});

test('clock hours start from inventory plus drive, then add access', () => {
  const result = calculateBid(threeBed());
  assert.equal(result.inventoryHours, 5);
  assert.equal(result.driveHours, 1);
  assert.equal(result.totalCubicFeet, 1100);
  // 20 ft carry on 1100 cu ft: (20/50) * (6/60) * (1100/200) = 0.4 * 0.1 * 5.5
  assert.ok(Math.abs(result.carryHours - 0.22) < 1e-9);
  assert.ok(Math.abs(result.clockHours - (5 + 0.22 + 1)) < 1e-9);
});

test('a third-floor walk-up is a different job than the same furniture on the first floor', () => {
  const firstFloor = calculateBid(threeBed());
  const walkUp = calculateBid({ ...threeBed(), originFlights: 3 });
  assert.ok(walkUp.stairHours > 1.5, `stairs added only ${walkUp.stairHours} h`);
  assert.ok(walkUp.clockHours > firstFloor.clockHours + 1.5);
  assert.ok(walkUp.price > firstFloor.price);
  assert.ok(walkUp.accessHoursShare > 20, `access is only ${walkUp.accessHoursShare.toFixed(1)}% of the day`);
  // 3 flights * (8/60) * (1100/200) = 3 * 0.1333... * 5.5 = 2.2 h
  assert.ok(Math.abs(walkUp.stairHours - 2.2) < 1e-9);
});

test('long carry scales with cubic feet, not a flat surcharge', () => {
  const studio = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Studio / 1 bedroom', cubicFeet: 400, clockHours: 2.5 }],
    carryFeet: 100,
    driveHours: 0,
  });
  const house = calculateBid({
    ...threeBed(),
    carryFeet: 100,
    driveHours: 0,
  });
  // Same 100 ft carry must cost more hours on the larger inventory.
  assert.ok(house.carryHours > studio.carryHours * 2);
  assert.ok(Math.abs(house.carryHours / studio.carryHours - 1100 / 400) < 1e-9);
});

test('price stacks burden, truck, overhead, then margin as a share of price', () => {
  const result = calculateBid(threeBed());
  assert.equal(result.loadedWage, 22 * 1.25);
  assert.ok(Math.abs(result.personHours - result.clockHours * 3) < 1e-9);
  assert.ok(Math.abs(result.laborCost - result.personHours * result.loadedWage) < 1e-9);

  const direct = result.laborCost + 150 + 40 + 35;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...threeBed(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed bedroom-count quote is scored against the same cost base', () => {
  const bid = calculateBid(threeBed());
  const scored = calculateBid({ ...threeBed(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyPerMover - bid.effectiveHourlyPerMover) < 1e-9);
});

test('a cheap bedroom-count quote under cost is flagged as a losing bid', () => {
  const bid = calculateBid(threeBed());
  const scored = calculateBid({ ...threeBed(), proposedPrice: bid.totalCost - 150 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(threeBed()).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: 0 }).proposed.price, 0);
});

test('elevator wait is flat clock time; stairs and carry are not', () => {
  const empty = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Empty truck', cubicFeet: 0, clockHours: 0 }],
    originFlights: 4,
    carryFeet: 200,
    elevatorWaitMinutes: 20,
    driveHours: 0,
  });
  assert.equal(empty.stairHours, 0);
  assert.equal(empty.carryHours, 0);
  assert.ok(Math.abs(empty.elevatorHours - 20 / 60) < 1e-9);
  assert.ok(Math.abs(empty.clockHours - 20 / 60) < 1e-9);
});

test('a nameless line still reports under a stable label', () => {
  const result = calculateBid({
    ...threeBed(),
    inventory: [
      { cubicFeet: 100, clockHours: 0.4 },
      { name: '   ', cubicFeet: 50, clockHours: 0.2 },
    ],
  });
  assert.equal(result.inventory[0].name, 'Item 1');
  assert.equal(result.inventory[1].name, 'Item 2');
});

test('zero inventory volume reports no per-cube ratio instead of dividing by zero', () => {
  const result = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Empty', cubicFeet: 0, clockHours: 0 }],
    driveHours: 0,
    truckCost: 100,
  });
  assert.equal(result.pricePerCuFt, null);
  assert.ok(result.price > 100);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...threeBed(), inventory: [] }), /at least one room or item/);
  assert.throws(() => calculateBid({ ...threeBed(), crewSize: 0 }), /Crew size must be greater than zero/);
  assert.throws(
    () => calculateBid({ ...threeBed(), inventory: [{ name: 'Piano', cubicFeet: -5, clockHours: 1 }] }),
    /Piano: cubic feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...threeBed(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...threeBed(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...threeBed(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('inventory presets are usable positive numbers', () => {
  assert.ok(INVENTORY_PRESETS.length >= 8);
  for (const preset of INVENTORY_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.cubicFeet) && preset.cubicFeet > 0);
    assert.ok(Number.isFinite(preset.clockHours) && preset.clockHours > 0);
  }
});

// The presets are the starting points every bid on the page is built from, and
// vs-a-bedroom-count-quote.html quotes them ("a 3-bedroom house (1,100 cu ft)").
// Pinned so a change is a decision made in a diff, not a slip: red team
// 2026-11-16 changed the garage line to 401 cu ft and every test passed.
test('inventory presets are the shipped table, value for value', () => {
  assert.deepEqual(INVENTORY_PRESETS.map((p) => [p.label, p.cubicFeet, p.clockHours]), [
    ['Studio / 1 bedroom', 400, 2.5],
    ['2 bedroom apartment', 700, 3.5],
    ['3 bedroom house', 1100, 5],
    ['4 bedroom house', 1500, 6.5],
    ['Kitchen (packed)', 150, 1.25],
    ['Garage / storage unit', 400, 1.5],
    ['Upright piano', 60, 1],
    ['Grand piano', 120, 2],
    ['Gun safe / 400+ lb item', 30, 1.25],
    ['Treadmill / elliptical', 40, 0.75],
    ['Washer + dryer', 50, 0.6],
    ['Dining set', 80, 0.5],
    ['Home office', 120, 0.75],
    ['Additional 100 cu ft', 100, 0.4],
  ]);
});

test('access volume basis is the documented 200 cu ft van-load', () => {
  assert.equal(ACCESS_VOLUME_BASIS_CU_FT, 200);
  assert.ok(ACCESS_DEFAULTS.minutesPerFlightPer200CuFt > 0);
  assert.ok(ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt > 0);
});

test('labor split names the parts of the day a bedroom-count quote hides', () => {
  const result = calculateBid({ ...threeBed(), originFlights: 3, packingHours: 2 });
  const names = result.split.map((row) => row.name);
  assert.ok(names.includes('Load & unload'));
  assert.ok(names.includes('Stairs'));
  assert.ok(names.includes('Packing'));
  assert.ok(names.includes('Drive time'));
  const shares = result.split.reduce((sum, row) => sum + row.share, 0);
  assert.ok(Math.abs(shares - 100) < 1e-6);
});

// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-moving-bid-calculator.json):
// the bid stopped at a lump sum, with no hourly rate, minimum or valuation line.
// Figures below are worked by hand from the threeBed() job.
test('hourly quote: suggested rate, break-even and minimum hours worked by hand', () => {
  const r = calculateBid(threeBed());
  const h = r.hourly;
  // loaded wage 22 x 1.25 = 27.50; x 3 movers = 82.50; x 1.15 overhead = 94.875 per clock hour
  assert.ok(Math.abs(h.variablePerHour - 94.875) < 1e-9);
  // (150 + 40 + 35 + 0) x 1.15 = 258.75 fixed per job
  assert.ok(Math.abs(h.fixedJobCost - 258.75) < 1e-9);
  // price 1061.09 / 6.22 h = 170.59/h, posted rounded up to $175
  assert.equal(h.rate, 175);
  assert.equal(h.suggested, true);
  // break-even 258.75 / (175 - 94.875) = 3.2293 h -> minimum rounds up to 3.5 h
  assert.ok(Math.abs(h.breakEvenHours - 3.2293291731669) < 1e-9);
  assert.equal(h.minimumHours, 3.5);
  // margin from 258.75 / (175 x 0.8 - 94.875) = 5.7341 h
  assert.ok(Math.abs(h.marginHours - 5.7340720221607) < 1e-9);
  const [short, est, long] = h.scenarios;
  assert.equal(est.billed, 175 * 6.22);
  // a 25% overrun: hourly bills 7.775 h; the flat price keeps 1061.09 - (258.75 + 94.875 x 7.775)
  assert.ok(Math.abs(long.flatProfit - (r.price - (258.75 + 94.875 * 7.775))) < 1e-9);
  assert.ok(long.profit > long.flatProfit);
  assert.ok(short.flatProfit > short.profit);
});

test('hourly quote: a short job bills the minimum, and a rate under labor cost has none', () => {
  const tiny = calculateBid({ ...threeBed(), inventory: [{ name: 'Studio', cubicFeet: 400, clockHours: 1 }], driveHours: 0.5, quotedHourlyRate: 160 });
  // break-even 258.75 / (160 - 94.875) = 3.973 h -> 4 h minimum; the 1.5 h job is billed 4 h
  assert.equal(tiny.hourly.minimumHours, 4);
  const est = tiny.hourly.scenarios[1];
  assert.equal(est.billedHours, 4);
  assert.equal(est.billed, 640);
  assert.ok(est.profit > 0);
  const low = calculateBid({ ...threeBed(), quotedHourlyRate: 90 });
  assert.equal(low.hourly.belowLaborCost, true);
  assert.equal(low.hourly.breakEvenHours, null);
  assert.equal(low.hourly.minimumHours, null);
  // a rate that covers labor but never the margin: break-even exists, margin hours do not
  const thin = calculateBid({ ...threeBed(), quotedHourlyRate: 110 });
  assert.ok(thin.hourly.breakEvenHours > 0);
  assert.equal(thin.hourly.marginHours, null);
  assert.throws(() => calculateBid({ ...threeBed(), quotedHourlyRate: 0 }), /greater than zero/);
});

test('hourly quote: a rate that clears the margin by under a dollar an hour still has margin hours', () => {
  // zero margin, rate 50 cents over the 94.875/h crew cost: 258.75 / 0.5 = 517.5 h to earn it back
  const r = calculateBid({ ...threeBed(), targetMargin: 0, quotedHourlyRate: 95.375 });
  assert.ok(Math.abs(r.hourly.marginHours - 517.5) < 1e-6);
  assert.equal(r.hourly.belowLaborCost, false);
});

test('hourly quote: a job with no costs at all is not "below labor cost"', () => {
  // Every cost zero (a blank form) prices the job at $0 and suggests a $0 rate.
  // The page then said "At $0.00/h the rate does not cover the crew's loaded
  // labor of $0.00/h, so every extra hour loses more": no hour loses anything.
  const r = calculateBid({ ...threeBed(), hourlyWage: 0, truckCost: 0, fuelTolls: 0, materials: 0 });
  assert.equal(r.price, 0);
  assert.equal(r.hourly.suggested, true);
  assert.equal(r.hourly.belowLaborCost, false);
  assert.ok(Object.is(r.hourly.rate, 0), 'the suggested rate is 0, not -0');
});

test('valuation: released value at 60 cents/lb and the full value charge', () => {
  const r = calculateBid({ ...threeBed(), declaredValue: 40000, valuationRatePer1000: 8 });
  // 1100 cu ft x 7 lb = 7,700 lb; x $0.60 = $4,620 cap on a total loss
  assert.equal(r.valuation.estimatedWeight, 7700);
  assert.ok(Math.abs(r.valuation.releasedLiabilityCap - 4620) < 1e-9);
  // $40,000 / 1,000 x $8 = $320; exposure above released value 40,000 - 4,620
  assert.equal(r.valuation.fullValueCharge, 320);
  assert.ok(Math.abs(r.valuation.extraExposure - 35380) < 1e-9);
  const own = calculateBid({ ...threeBed(), lbPerCuFt: 6.5, releasedValuePerLb: 0.75 });
  assert.ok(Math.abs(own.valuation.releasedLiabilityCap - 1100 * 6.5 * 0.75) < 1e-9);
  assert.equal(own.valuation.fullValueCharge, 0);
});

test('an inventory row with no clock hours adds none', () => {
  const r = calculateBid({ ...threeBed(), inventory: [{ name: 'Boxes', cubicFeet: 100 }] });
  assert.equal(r.inventory[0].clockHours, 0);
  assert.equal(r.inventoryHours, 0);
});

test('hourly: a rate exactly at loaded labor with no fixed cost breaks even, it is not below labor', () => {
  // No truck, fuel, materials or overhead, 0% margin: the suggested rate is
  // the loaded labor rate itself, so every hour nets $0. The page used to say
  // the rate "does not cover the crew's loaded labor", break-even "never".
  const r = calculateBid({
    inventory: [{ cubicFeet: 400, clockHours: 4 }],
    crewSize: 2,
    hourlyWage: 20,
  });
  const h = r.hourly;
  assert.equal(h.rate, 40);
  assert.equal(h.variablePerHour, 40);
  assert.equal(h.belowLaborCost, false);
  assert.equal(h.breakEvenHours, 0);
  assert.equal(h.marginHours, 0);
  assert.equal(h.minimumHours, 2);
  for (const s of h.scenarios) assert.ok(s.profit >= 0);
  // The same rate with a truck to pay for is still below workable: no
  // number of hours covers a fixed cost at zero margin per hour.
  const truck = calculateBid({ inventory: [{ cubicFeet: 400, clockHours: 4 }], crewSize: 2, hourlyWage: 20, truckCost: 100, quotedHourlyRate: 40 });
  assert.equal(truck.hourly.breakEvenHours, null);
  assert.equal(truck.hourly.minimumHours, null);
  assert.equal(truck.hourly.belowLaborCost, false);
  assert.equal(calculateBid({ ...threeBed(), quotedHourlyRate: 1 }).hourly.belowLaborCost, true);
});

// Red team 2026-11-16, second run: two mutants that went green.
test('valuation: a declared value under the released cap exposes the mover to nothing extra', () => {
  // 1,100 cu ft x 7 lb x $0.60 = $4,620 released cap; $3,000 declared is below it.
  const r = calculateBid({ ...threeBed(), declaredValue: 3000, valuationRatePer1000: 8 });
  assert.equal(r.valuation.extraExposure, 0);
  assert.equal(calculateBid(threeBed()).valuation.extraExposure, 0);
});

test('a one-person, one-hour job still scores a proposed price per mover-hour', () => {
  const r = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Treadmill', cubicFeet: 0, clockHours: 1 }],
    carryFeet: 0,
    driveHours: 0,
    crewSize: 1,
    proposedPrice: 150,
  });
  assert.equal(r.personHours, 1);
  assert.equal(r.proposed.hourlyPerMover, 150);
});
