import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  BOARD_PRESETS,
  FINISH_LEVELS,
  TEXTURE_PRESETS,
  ADD_ON_PRESETS,
  HOURS_PER_OPENING,
  TAPE_LF_PER_OPENING,
  TEAR_OFF_HOURS_PER_100,
  TAPE_MATERIAL_PER_LF,
  heightMultiplier,
} from './calc.mjs';

const typical = () => ({
  rooms: [
    { name: 'Great room', lengthFt: 20, widthFt: 16, heightFt: 9, includeCeiling: true },
    { name: 'Bedroom', lengthFt: 12, widthFt: 12, heightFt: 8, includeCeiling: true },
    { name: 'Bath', lengthFt: 8, widthFt: 6, heightFt: 8, includeCeiling: true },
  ],
  openingSqFt: 86,
  openingCount: 7,
  wastePercent: 10,
  hangHoursPer100: 1.15,
  materialPer100: 48,
  sheetSqFt: 32,
  tapeLfPerSqFt: 0.42,
  finishLevel: 4,
  textureHoursPer100: 0,
  textureMaterialPer100: 0,
  tearOff: false,
  tearOffHoursPer100: TEAR_OFF_HOURS_PER_100,
  addOns: [],
  hourlyWage: 34,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 32,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 75,
  dumpsterCost: 425,
  otherCost: 0,
  overheadRate: 16,
  targetMargin: 26,
});

test('net hung area is walls minus openings, plus ceilings, then waste', () => {
  const result = calculateBid(typical());
  // Great room walls: 2*(20+16)*9 = 648; ceiling 320
  // Bedroom walls: 2*(12+12)*8 = 384; ceiling 144
  // Bath walls: 2*(8+6)*8 = 224; ceiling 48
  assert.ok(Math.abs(result.grossWallSqFt - 1256) < 1e-9);
  assert.ok(Math.abs(result.ceilingSqFt - 512) < 1e-9);
  assert.ok(Math.abs(result.netWallSqFt - 1170) < 1e-9);
  assert.ok(Math.abs(result.netHungSqFt - 1682) < 1e-9);
  assert.ok(Math.abs(result.billableSqFt - 1682 * 1.1) < 1e-9);
  assert.equal(result.estimatedSheets, Math.ceil(1682 * 1.1 / 32));
});

test('a tall great room consumes hang time out of proportion to a closet', () => {
  const result = calculateBid(typical());
  const great = result.rooms.find(room => room.name === 'Great room');
  const bath = result.rooms.find(room => room.name === 'Bath');
  assert.ok(great.hungSqFt > bath.hungSqFt * 2);
  assert.ok(great.areaShare > bath.areaShare);
  assert.equal(great.heightMultiplier, 1.15);
  assert.equal(bath.heightMultiplier, 1.0);
});

test('Level 5 skim is a different job than Level 3 hang-and-texture on the same rooms', () => {
  const paintReady = calculateBid({ ...typical(), finishLevel: 4, textureHoursPer100: 0 });
  const skim = calculateBid({ ...typical(), finishLevel: 5, textureHoursPer100: 0 });
  const texture = calculateBid({
    ...typical(),
    finishLevel: 3,
    textureHoursPer100: TEXTURE_PRESETS.find(item => item.id === 'knockdown').hoursPer100,
    textureMaterialPer100: 11,
  });
  assert.ok(skim.finishHours > paintReady.finishHours);
  assert.ok(skim.price > paintReady.price);
  assert.ok(paintReady.finishHours > texture.finishHours);
  assert.ok(texture.textureHours > 0);
  assert.equal(paintReady.textureHours, 0);
  assert.ok(paintReady.finishShareOfLabor > 50);
});

test('hang-only Level 0 does not invent tape labor', () => {
  const hangOnly = calculateBid({ ...typical(), finishLevel: 0, textureHoursPer100: 0 });
  assert.equal(hangOnly.finishHours, 0);
  assert.ok(hangOnly.hangHours > 0);
  assert.ok(hangOnly.price < calculateBid(typical()).price);
});

test('price stacks burden, board, mud, overhead, then margin as a share of price', () => {
  const result = calculateBid(typical());
  assert.equal(result.loadedWage, 34 * 1.32);
  assert.ok(Math.abs(result.openingHours - 7 * HOURS_PER_OPENING) < 1e-9);
  assert.ok(Math.abs(result.travelHours - (24 / 32)) < 1e-9);
  assert.ok(Math.abs(result.tapeLf - (result.netHungSqFt * 0.42 + 7 * TAPE_LF_PER_OPENING)) < 1e-9);

  const expectedLabor = result.totalHours * result.loadedWage;
  assert.ok(Math.abs(result.laborCost - expectedLabor) < 1e-9);
  const expectedBoard = result.billableSqFt / 100 * 48;
  assert.ok(Math.abs(result.boardMaterial - expectedBoard) < 1e-9);
  const finishMud = FINISH_LEVELS.find(item => item.level === 4).mudPer100;
  const expectedMud = result.tapeLf * TAPE_MATERIAL_PER_LF + result.billableSqFt / 100 * finishMud;
  assert.ok(Math.abs(result.tapeMudMaterial - expectedMud) < 1e-9);
  assert.equal(result.dumpster, 0);
  const direct = result.laborCost + result.boardMaterial + result.tapeMudMaterial +
    result.textureMaterial + result.addOnParts + result.dumpster + 75;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 26) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 26) < 1e-9);
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

test('minimum on-site hours pads a patch closet but not a three-room finish', () => {
  const tiny = calculateBid({
    ...typical(),
    rooms: [{ name: 'Closet patch', lengthFt: 4, widthFt: 3, heightFt: 8, includeCeiling: false }],
    openingSqFt: 0,
    openingCount: 0,
    finishLevel: 1,
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
  const result = calculateBid({ ...typical(), milesOneWay: 16, speedMph: 32 });
  assert.ok(Math.abs(result.travelHours - 1) < 1e-9);
  assert.throws(() => calculateBid({ ...typical(), speedMph: 0 }), /Travel speed must be greater than zero/);
});

test('tear-out and dumpster only apply when that scope is on', () => {
  const withTear = calculateBid({ ...typical(), tearOff: true });
  const without = calculateBid({ ...typical(), tearOff: false });
  assert.equal(withTear.dumpster, 425);
  assert.equal(without.dumpster, 0);
  assert.ok(withTear.tearOffHours > 0);
  assert.equal(without.tearOffHours, 0);
  assert.ok(withTear.price > without.price);
});

test('4x12 sheets cut joint tape versus 4x8 on the same rooms', () => {
  const fourByEight = BOARD_PRESETS.find(preset => preset.id === 'half-4x8');
  const fourByTwelve = BOARD_PRESETS.find(preset => preset.id === 'half-4x12');
  const short = calculateBid({
    ...typical(),
    wastePercent: fourByEight.wastePercent,
    hangHoursPer100: fourByEight.hangHoursPer100,
    materialPer100: fourByEight.materialPer100,
    sheetSqFt: fourByEight.sheetSqFt,
    tapeLfPerSqFt: fourByEight.tapeLfPerSqFt,
  });
  const long = calculateBid({
    ...typical(),
    wastePercent: fourByTwelve.wastePercent,
    hangHoursPer100: fourByTwelve.hangHoursPer100,
    materialPer100: fourByTwelve.materialPer100,
    sheetSqFt: fourByTwelve.sheetSqFt,
    tapeLfPerSqFt: fourByTwelve.tapeLfPerSqFt,
  });
  assert.ok(long.tapeLf < short.tapeLf);
  assert.ok(long.estimatedSheets < short.estimatedSheets);
  assert.ok(long.hangHours < short.hangHours);
});

test('add-ons can be disabled and still listed when enabled', () => {
  const result = calculateBid({
    ...typical(),
    addOns: [
      { id: 'stilts', label: 'Stilts / scaffold', hours: 2.5, parts: 120, enabled: true },
      { id: 'cornerBead', label: 'Corner bead', hours: 2, parts: 85, enabled: false },
    ],
  });
  assert.equal(result.addOns.length, 1);
  assert.ok(Math.abs(result.addOnHours - 2.5) < 1e-9);
  assert.equal(result.addOnParts, 120);
});

test('a nameless room still reports under a stable label', () => {
  const result = calculateBid({
    ...typical(),
    rooms: [
      { lengthFt: 10, widthFt: 10, heightFt: 8, includeCeiling: true },
      { name: '   ', lengthFt: 8, widthFt: 8, heightFt: 8, includeCeiling: false },
    ],
    openingSqFt: 0,
  });
  assert.equal(result.rooms[0].name, 'Room 1');
  assert.equal(result.rooms[1].name, 'Room 2');
  assert.equal(result.rooms[1].ceilingSqFt, 0);
});

test('zero hung area still reports ratios as n/a instead of dividing by zero', () => {
  const result = calculateBid({
    ...typical(),
    rooms: [{ name: 'Empty', lengthFt: 0, widthFt: 0, heightFt: 8, includeCeiling: true }],
    openingSqFt: 0,
    openingCount: 0,
    tearOff: false,
    tripFee: 70,
    milesOneWay: 0,
    dumpsterCost: 0,
  });
  assert.equal(result.netHungSqFt, 0);
  assert.equal(result.pricePerHungSqFt, null);
  assert.equal(result.pricePerBillableSqFt, null);
  assert.equal(result.rooms[0].areaShare, 0);
  assert.ok(result.price > 70);
});

test('openings larger than the walls are rejected', () => {
  assert.throws(
    () => calculateBid({ ...typical(), openingSqFt: 5000 }),
    /cannot exceed the wall area/,
  );
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), rooms: [] }), /at least one room/);
  assert.throws(
    () => calculateBid({ ...typical(), rooms: [{ name: 'Bath', lengthFt: -1, widthFt: 6, heightFt: 8 }] }),
    /Bath: length must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...typical(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), finishLevel: 6 }), /Finish level must be an integer from 0 to 5/);
});

test('height multipliers step at 8, 10, and 12 feet', () => {
  assert.equal(heightMultiplier(8), 1);
  assert.equal(heightMultiplier(9), 1.15);
  assert.equal(heightMultiplier(11), 1.4);
  assert.equal(heightMultiplier(14), 1.7);
});

test('presets are usable positive numbers and finish hours rise with level', () => {
  assert.ok(BOARD_PRESETS.length >= 4);
  for (const preset of BOARD_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.hangHoursPer100 > 0);
    assert.ok(preset.wastePercent > 0);
    assert.ok(preset.materialPer100 > 0);
    assert.ok(preset.sheetSqFt > 0);
  }
  const hours = FINISH_LEVELS.map(item => item.hoursPer100);
  for (let i = 1; i < hours.length; i += 1) {
    assert.ok(hours[i] > hours[i - 1]);
  }
  assert.ok(TEXTURE_PRESETS.length >= 4);
  assert.ok(ADD_ON_PRESETS.length >= 2);
  const typeX = BOARD_PRESETS.find(preset => preset.id === 'typex-4x8');
  const regular = BOARD_PRESETS.find(preset => preset.id === 'half-4x8');
  assert.ok(typeX.hangHoursPer100 > regular.hangHoursPer100);
  assert.ok(typeX.materialPer100 > regular.materialPer100);
});
