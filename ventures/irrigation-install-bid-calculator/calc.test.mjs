import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedControllerKit,
  suggestedBackflowKit,
  suggestedSoilKit,
  JOB_PRESETS,
  CONTROLLER_PRESETS,
  BACKFLOW_PRESETS,
  SOIL_PRESETS,
  INCLUDED_HEADS_PER_ZONE,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.5,
  hoursPerZone: 1.6,
  hoursExtraHead: 0.12,
  hoursTrenchPerFoot: 0.045,
  soilHourFactor: 1,
  hoursController: 1.2,
  hoursBackflow: 1.4,
  hoursDrip: 3.2,
  hoursRain: 0.6,
  hoursMaster: 1.1,
  siteHours: 0.75,
  valveCost: 42,
  headCost: 9.5,
  pipeCostPerFoot: 1.15,
  controllerCost: 145,
  backflowCost: 185,
  dripCost: 285,
  rainCost: 55,
  masterCost: 95,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 15,
  targetMargin: 30,
});

const brochure = () => ({
  ...rates(),
  controller: 'six',
  backflow: 'pvb',
  soil: 'dirt',
  zones: 6,
  headsPerZone: 6,
  trenchFeet: 180,
  addDrip: false,
  addRain: false,
  addMaster: false,
});

const moneyLoser = () => ({
  ...rates(),
  controller: 'wifi',
  backflow: 'rpz15',
  soil: 'rock',
  zones: 10,
  headsPerZone: 10,
  trenchFeet: 420,
  hoursController: 1.8,
  hoursBackflow: 3.6,
  soilHourFactor: 2,
  controllerCost: 320,
  backflowCost: 780,
  addDrip: true,
  addRain: true,
  addMaster: true,
});

test('brochure 6-zone spray hours come from the trip, the zones, the trench, and the PVB — not from drip or rock', () => {
  const result = calculateBid(brochure());
  assert.equal(result.addDrip, false);
  assert.equal(result.addRain, false);
  assert.equal(result.addMaster, false);
  assert.equal(result.tripHours, 1.5);
  assert.ok(Math.abs(result.zoneHours - 6 * 1.6) < 1e-9);
  assert.equal(result.extraHeadHours, 0);
  assert.ok(Math.abs(result.trenchHours - 180 * 0.045) < 1e-9);
  assert.ok(Math.abs(result.controllerHours - 1.2) < 1e-9);
  assert.ok(Math.abs(result.backflowHours - 1.4) < 1e-9);
  assert.equal(result.dripHours, 0);
  assert.equal(result.dripMaterial, 0);
  assert.ok(Math.abs(result.valveMaterial - 6 * 42) < 1e-9);
  assert.ok(Math.abs(result.headMaterial - 36 * 9.5) < 1e-9);
  assert.ok(Math.abs(result.pipeMaterial - 180 * 1.15) < 1e-9);
  assert.equal(result.backflowMaterial, 185);
});

test('extra heads, rock trench, a 1.5-inch RPZ, drip, rain, and a master valve do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addDrip, true);
  assert.equal(result.controller, 'wifi');
  assert.equal(result.backflow, 'rpz15');
  assert.ok(Math.abs(result.zoneHours - 10 * 1.6) < 1e-9);
  assert.ok(Math.abs(result.extraHeadHours - 10 * 4 * 0.12) < 1e-9);
  assert.ok(Math.abs(result.trenchHours - 420 * 0.045 * 2) < 1e-9);
  assert.ok(Math.abs(result.dripHours - 3.2) < 1e-9);
  assert.ok(Math.abs(result.rainHours - 0.6) < 1e-9);
  assert.ok(Math.abs(result.masterHours - 1.1) < 1e-9);
  assert.ok(Math.abs(result.dripMaterial - 285) < 1e-9);
  assert.ok(Math.abs(result.backflowMaterial - 780) < 1e-9);
  assert.ok(result.zoneHours + result.trenchHours + result.packageHours > result.tripHours);
});

test('a 10-zone rock drip job prices well above the $400/zone special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2.5, 'the rock drip yard is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2.5);
  assert.ok(heavy.materialCost > special.materialCost);
  assert.ok(heavy.pricePerZone > special.pricePerZone);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);

  const expectedHours = 1.5 + 9.6 + 0 + 8.1 + 1.2 + 1.4 + 0.75;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = 6 * 42 + 36 * 9.5 + 180 * 1.15 + 145 + 185;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(Math.abs(result.pricePerZone - result.price / 6) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('the published $400/zone special loses money even on the brochure 6-zone spray system', () => {
  const scored = calculateBid({ ...brochure(), proposedPrice: 6 * 400 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.breakEvenPrice > 2400);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off extras, rock, and the oversized RPZ drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    controller: 'six',
    backflow: 'pvb',
    soil: 'dirt',
    zones: 6,
    headsPerZone: 6,
    trenchFeet: 180,
    hoursController: 1.2,
    hoursBackflow: 1.4,
    soilHourFactor: 1,
    controllerCost: 145,
    backflowCost: 185,
    addDrip: false,
    addRain: false,
    addMaster: false,
  });
  assert.equal(stripped.dripHours, 0);
  assert.equal(stripped.extraHeadHours, 0);
  assert.equal(stripped.dripMaterial, 0);
  assert.equal(stripped.masterMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.pipeMaterial > stripped.pipeMaterial);
});

test('a 3/4-inch PVB does not bill a 1.5-inch RPZ kit', () => {
  const result = calculateBid({
    ...brochure(),
    backflow: 'pvb',
    hoursBackflow: 1.4,
    backflowCost: 185,
  });
  assert.equal(result.backflowMaterial, 185);
  assert.ok(result.price < calculateBid({
    ...brochure(),
    backflow: 'rpz15',
    hoursBackflow: 3.6,
    backflowCost: 780,
  }).price);
});

test('rock without drip or a master valve does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    soil: 'rock',
    soilHourFactor: 2,
    addDrip: false,
    addMaster: false,
  });
  assert.equal(result.dripMaterial, 0);
  assert.equal(result.masterMaterial, 0);
  assert.ok(Math.abs(result.trenchHours - 180 * 0.045 * 2) < 1e-9);
});

test('turning extras off still prices — extra hours are zero, not an error', () => {
  const result = calculateBid({
    ...brochure(),
    addDrip: false,
    addRain: false,
    addMaster: false,
  });
  assert.equal(result.packageHours, 0);
  assert.equal(result.dripMaterial, 0);
  assert.equal(result.rainMaterial, 0);
});

test('heads at the included count do not bill extra-head hours', () => {
  const result = calculateBid({ ...brochure(), headsPerZone: INCLUDED_HEADS_PER_ZONE });
  assert.equal(result.extraHeadHours, 0);
  assert.equal(result.extraHeadsPerZone, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedControllerKit('six'), { hoursController: 1.2, controllerCost: 145 });
  assert.deepEqual(suggestedControllerKit('wifi'), { hoursController: 1.8, controllerCost: 320 });
  assert.deepEqual(suggestedBackflowKit('pvb'), { hoursBackflow: 1.4, backflowCost: 185 });
  assert.deepEqual(suggestedBackflowKit('rpz15'), { hoursBackflow: 3.6, backflowCost: 780 });
  assert.deepEqual(suggestedSoilKit('dirt'), { soilHourFactor: 1 });
  assert.deepEqual(suggestedSoilKit('clay'), { soilHourFactor: 1.4 });
  assert.deepEqual(suggestedSoilKit('rock'), { soilHourFactor: 2 });
  assert.throws(() => suggestedControllerKit('battery'), /Unknown irrigation controller/);
  assert.throws(() => suggestedBackflowKit('dcva'), /Unknown irrigation backflow/);
  assert.throws(() => suggestedSoilKit('sand'), /Unknown irrigation soil/);
});

test('unknown controller, backflow, or soil is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), controller: 'battery' }), /Unknown irrigation controller/);
  assert.throws(() => calculateBid({ ...brochure(), backflow: 'dcva' }), /Unknown irrigation backflow/);
  assert.throws(() => calculateBid({ ...brochure(), soil: 'sand' }), /Unknown irrigation soil/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), zones: -1 }), /Zones must be at least 0/);
});

test('job presets are usable and the rock drip yard is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.controller, 'six');
  assert.equal(special.backflow, 'pvb');
  assert.equal(special.zones, 6);
  assert.equal(heavy.controller, 'wifi');
  assert.equal(heavy.backflow, 'rpz15');
  assert.equal(heavy.soil, 'rock');
  assert.equal(heavy.addDrip, true);
  assert.equal(heavy.addMaster, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [
    ...CONTROLLER_PRESETS, ...BACKFLOW_PRESETS, ...SOIL_PRESETS,
  ]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the zones and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Rock drip backyard');
  assert.match(text, /IRRIGATION SYSTEM INSTALL BID/);
  assert.match(text, /10 zones/);
  assert.match(text, /100 heads/);
  assert.match(text, /420 ft trench/);
  assert.match(text, /Wi-Fi \/ weather controller/);
  assert.match(text, /1\.5-inch RPZ/);
  assert.match(text, /Rock \/ hardpan/);
  assert.match(text, /drip conversion included/);
  assert.match(text, /master valve included/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});

test('pinned brochure and heavy prices stay the numbers the SEO page cites', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.ok(Math.abs(special.price - 3855.963142857143) < 1e-6);
  assert.ok(Math.abs(special.totalHours - 22.55) < 1e-9);
  assert.ok(Math.abs(special.breakEvenPrice - 2699.1742) < 1e-4);
  assert.ok(Math.abs(heavy.price - 11568.8094) < 1e-3);
  assert.ok(Math.abs(heavy.totalHours - 71.15) < 1e-9);
  assert.ok(Math.abs(heavy.breakEvenPrice - 8098.16658) < 1e-3);
});
