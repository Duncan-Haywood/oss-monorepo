import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  heightHoursMultiplier,
  heightPostHoursPerSf,
  estimatedFootings,
  stairHours,
  stairParts,
  GUARD_HEIGHT_FT,
  ELEVATED_HEIGHT_FT,
  HEIGHT_GUARD_HOURS_MULT,
  HEIGHT_ELEVATED_HOURS_MULT,
  DEFAULT_DISPOSAL_PER_SF,
  DEFAULT_FOOTING_EACH,
  DEMO_HOURS_PER_SF,
  STAIR_BASE_HOURS,
} from './calc.mjs';

const yard = () => ({
  sections: [
    { name: 'Main deck', lengthFt: 14, widthFt: 20, heightFt: 3, material: 'pt' },
    { name: 'Wrap', lengthFt: 10, widthFt: 12, heightFt: 3, material: 'pt' },
  ],
  railingLf: 46,
  railingStyle: 'wood',
  stairs: [{ name: 'Yard stair', runs: 1, widthFt: 4, risers: 5 }],
  demoSf: 280,
  hourlyWage: 42,
  burdenRate: 30,
  milesOneWay: 14,
  speedMph: 28,
  setupHours: 1.5,
  minOnSiteHours: 8,
  tripFee: 125,
  disposalPerSf: DEFAULT_DISPOSAL_PER_SF,
  footingEach: DEFAULT_FOOTING_EACH,
  permitCost: 175,
  otherCost: 40,
  overheadRate: 15,
  targetMargin: 22,
});

const bare = extra => ({
  ...yard(),
  railingLf: 0,
  stairs: [],
  demoSf: 0,
  setupHours: 0,
  minOnSiteHours: 0,
  milesOneWay: 0,
  tripFee: 0,
  permitCost: 0,
  otherCost: 0,
  overheadRate: 0,
  targetMargin: 0,
  hourlyWage: 0,
  footingEach: 0,
  disposalPerSf: 0,
  ...extra,
});

test('height multiplier stays 1.0 under the typical 30-inch guard trigger', () => {
  assert.equal(heightHoursMultiplier(0), 1);
  assert.equal(heightHoursMultiplier(2.49), 1);
  assert.equal(heightHoursMultiplier(GUARD_HEIGHT_FT), HEIGHT_GUARD_HOURS_MULT);
  assert.equal(heightHoursMultiplier(ELEVATED_HEIGHT_FT), HEIGHT_ELEVATED_HOURS_MULT);
  assert.equal(heightHoursMultiplier(10), HEIGHT_ELEVATED_HOURS_MULT);
});

test('post-set hours appear only once a guard or elevated frame is in play', () => {
  assert.equal(heightPostHoursPerSf(1), 0);
  assert.ok(heightPostHoursPerSf(GUARD_HEIGHT_FT) > 0);
  assert.ok(heightPostHoursPerSf(ELEVATED_HEIGHT_FT) > heightPostHoursPerSf(GUARD_HEIGHT_FT));
});

test('an elevated bay needs more footings than the same patio platform', () => {
  const patio = estimatedFootings(280, 1);
  const elevated = estimatedFootings(280, 8);
  assert.ok(elevated >= patio);
  assert.ok(patio >= 4);
});

test('a stair run is a carpentry job, not a rounding error on the square footage', () => {
  assert.ok(stairHours(5, 4) > STAIR_BASE_HOURS);
  assert.ok(stairHours(12, 4) > stairHours(5, 4));
  assert.ok(stairParts(12, 4) > stairParts(5, 4));
});

test('identical square footage still produces different hours when height differs', () => {
  const patio = calculateBid(bare({
    sections: [{ name: 'Patio', lengthFt: 14, widthFt: 20, heightFt: 0.8, material: 'pt' }],
  }));
  const elevated = calculateBid(bare({
    sections: [{ name: 'Elevated', lengthFt: 14, widthFt: 20, heightFt: 8, material: 'pt' }],
  }));
  assert.equal(patio.deckSquareFeet, elevated.deckSquareFeet);
  assert.ok(elevated.sectionHours > patio.sectionHours * 1.2, `8 ft must take more frame time: ${elevated.sectionHours} vs ${patio.sectionHours}`);
  assert.ok(elevated.sections[0].framingHours > patio.sections[0].framingHours * 1.5);
  assert.ok(elevated.sectionMaterial > patio.sectionMaterial, 'taller frame buys more posts and lumber');
  assert.equal(patio.needsGuard, false);
  assert.equal(elevated.needsGuard, true);
});

test('composite is a different material ticket than the same PT footprint', () => {
  const pine = calculateBid(bare({
    sections: [{ name: 'Main', lengthFt: 14, widthFt: 20, heightFt: 3, material: 'pt' }],
  }));
  const composite = calculateBid(bare({
    sections: [{ name: 'Main', lengthFt: 14, widthFt: 20, heightFt: 3, material: 'composite' }],
  }));
  assert.equal(pine.deckSquareFeet, composite.deckSquareFeet);
  assert.ok(composite.sectionMaterial > pine.sectionMaterial * 1.6);
  assert.ok(composite.sectionHours > pine.sectionHours);
});

test('railing lineal feet is a real share of an elevated job', () => {
  const noRail = calculateBid({
    ...yard(),
    railingLf: 0,
    minOnSiteHours: 0,
  });
  const withRail = calculateBid({
    ...yard(),
    minOnSiteHours: 0,
  });
  assert.ok(withRail.railingHours > 15);
  assert.ok(withRail.price > noRail.price);
  assert.ok(withRail.railingShareOfPrice > 8, `rail is ${withRail.railingShareOfPrice.toFixed(1)}% of price`);
  assert.equal(withRail.missingGuard, false);
  assert.equal(noRail.missingGuard, true);
});

test('a stair run adds hours the square-foot rule never saw', () => {
  const noStair = calculateBid({ ...yard(), stairs: [], minOnSiteHours: 0 });
  const withStair = calculateBid({ ...yard(), minOnSiteHours: 0 });
  assert.ok(withStair.stairHours > 5);
  assert.ok(withStair.price - noStair.price > 200);
});

test('demo is disposal plus tear-out hours, not a free teardown', () => {
  const result = calculateBid(yard());
  assert.equal(result.demoHours, 280 * DEMO_HOURS_PER_SF);
  assert.equal(result.disposal, 280 * DEFAULT_DISPOSAL_PER_SF);
});

test('price stacks burden, footings, disposal, overhead, then margin as a share of price', () => {
  const result = calculateBid(yard());
  assert.equal(result.loadedWage, 42 * 1.3);
  assert.equal(result.deckSquareFeet, 14 * 20 + 10 * 12);
  assert.equal(result.footingCost, result.footingCount * DEFAULT_FOOTING_EACH);

  const direct = result.laborCost + result.sectionMaterial + result.stairMaterial
    + result.railingMaterial + result.footingCost + result.disposal
    + result.tripFee + result.permitCost + result.otherCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 22) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(result.heightShareOfLabor > 50, `guard-height surfaces are ${result.heightShareOfLabor.toFixed(1)}% of productive hours`);
});

test('a $28-a-foot special on this elevated PT job is underwater', () => {
  const result = calculateBid({ ...yard(), proposedPrice: 28 * (14 * 20 + 10 * 12) });
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(result.proposed.profit < 0);
  assert.ok(result.pricePerSf > 28, `walk-away works out to $${result.pricePerSf.toFixed(2)}/sf`);
});

test('travel is a round trip and the on-site floor can raise billed hours', () => {
  const result = calculateBid(yard());
  assert.ok(Math.abs(result.travelHours - (2 * 14 / 28)) < 1e-9);
  assert.ok(result.onSiteHours >= 8);
  assert.ok(result.laborHours >= result.onSiteHours + result.travelHours - 1e-9);
});

test('rejects an empty takeoff and a 100% margin', () => {
  assert.throws(() => calculateBid({ ...yard(), sections: [] }), /at least one deck section/i);
  assert.throws(() => calculateBid({ ...yard(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...yard(), speedMph: 0 }), /Travel speed/);
});

test('zero-size sections still leave the rest of the takeoff usable', () => {
  const result = calculateBid({
    ...bare({
      sections: [
        { name: 'Empty', lengthFt: 0, widthFt: 0, heightFt: 3, material: 'pt' },
        { name: 'Real', lengthFt: 10, widthFt: 10, heightFt: 1, material: 'pt' },
      ],
    }),
  });
  assert.equal(result.deckSquareFeet, 100);
  assert.ok(result.sectionHours > 0);
});
