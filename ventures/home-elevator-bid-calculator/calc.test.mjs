import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareDrive,
  compareHoistway,
  formatBidSummary,
  travelHours,
  suggestedDriveKit,
  suggestedHoistwayKit,
  suggestedCabKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedDriveKit('pneumatic'),
    ...suggestedHoistwayKit('through-floor'),
    ...suggestedCabKit('acrylic'),
    ...suggestedExtraKit(),
  };
  return {
    stops: 2,
    travelFeet: 12,
    capacityLbs: 400,
    drive: 'pneumatic',
    hoistway: 'through-floor',
    cab: 'acrylic',
    travelMiles: 10,
    includePit: false,
    includeMachineRoom: false,
    includeAutoDoors: false,
    includeBattery: false,
    includeFeeder: false,
    includePermit: false,
    hourlyWage: 52,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 420,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedDriveKit('hydraulic'),
    ...suggestedHoistwayKit('new-wood'),
    ...suggestedCabKit('wood-panel'),
    ...suggestedExtraKit(),
  };
  return {
    stops: 3,
    travelFeet: 28,
    capacityLbs: 1000,
    drive: 'hydraulic',
    hoistway: 'new-wood',
    cab: 'wood-panel',
    travelMiles: 22,
    includePit: true,
    includeMachineRoom: true,
    includeAutoDoors: true,
    includeBattery: true,
    includeFeeder: true,
    includePermit: true,
    hourlyWage: 52,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 980,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(3.2, 10, 0.04) - (3.2 + 0.4)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.04), /must be a number/);
});

test('the cheap special is two-stop pneumatic through-floor, not a hydraulic shaft', () => {
  const result = calculateBid(special());
  assert.equal(result.stops, 2);
  assert.equal(result.travelFeet, 12);
  assert.equal(result.hoursPit, 0);
  assert.equal(result.hoursMachineRoom, 0);
  assert.equal(result.hoursAutoDoors, 0);
  assert.equal(result.hoursBattery, 0);
  assert.equal(result.hoursFeeder, 0);
  assert.equal(result.hoursPermit, 0);
  assert.equal(result.pitMaterial, 0);
  assert.equal(result.feederMaterial, 0);
  assert.ok(result.hoursUnit > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursHoistway > 0);
  assert.ok(result.shares.fixture + result.shares.labor > result.shares.extra);
  assert.ok(result.price > 15000 && result.price < 45000);
  assert.ok(result.pricePerStop > 7000 && result.pricePerStop < 22000);
});

test('a three-stop hydraulic shaft job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.stops, 3);
  assert.ok(heavy.hoursUnit > cheap.hoursUnit);
  assert.ok(heavy.hoursHoistway > cheap.hoursHoistway);
  assert.ok(heavy.hoursPit > 0);
  assert.ok(heavy.hoursMachineRoom > 0);
  assert.ok(heavy.hoursFeeder > 0);
  assert.ok(heavy.hoursPermit > 0);
  assert.ok(heavy.pitMaterial > 0);
  assert.ok(heavy.feederMaterial > 0);
  assert.ok(heavy.permitMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.price,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price > cheap.price * 1.6);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 52 * 1.32);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...special(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 500 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), drive: 'dumbwaiter' }), /Unknown drive/);
  assert.throws(() => calculateBid({ ...special(), hoistway: 'chimney' }), /Unknown hoistway/);
  assert.throws(() => calculateBid({ ...special(), cab: 'gold' }), /Unknown cab/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...special(), stops: 'x' }), /must be a number/);
});

test('compareDrive ranks pneumatic cheapest on a through-floor house and names the hydraulic upgrade', () => {
  const rows = compareDrive(special());
  assert.equal(rows.length, 4);
  assert.equal(rows[0].drive, 'pneumatic');
  assert.equal(rows[0].cheapest, true);
  const hydraulic = rows.find((row) => row.drive === 'hydraulic');
  assert.ok(hydraulic.upgradeFromPneumatic > 0);
  assert.ok(hydraulic.price > rows[0].price);
});

test('compareHoistway ranks reuse cheapest and names the wood-shaft upgrade over through-floor', () => {
  const rows = compareHoistway(special());
  assert.equal(rows.length, 5);
  assert.equal(rows[0].hoistway, 'existing-shaft');
  assert.equal(rows[0].cheapest, true);
  const through = rows.find((row) => row.hoistway === 'through-floor');
  const wood = rows.find((row) => row.hoistway === 'new-wood');
  assert.ok(through);
  assert.ok(wood.upgradeFromThroughFloor > 0);
  assert.ok(wood.price > through.price);
  assert.ok(wood.hoursHoistway > through.hoursHoistway);
});

test('job presets cover the cheap special and the losing hydraulic shaft', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  assert.equal(JOB_PRESETS[0].drive, 'pneumatic');
  assert.equal(JOB_PRESETS[0].hoistway, 'through-floor');
  assert.equal(JOB_PRESETS[2].drive, 'hydraulic');
  assert.equal(JOB_PRESETS[2].stops, 3);
  assert.equal(JOB_PRESETS[2].includePit, true);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Cheap special');
  assert.match(text, /HOME ELEVATOR BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /2 stops/);
  assert.match(text, /Pneumatic vacuum/);
  assert.match(text, /not an elevator specification/);
  assert.doesNotMatch(text, /52/);
  assert.doesNotMatch(text, /hourly wage/i);
});

test('kits reject unknown ids', () => {
  assert.throws(() => suggestedDriveKit('rope'), /Unknown drive/);
  assert.throws(() => suggestedHoistwayKit('attic'), /Unknown hoistway/);
  assert.throws(() => suggestedCabKit('leather'), /Unknown cab/);
});
