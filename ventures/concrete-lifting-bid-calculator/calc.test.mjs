import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedMethodKit,
  suggestedAccessKit,
  voidCubicFeet,
  JOB_PRESETS,
  METHOD_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.2,
  hoursLift: 1.2,
  hoursAccess: 0,
  hoursPerCf: 0.18,
  hoursPerExtraHole: 0.35,
  hoursSeal: 1.1,
  hoursInterior: 2.2,
  siteHours: 0.4,
  materialPerCf: 7.5,
  extraHoleCost: 45,
  sealCost: 180,
  interiorKit: 240,
  mobilizationFee: 175,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 32,
  travelAndEquipment: 95,
  overheadRate: 16,
  targetMargin: 30,
});

const sidewalk = () => ({
  ...rates(),
  method: 'mud',
  access: 'drive',
  slabSqFt: 80,
  voidInches: 1,
  extraHoles: 0,
  addSeal: false,
});

const moneyLoser = () => ({
  ...rates(),
  method: 'poly',
  access: 'yard',
  hoursLift: 0.8,
  hoursAccess: 1.6,
  hoursPerCf: 0.09,
  materialPerCf: 48,
  slabSqFt: 400,
  voidInches: 4,
  extraHoles: 6,
  addSeal: true,
});

test('sidewalk special hours come from the trip, the lift, the 1-inch void, and site — not from extra holes, seal, or a backyard hose', () => {
  const result = calculateBid(sidewalk());
  assert.equal(result.addSeal, false);
  assert.equal(result.extraHoles, 0);
  assert.equal(result.tripHours, 1.2);
  assert.ok(Math.abs(result.liftHours - 1.2) < 1e-9);
  assert.equal(result.accessHours, 0);
  assert.ok(Math.abs(result.volumeCf - (80 / 12)) < 1e-9);
  assert.ok(Math.abs(result.pumpHours - ((80 / 12) * 0.18)) < 1e-9);
  assert.equal(result.extraHoleHours, 0);
  assert.equal(result.packageHours, 0);
  assert.ok(Math.abs(result.fillMaterial - ((80 / 12) * 7.5)) < 1e-9);
  assert.equal(result.extraHoleMaterial, 0);
  assert.equal(result.sealMaterial, 0);
  assert.equal(result.interiorMaterial, 0);
  assert.ok(Math.abs(result.mobilizationMaterial - 175) < 1e-9);
});

test('void cubic feet is area times depth over 12 — the number a per-square-foot special cannot see', () => {
  assert.ok(Math.abs(voidCubicFeet(80, 1) - 80 / 12) < 1e-9);
  assert.ok(Math.abs(voidCubicFeet(400, 4) - 400 * 4 / 12) < 1e-9);
  assert.equal(voidCubicFeet(200, 0), 0);
  assert.throws(() => voidCubicFeet(-1, 1), /Slab square feet must be at least 0/);
});

test('poly, 4-inch void, backyard, extra holes, and joint seal do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addSeal, true);
  assert.equal(result.extraHoles, 6);
  assert.ok(Math.abs(result.volumeCf - (400 * 4 / 12)) < 1e-9);
  assert.ok(Math.abs(result.liftHours - 0.8) < 1e-9);
  assert.ok(Math.abs(result.accessHours - 1.6) < 1e-9);
  assert.ok(Math.abs(result.pumpHours - ((400 * 4 / 12) * 0.09)) < 1e-9);
  assert.ok(Math.abs(result.extraHoleHours - (6 * 0.35)) < 1e-9);
  assert.ok(Math.abs(result.packageHours - 1.1) < 1e-9);
  assert.ok(Math.abs(result.fillMaterial - ((400 * 4 / 12) * 48)) < 1e-9);
  assert.ok(Math.abs(result.extraHoleMaterial - 270) < 1e-9);
  assert.ok(Math.abs(result.sealMaterial - 180) < 1e-9);
  assert.equal(result.interiorMaterial, 0);
  assert.ok(result.pumpHours + result.accessHours + result.extraHoleHours + result.packageHours > result.tripHours);
});

test('a four-inch poly backyard job prices well above the sidewalk special despite the same trip', () => {
  const special = calculateBid(sidewalk());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 6, 'the four-inch poly backyard is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 3);
  assert.ok(heavy.materialCost > special.materialCost);
  assert.ok(heavy.volumeCf > special.volumeCf * 8);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(sidewalk());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.32) < 1e-9);

  const expectedHours = 1.2 + 1.2 + (80 / 12) * 0.18 + 0.4;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.32) < 1e-9);

  const expectedMaterials = (80 / 12) * 7.5 + 175;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 95)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(Math.abs(result.pricePerSqFt - result.price / 80) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...sidewalk(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(sidewalk());
  const scored = calculateBid({ ...sidewalk(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(sidewalk());
  const scored = calculateBid({ ...sidewalk(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(sidewalk()).proposed, null);
  assert.equal(calculateBid({ ...sidewalk(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...sidewalk(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...sidewalk(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off poly, extra holes, seal, and backyard access drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    method: 'mud',
    access: 'drive',
    hoursLift: 1.2,
    hoursAccess: 0,
    hoursPerCf: 0.18,
    materialPerCf: 7.5,
    slabSqFt: 80,
    voidInches: 1,
    extraHoles: 0,
    addSeal: false,
  });
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.extraHoleHours, 0);
  assert.equal(stripped.extraHoleMaterial, 0);
  assert.equal(stripped.sealMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.sealMaterial > 0);
});

test('a zero-void call still prices — pump hours are the void, not an error', () => {
  const result = calculateBid({
    ...sidewalk(),
    voidInches: 0,
  });
  assert.equal(result.volumeCf, 0);
  assert.equal(result.pumpHours, 0);
  assert.equal(result.fillMaterial, 0);
  assert.ok(result.price > 0);
});

test('a street-side mud job does not also bill interior containment', () => {
  const result = calculateBid({
    ...sidewalk(),
    access: 'drive',
    hoursInterior: 2.2,
    interiorKit: 240,
  });
  assert.equal(result.packageHours, 0);
  assert.equal(result.interiorMaterial, 0);
});

test('an interior poly job bills containment and not a backyard hose as if they were the same adder', () => {
  const result = calculateBid({
    ...sidewalk(),
    method: 'poly',
    access: 'interior',
    hoursLift: 0.8,
    hoursAccess: 2.8,
    hoursPerCf: 0.09,
    materialPerCf: 48,
    slabSqFt: 200,
    voidInches: 2,
    extraHoles: 4,
    addSeal: true,
  });
  assert.ok(Math.abs(result.packageHours - (1.1 + 2.2)) < 1e-9);
  assert.ok(Math.abs(result.interiorMaterial - 240) < 1e-9);
  assert.ok(Math.abs(result.sealMaterial - 180) < 1e-9);
  assert.ok(Math.abs(result.extraHoleMaterial - 180) < 1e-9);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedMethodKit('mud'), { hoursLift: 1.2, hoursPerCf: 0.18, materialPerCf: 7.5 });
  assert.deepEqual(suggestedMethodKit('poly'), { hoursLift: 0.8, hoursPerCf: 0.09, materialPerCf: 48 });
  assert.deepEqual(suggestedAccessKit('drive'), { hoursAccess: 0 });
  assert.deepEqual(suggestedAccessKit('yard'), { hoursAccess: 1.6 });
  assert.deepEqual(suggestedAccessKit('interior'), { hoursAccess: 2.8 });
  assert.throws(() => suggestedMethodKit('epoxy'), /Unknown lift method/);
  assert.throws(() => suggestedAccessKit('helicopter'), /Unknown access path/);
});

test('unknown method or access is rejected', () => {
  assert.throws(() => calculateBid({ ...sidewalk(), method: 'epoxy' }), /Unknown lift method/);
  assert.throws(() => calculateBid({ ...sidewalk(), access: 'helicopter' }), /Unknown access path/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...sidewalk(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...sidewalk(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...sidewalk(), slabSqFt: -1 }), /Slab square feet must be at least 0/);
  assert.throws(() => calculateBid({ ...sidewalk(), extraHoles: -1 }), /Extra holes must be at least 0/);
});

test('job presets are usable and the poly backyard is not a markup on the sidewalk special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.method, 'mud');
  assert.equal(special.access, 'drive');
  assert.equal(special.voidInches, 1);
  assert.equal(heavy.method, 'poly');
  assert.equal(heavy.access, 'yard');
  assert.equal(heavy.voidInches, 4);
  assert.ok(heavy.slabSqFt > special.slabSqFt);
  assert.ok(heavy.extraHoles > special.extraHoles);
  assert.equal(heavy.addSeal, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...METHOD_PRESETS, ...ACCESS_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the method, void, and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Driveway 400 sf, 4-inch void, poly, backyard');
  assert.match(text, /CONCRETE LIFTING BID/);
  assert.match(text, /Polyurethane \/ polyjacking/);
  assert.match(text, /Backyard \/ hose and pump distance/);
  assert.match(text, /133\.3 cf of void/);
  assert.match(text, /6 extra holes included/);
  assert.match(text, /joint seal \/ crack fill included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
