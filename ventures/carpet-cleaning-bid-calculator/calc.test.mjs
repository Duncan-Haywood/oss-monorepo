import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJob,
  SOIL_PRESETS,
  UPHOLSTERY_PRESETS,
  DEFAULT_MINUTES_PER_FLIGHT,
} from './calc.mjs';

const house = () => ({
  rooms: [
    { name: 'Living room', squareFeet: 320, productionRate: 280, petTreatment: true },
    { name: 'Bedroom 1', squareFeet: 180, productionRate: 280, petTreatment: true },
    { name: 'Bedroom 2', squareFeet: 140, productionRate: 280 },
    { name: 'Bedroom 3', squareFeet: 120, productionRate: 280 },
    { name: 'Hall / landing', squareFeet: 60, productionRate: 280 },
  ],
  upholstery: [{ name: 'Sofa (3-seat)', minutes: 75 }],
  stairFlights: 2,
  minutesPerFlight: 12,
  extraPassMultiplier: 1,
  furnitureMoveMinutes: 25,
  travelMinutes: 40,
  hourlyWage: 20,
  burdenRate: 30,
  chemicalsPerSqFt: 0.04,
  petChemistryPerRoom: 12,
  otherJobCost: 12,
  overheadRate: 15,
  targetMargin: 35,
  minimumCharge: 149,
});

test('extraction hours come from soil-specific rates, not a per-room guess', () => {
  const result = calculateJob(house());
  // 320+180+140+120+60 = 820 sq ft at 280 sq ft/h
  assert.ok(Math.abs(result.extractionHours - 820 / 280) < 1e-9);
  assert.equal(result.totalSquareFeet, 820);
  assert.equal(result.roomCount, 5);
});

test('pet treatment adds a full extra pass on marked rooms only', () => {
  const result = calculateJob(house());
  // Living 320/280 + bedroom 1 180/280
  assert.ok(Math.abs(result.petExtraHours - 500 / 280) < 1e-9);
  assert.equal(result.petRoomCount, 2);
  const living = result.rooms.find((room) => room.name === 'Living room');
  const hall = result.rooms.find((room) => room.name === 'Hall / landing');
  assert.equal(living.petTreatment, true);
  assert.ok(Math.abs(living.hours - (320 / 280) * 2) < 1e-9);
  assert.equal(hall.petTreatment, false);
  assert.ok(Math.abs(hall.hours - 60 / 280) < 1e-9);
});

test('stairs, sofa, furniture, and the drive never appear in a 3-bed special', () => {
  const result = calculateJob(house());
  assert.ok(Math.abs(result.stairHours - 24 / 60) < 1e-9);
  assert.ok(Math.abs(result.upholsteryHours - 75 / 60) < 1e-9);
  assert.ok(Math.abs(result.furnitureHours - 25 / 60) < 1e-9);
  assert.ok(Math.abs(result.travelHours - 40 / 60) < 1e-9);
  assert.ok(result.hiddenHours > result.extractionHours * 0.5);
  assert.ok(result.hiddenHoursShare > 40);
});

test('price stacks burden, chemistry, overhead, then margin as a share of price', () => {
  const result = calculateJob(house());
  assert.equal(result.loadedWage, 20 * 1.3);
  assert.ok(Math.abs(result.laborCost - result.totalHours * result.loadedWage) < 1e-9);
  assert.ok(Math.abs(result.chemicalCost - (820 * 0.04 + 2 * 12)) < 1e-9);

  const direct = result.laborCost + result.chemicalCost + 12;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.quotedPrice * 100 - 35) < 1e-9);
});

test('a $129 three-bed special loses money on a real house', () => {
  const result = calculateJob({ ...house(), proposedPrice: 129 });
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(result.proposed.profit < 0);
  assert.ok(result.jobCost > 200, `cost is only ${result.jobCost}`);
  assert.ok(result.quotedPrice > 129);
});

test('the posted minimum is a floor on the quote, not a substitute for cost', () => {
  const cheap = calculateJob({
    rooms: [{ name: 'Hall', squareFeet: 40, productionRate: 400 }],
    travelMinutes: 10,
    hourlyWage: 20,
    burdenRate: 30,
    chemicalsPerSqFt: 0.04,
    petChemistryPerRoom: 0,
    otherJobCost: 0,
    overheadRate: 15,
    targetMargin: 35,
    minimumCharge: 149,
  });
  assert.equal(cheap.minimumApplied, true);
  assert.equal(cheap.quotedPrice, 149);
  assert.ok(cheap.jobCost < 149);
  assert.equal(cheap.breakEvenPrice, cheap.jobCost);
});

test('a zero-margin bid with no minimum prices at cost', () => {
  const result = calculateJob({ ...house(), targetMargin: 0, minimumCharge: 0 });
  assert.ok(Math.abs(result.quotedPrice - result.jobCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price at the quote is scored against the same cost base', () => {
  const bid = calculateJob(house());
  const scored = calculateJob({ ...house(), proposedPrice: bid.quotedPrice });
  assert.ok(Math.abs(scored.proposed.margin - 35) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateJob(house()).proposed, null);
  assert.equal(calculateJob({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateJob({ ...house(), proposedPrice: null }).proposed, null);
  assert.equal(calculateJob({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('effective hourly rate includes the drive; on-site rate does not', () => {
  const result = calculateJob(house());
  assert.ok(result.effectiveHourlyRate < result.onSiteHourlyRate);
  assert.ok(Math.abs(result.totalHours - result.onSiteHours - result.travelHours) < 1e-9);
});

test('a nameless room or piece still reports under a stable label', () => {
  const result = calculateJob({
    rooms: [{ squareFeet: 100, productionRate: 200 }, { name: '   ', squareFeet: 50, productionRate: 200 }],
    upholstery: [{ minutes: 30 }, { name: '  ', minutes: 12 }],
    hourlyWage: 20,
    burdenRate: 0,
    chemicalsPerSqFt: 0,
    petChemistryPerRoom: 0,
    otherJobCost: 0,
    overheadRate: 0,
    targetMargin: 0,
  });
  assert.equal(result.rooms[0].name, 'Room 1');
  assert.equal(result.rooms[1].name, 'Room 2');
  assert.equal(result.upholstery[0].name, 'Piece 1');
  assert.equal(result.upholstery[1].name, 'Piece 2');
});

test('a house with no carpet reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateJob({
    rooms: [{ name: 'Empty', squareFeet: 0, productionRate: 280 }],
    otherJobCost: 40,
    hourlyWage: 20,
    burdenRate: 0,
    chemicalsPerSqFt: 0,
    petChemistryPerRoom: 0,
    overheadRate: 0,
    targetMargin: 0,
    minimumCharge: 0,
  });
  assert.equal(result.totalHours, 0);
  assert.equal(result.pricePerSqFt, null);
  assert.equal(result.pricePerRoom, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.ok(result.quotedPrice > 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateJob({ ...house(), rooms: [] }), /at least one room/);
  assert.throws(
    () => calculateJob({ ...house(), rooms: [{ name: 'Hall', squareFeet: 100, productionRate: 0 }] }),
    /Hall: production rate must be greater than zero/,
  );
  assert.throws(
    () => calculateJob({ ...house(), rooms: [{ name: 'Hall', squareFeet: -5, productionRate: 280 }] }),
    /Hall: square feet must be at least 0/,
  );
  assert.throws(() => calculateJob({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateJob({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateJob({ ...house(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('presets are usable positive starting points, not a standard', () => {
  assert.ok(SOIL_PRESETS.length >= 3);
  for (const preset of SOIL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.rate) && preset.rate > 0);
  }
  assert.ok(UPHOLSTERY_PRESETS.length >= 4);
  for (const preset of UPHOLSTERY_PRESETS) {
    assert.ok(preset.minutes > 0);
  }
  assert.equal(DEFAULT_MINUTES_PER_FLIGHT, 12);
});

test('a half extra pass on pet rooms scales only the pet bucket', () => {
  const full = calculateJob(house());
  const half = calculateJob({ ...house(), extraPassMultiplier: 0.5 });
  assert.ok(Math.abs(half.petExtraHours - full.petExtraHours / 2) < 1e-9);
  assert.ok(Math.abs(half.extractionHours - full.extractionHours) < 1e-9);
});
