import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  PRODUCT_PRESETS,
  ADD_ON_PRESETS,
  HOURS_PER_BAFFLE,
  HOURS_PER_PENETRATION,
  REMOVAL_HOURS_PER_1000,
  AIR_SEAL_PARTS_PER_PENETRATION,
  depthMultiplier,
} from './calc.mjs';

const typical = () => ({
  areas: [
    { name: 'Main attic', lengthFt: 40, widthFt: 28, existingR: 13, targetR: 49, vaulted: false },
    { name: 'Garage attic', lengthFt: 22, widthFt: 20, existingR: 19, targetR: 38, vaulted: false },
  ],
  rPerInch: 3.7,
  cuFtPerBag: 25,
  pricePerBag: 14,
  blowHoursPer1000: 1.4,
  baffleCount: 36,
  bafflePrice: 1.85,
  penetrations: 18,
  removeExisting: false,
  removalHoursPer1000: REMOVAL_HOURS_PER_1000,
  addOns: [],
  hourlyWage: 32,
  burdenRate: 30,
  milesOneWay: 14,
  speedMph: 28,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 85,
  dumpsterCost: 375,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 28,
});

test('bags come from the R-value delta, not a flat square-foot count', () => {
  const result = calculateBid(typical());
  // Main: 1120 sq ft, (49-13)/3.7 = 9.7297 in, cu ft = 1120 * 9.7297 / 12
  // Garage: 440 sq ft, (38-19)/3.7 = 5.1351 in
  const mainCuFt = 1120 * ((49 - 13) / 3.7) / 12;
  const garageCuFt = 440 * ((38 - 19) / 3.7) / 12;
  assert.ok(Math.abs(result.atticSqFt - 1560) < 1e-9);
  assert.ok(Math.abs(result.cuFt - (mainCuFt + garageCuFt)) < 1e-6);
  assert.equal(result.bags, Math.ceil((mainCuFt + garageCuFt) / 25));
  assert.ok(result.bags > 40);
});

test('the same attic at R-30 going to R-38 buys fewer bags than R-13 to R-49', () => {
  const alreadyDecent = calculateBid({
    ...typical(),
    areas: [{ name: 'Main attic', lengthFt: 40, widthFt: 28, existingR: 30, targetR: 38 }],
  });
  const cold = calculateBid({
    ...typical(),
    areas: [{ name: 'Main attic', lengthFt: 40, widthFt: 28, existingR: 13, targetR: 49 }],
  });
  assert.ok(cold.bags > alreadyDecent.bags * 2);
  assert.ok(cold.price > alreadyDecent.price);
  assert.ok(alreadyDecent.bags > 0);
});

test('an attic already at the target R adds no bags and no blow hours', () => {
  const result = calculateBid({
    ...typical(),
    areas: [{ name: 'Done', lengthFt: 30, widthFt: 20, existingR: 49, targetR: 49 }],
    baffleCount: 0,
    penetrations: 0,
  });
  assert.equal(result.bags, 0);
  assert.equal(result.blowHours, 0);
  assert.equal(result.cuFt, 0);
  assert.equal(result.areas[0].alreadyAtTarget, true);
  assert.equal(result.areas[0].inchesAdded, 0);
});

test('vaulted ceiling is excluded from the blow but still counted in attic area', () => {
  const result = calculateBid({
    ...typical(),
    areas: [
      { name: 'Floor attic', lengthFt: 30, widthFt: 20, existingR: 13, targetR: 49, vaulted: false },
      { name: 'Cathedral', lengthFt: 24, widthFt: 16, existingR: 19, targetR: 49, vaulted: true },
    ],
  });
  assert.equal(result.atticSqFt, 600 + 384);
  assert.equal(result.vaultedSqFt, 384);
  assert.equal(result.blowableSqFt, 600);
  assert.equal(result.areas[1].cuFt, 0);
  assert.equal(result.areas[1].inchesAdded, 0);
  assert.ok(result.bags > 0);
});

test('cellulose and fiberglass are different bag counts on the same attic', () => {
  const cellulose = PRODUCT_PRESETS.find(item => item.id === 'cellulose');
  const fiberglass = PRODUCT_PRESETS.find(item => item.id === 'fiberglass');
  const cellBid = calculateBid({
    ...typical(),
    rPerInch: cellulose.rPerInch,
    cuFtPerBag: cellulose.cuFtPerBag,
    pricePerBag: cellulose.pricePerBag,
    blowHoursPer1000: cellulose.blowHoursPer1000,
  });
  const glassBid = calculateBid({
    ...typical(),
    rPerInch: fiberglass.rPerInch,
    cuFtPerBag: fiberglass.cuFtPerBag,
    pricePerBag: fiberglass.pricePerBag,
    blowHoursPer1000: fiberglass.blowHoursPer1000,
  });
  // Lower R/inch means more inches, and a 40-cu-ft bag is a different yield.
  assert.ok(glassBid.weightedInches > cellBid.weightedInches);
  assert.notEqual(glassBid.bags, cellBid.bags);
  assert.notEqual(glassBid.bagMaterial, cellBid.bagMaterial);
});

test('price stacks burden, bags, baffles, air-seal parts, overhead, then margin as a share of price', () => {
  const result = calculateBid(typical());
  assert.equal(result.loadedWage, 32 * 1.3);
  assert.ok(Math.abs(result.airSealHours - 18 * HOURS_PER_PENETRATION) < 1e-9);
  assert.ok(Math.abs(result.baffleHours - 36 * HOURS_PER_BAFFLE) < 1e-9);
  assert.ok(Math.abs(result.travelHours - (28 / 28)) < 1e-9);
  assert.ok(Math.abs(result.airSealParts - 18 * AIR_SEAL_PARTS_PER_PENETRATION) < 1e-9);
  assert.ok(Math.abs(result.baffleMaterial - 36 * 1.85) < 1e-9);
  assert.ok(Math.abs(result.bagMaterial - result.bags * 14) < 1e-9);

  const expectedLabor = result.totalHours * result.loadedWage;
  assert.ok(Math.abs(result.laborCost - expectedLabor) < 1e-9);
  const direct = result.laborCost + result.bagMaterial + result.baffleMaterial +
    result.airSealParts + result.addOnParts + result.dumpster + 85;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.ok(result.airSealShareOfLabor > 0);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.totalCost - 250 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(typical()).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: 0 }).proposed.price, 0);
});

test('minimum on-site hours pads a hatch-only stop but not a two-attic blow', () => {
  const tiny = calculateBid({
    ...typical(),
    areas: [{ name: 'Hatch patch', lengthFt: 8, widthFt: 6, existingR: 38, targetR: 38 }],
    baffleCount: 0,
    penetrations: 2,
    setupHours: 0,
    minOnSiteHours: 4,
    milesOneWay: 0,
    dumpsterCost: 0,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.onSiteHours, 4);
  assert.equal(tiny.travelHours, 0);
  assert.equal(tiny.totalHours, 4);

  const full = calculateBid({ ...typical(), minOnSiteHours: 4 });
  assert.equal(full.minimumApplied, false);
  assert.ok(full.onSiteHours > 4);
});

test('travel is a round trip and never silently free at zero speed', () => {
  const result = calculateBid({ ...typical(), milesOneWay: 14, speedMph: 28 });
  assert.ok(Math.abs(result.travelHours - 1) < 1e-9);
  assert.throws(() => calculateBid({ ...typical(), speedMph: 0 }), /Travel speed must be greater than zero/);
});

test('removal and dumpster only apply when that scope is on', () => {
  const withRemoval = calculateBid({ ...typical(), removeExisting: true });
  const without = calculateBid({ ...typical(), removeExisting: false });
  assert.equal(withRemoval.dumpster, 375);
  assert.equal(without.dumpster, 0);
  assert.ok(withRemoval.removalHours > 0);
  assert.equal(without.removalHours, 0);
  assert.ok(withRemoval.price > without.price);
  assert.ok(Math.abs(withRemoval.removalHours - (1560 / 1000) * REMOVAL_HOURS_PER_1000) < 1e-9);
});

test('deeper fills consume blow time out of proportion to a dusting', () => {
  const dusting = calculateBid({
    ...typical(),
    areas: [{ name: 'Top-up', lengthFt: 40, widthFt: 28, existingR: 38, targetR: 49 }],
    baffleCount: 0,
    penetrations: 0,
  });
  const deep = calculateBid({
    ...typical(),
    areas: [{ name: 'Cold attic', lengthFt: 40, widthFt: 28, existingR: 0, targetR: 60 }],
    baffleCount: 0,
    penetrations: 0,
  });
  assert.ok(deep.blowHours > dusting.blowHours);
  assert.ok(deep.bags > dusting.bags * 2);
  assert.ok(depthMultiplier(dusting.areas[0].inchesAdded) < depthMultiplier(deep.areas[0].inchesAdded));
});

test('add-ons can be disabled and still listed when enabled', () => {
  const result = calculateBid({
    ...typical(),
    addOns: [
      { id: 'hatchDam', label: 'Attic hatch dam', hours: 0.6, parts: 45, enabled: true },
      { id: 'recessedCans', label: 'Recessed cans', hours: 1.8, parts: 85, enabled: false },
    ],
  });
  assert.equal(result.addOns.length, 1);
  assert.ok(Math.abs(result.addOnHours - 0.6) < 1e-9);
  assert.equal(result.addOnParts, 45);
});

test('a nameless area still reports under a stable label', () => {
  const result = calculateBid({
    ...typical(),
    areas: [
      { lengthFt: 20, widthFt: 16, existingR: 13, targetR: 49 },
      { name: '   ', lengthFt: 10, widthFt: 10, existingR: 19, targetR: 38 },
    ],
  });
  assert.equal(result.areas[0].name, 'Area 1');
  assert.equal(result.areas[1].name, 'Area 2');
});

test('zero attic area still reports ratios as n/a instead of dividing by zero', () => {
  const result = calculateBid({
    ...typical(),
    areas: [{ name: 'Empty', lengthFt: 0, widthFt: 0, existingR: 13, targetR: 49 }],
    baffleCount: 0,
    penetrations: 0,
    tripFee: 70,
    milesOneWay: 0,
    dumpsterCost: 0,
  });
  assert.equal(result.atticSqFt, 0);
  assert.equal(result.pricePerAtticSqFt, null);
  assert.equal(result.pricePerBlowableSqFt, null);
  assert.equal(result.areas[0].areaShare, 0);
  assert.equal(result.bags, 0);
  assert.ok(result.price > 70);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), areas: [] }), /at least one attic area/);
  assert.throws(
    () => calculateBid({ ...typical(), areas: [{ name: 'Main', lengthFt: -1, widthFt: 20, existingR: 13, targetR: 49 }] }),
    /Main: length must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...typical(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), rPerInch: 0 }), /R-value per inch must be at least 0\.1/);
  assert.throws(() => calculateBid({ ...typical(), cuFtPerBag: 0 }), /Cubic feet per bag must be at least 0\.1/);
});

test('depth multipliers step at 6, 10, and 14 inches', () => {
  assert.equal(depthMultiplier(5), 1);
  assert.equal(depthMultiplier(7), 1.1);
  assert.equal(depthMultiplier(11), 1.25);
  assert.equal(depthMultiplier(15), 1.45);
});

test('presets are usable positive numbers and cellulose is denser than fiberglass', () => {
  assert.ok(PRODUCT_PRESETS.length >= 3);
  for (const preset of PRODUCT_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.rPerInch > 0);
    assert.ok(preset.cuFtPerBag > 0);
    assert.ok(preset.pricePerBag > 0);
    assert.ok(preset.blowHoursPer1000 > 0);
  }
  assert.ok(ADD_ON_PRESETS.length >= 2);
  const cellulose = PRODUCT_PRESETS.find(preset => preset.id === 'cellulose');
  const fiberglass = PRODUCT_PRESETS.find(preset => preset.id === 'fiberglass');
  assert.ok(cellulose.rPerInch > fiberglass.rPerInch);
  assert.ok(fiberglass.cuFtPerBag > cellulose.cuFtPerBag);
});
