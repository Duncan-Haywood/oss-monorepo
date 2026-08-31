import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedCapacityKit,
  suggestedEquipmentKit,
  suggestedLocationKit,
  JOB_PRESETS,
  CAPACITY_PRESETS,
  EQUIPMENT_PRESETS,
  LOCATION_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1,
  hoursFurnaceBase: 4,
  hoursLocation: 0,
  hoursPerExtraDuctFoot: 0.12,
  hoursCoil: 2.25,
  hoursGas: 1.5,
  hoursHaul: 0.75,
  hoursThermostat: 0.6,
  siteHours: 0.75,
  furnaceCost: 1480,
  furnacePremium: 0,
  coilCost: 920,
  gasCost: 220,
  ductPerFoot: 12,
  haulFee: 125,
  thermostatCost: 260,
  permitFee: 175,
  hourlyWage: 52,
  burdenRate: 34,
  travelAndEquipment: 155,
  overheadRate: 18,
  targetMargin: 35,
});

const brochure = () => ({
  ...rates(),
  capacity: '60k',
  equipment: 'eighty',
  location: 'basement',
  ductFeet: 12,
  includedDuctFeet: 15,
  addCoil: false,
  addGas: false,
  haulAway: false,
  addThermostat: false,
});

const moneyLoser = () => ({
  ...rates(),
  capacity: '100k',
  equipment: 'condensing',
  location: 'attic',
  ductFeet: 40,
  includedDuctFeet: 15,
  hoursFurnaceBase: 5.25,
  hoursLocation: 2,
  furnaceCost: 2280,
  furnacePremium: 400,
  addCoil: true,
  addGas: true,
  haulAway: true,
  addThermostat: true,
});

test('brochure basement hours come from the trip and the set, not from attic or coil', () => {
  const result = calculateBid(brochure());
  assert.equal(result.addCoil, false);
  assert.equal(result.addGas, false);
  assert.equal(result.extraDuctFeet, 0);
  assert.equal(result.tripHours, 1);
  assert.equal(result.hangHours, 4);
  assert.equal(result.locationHours, 0);
  assert.equal(result.ductHours, 0);
  assert.equal(result.coilHours, 0);
  assert.equal(result.gasHours, 0);
  assert.equal(result.haulHours, 0);
  assert.equal(result.thermostatHours, 0);
  assert.equal(result.coilMaterial, 0);
  assert.equal(result.gasMaterial, 0);
  assert.equal(result.haulMaterial, 0);
  assert.equal(result.furnaceMaterial, 1480);
  assert.equal(result.permitMaterial, 175);
});

test('attic, extra duct, coil, gas, haul-away, and thermostat do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addCoil, true);
  assert.equal(result.extraDuctFeet, 25);
  assert.equal(result.coilHours, 2.25);
  assert.equal(result.gasHours, 1.5);
  assert.equal(result.haulHours, 0.75);
  assert.equal(result.thermostatHours, 0.6);
  assert.equal(result.locationHours, 2);
  assert.ok(Math.abs(result.ductHours - 25 * 0.12) < 1e-9);
  assert.ok(Math.abs(result.ductMaterial - 25 * 12) < 1e-9);
  assert.equal(result.furnaceMaterial, 2680);
  assert.equal(result.coilMaterial, 920);
  assert.equal(result.gasMaterial, 220);
  assert.equal(result.thermostatMaterial, 260);
  assert.equal(result.haulMaterial, 125);
  assert.ok(result.accessHours + result.packageHours > result.tripHours);
});

test('an attic coil-and-gas job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2, 'the attic-and-coil house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2);
  assert.equal(special.pricePerExtraDuctFoot, null);
  assert.ok(heavy.pricePerExtraDuctFoot > 0);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 52 * 1.34) < 1e-9);

  const expectedHours = 1 + 4 + 0.75;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 52 * 1.34) < 1e-9);

  const expectedMaterials = 1480 + 175;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 155)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 35) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 35) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off coil, gas, haul-away, thermostat, attic, and extra duct drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    equipment: 'eighty',
    location: 'basement',
    hoursFurnaceBase: 4,
    hoursLocation: 0,
    furnaceCost: 1480,
    furnacePremium: 0,
    ductFeet: 12,
    includedDuctFeet: 15,
    addCoil: false,
    addGas: false,
    haulAway: false,
    addThermostat: false,
  });
  assert.equal(stripped.coilHours, 0);
  assert.equal(stripped.gasHours, 0);
  assert.equal(stripped.haulHours, 0);
  assert.equal(stripped.thermostatHours, 0);
  assert.equal(stripped.ductHours, 0);
  assert.equal(stripped.coilMaterial, 0);
  assert.equal(stripped.thermostatMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.coilHours, 2.25);
  assert.equal(full.coilMaterial, 920);
});

test('a heat pump does not bill a gas upsize even when gas hours are filled, if gas is off', () => {
  const result = calculateBid({
    ...brochure(),
    equipment: 'heatpump',
    hoursFurnaceBase: 6,
    furnacePremium: 1600,
    hoursGas: 1.5,
    addGas: false,
  });
  assert.equal(result.gasHours, 0);
  assert.equal(result.gasMaterial, 0);
  assert.equal(result.hangHours, 6);
  assert.equal(result.furnaceMaterial, 3080);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedCapacityKit('60k'), { furnaceCost: 1480 });
  assert.deepEqual(suggestedCapacityKit('100k'), { furnaceCost: 2280 });
  assert.deepEqual(suggestedEquipmentKit('eighty'), { hoursFurnaceBase: 4, furnacePremium: 0 });
  assert.deepEqual(suggestedEquipmentKit('condensing'), { hoursFurnaceBase: 5.25, furnacePremium: 400 });
  assert.deepEqual(suggestedEquipmentKit('heatpump'), { hoursFurnaceBase: 6, furnacePremium: 1600 });
  assert.deepEqual(suggestedLocationKit('basement'), { hoursLocation: 0 });
  assert.deepEqual(suggestedLocationKit('attic'), { hoursLocation: 2 });
  assert.throws(() => suggestedCapacityKit('40k'), /Unknown furnace capacity/);
  assert.throws(() => suggestedEquipmentKit('oil'), /Unknown equipment type/);
  assert.throws(() => suggestedLocationKit('roof'), /Unknown install location/);
});

test('unknown capacity, equipment, or location is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), capacity: '40k' }), /Unknown furnace capacity/);
  assert.throws(() => calculateBid({ ...brochure(), equipment: 'oil' }), /Unknown equipment type/);
  assert.throws(() => calculateBid({ ...brochure(), location: 'roof' }), /Unknown install location/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), ductFeet: -1 }), /Duct run must be at least 0/);
});

test('job presets are usable and the attic-and-coil house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.equipment, 'eighty');
  assert.equal(special.location, 'basement');
  assert.equal(heavy.equipment, 'condensing');
  assert.equal(heavy.location, 'attic');
  assert.ok(heavy.ductFeet > special.ductFeet);
  assert.equal(heavy.addCoil, true);
  assert.equal(heavy.addGas, true);
  assert.equal(heavy.haulAway, true);
  assert.equal(heavy.addThermostat, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...CAPACITY_PRESETS, ...EQUIPMENT_PRESETS, ...LOCATION_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the attic extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, '100k attic coil and gas');
  assert.match(text, /FURNACE \/ HEAT PUMP REPLACEMENT BID/);
  assert.match(text, /40 ft of duct/);
  assert.match(text, /96% condensing/);
  assert.match(text, /Attic/);
  assert.match(text, /matching coil included/);
  assert.match(text, /gas upsize included/);
  assert.match(text, /haul-away of the old unit included/);
  assert.doesNotMatch(text, /52/);
  assert.doesNotMatch(text, /wage/i);
});
