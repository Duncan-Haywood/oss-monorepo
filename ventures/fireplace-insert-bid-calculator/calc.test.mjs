import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedSizeKit,
  suggestedFuelKit,
  suggestedChimneyKit,
  suggestedAccessKit,
  JOB_PRESETS,
  FUEL_PRESETS,
  SIZE_PRESETS,
  CHIMNEY_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.5,
  hoursSet: 3.5,
  hoursSetPremium: 0,
  hoursAccess: 0,
  hoursChimney: 8,
  hoursPerLinerFoot: 0.18,
  hoursHearth: 2.5,
  hoursGasLine: 2.2,
  hoursCircuit: 1.8,
  hoursSurround: 2.0,
  hoursDamper: 0.8,
  hoursTearOut: 1.5,
  siteHours: 0.5,
  unitCost: 1850,
  unitCostMultiplier: 1,
  linerKit: 280,
  linerPerFoot: 28,
  rebuildMaterial: 2200,
  hearthCost: 380,
  gasLineCost: 420,
  circuitCost: 340,
  surroundCost: 520,
  damperCost: 95,
  dumpFee: 85,
  permitFee: 125,
  hourlyWage: 48,
  burdenRate: 34,
  travelAndEquipment: 145,
  overheadRate: 18,
  targetMargin: 32,
});

const brochure = () => ({
  ...rates(),
  fuel: 'gas',
  size: 'small',
  chimney: 'none',
  access: 'one',
  linerFeet: 0,
  addHearth: false,
  addGasLine: false,
  addCircuit: false,
  addSurround: false,
  addDamper: false,
  tearOut: true,
});

const moneyLoser = () => ({
  ...rates(),
  fuel: 'wood',
  size: 'large',
  chimney: 'liner',
  access: 'two',
  hoursSet: 5.6,
  hoursSetPremium: 0.7,
  hoursAccess: 1.4,
  unitCost: 2900,
  unitCostMultiplier: 1.62,
  linerFeet: 30,
  addHearth: true,
  addGasLine: false,
  addCircuit: false,
  addSurround: true,
  addDamper: true,
  tearOut: true,
});

test('brochure gas hang hours come from the trip, the set, and tear-out — not from a liner or hearth', () => {
  const result = calculateBid(brochure());
  assert.equal(result.tearOut, true);
  assert.equal(result.addHearth, false);
  assert.equal(result.tripHours, 1.5);
  assert.ok(Math.abs(result.setHours - 3.5) < 1e-9);
  assert.equal(result.accessHours, 0);
  assert.equal(result.chimneyHours, 0);
  assert.ok(Math.abs(result.packageHours - 1.5) < 1e-9);
  assert.ok(Math.abs(result.insertMaterial - 1850) < 1e-9);
  assert.equal(result.linerMaterial, 0);
  assert.equal(result.hearthMaterial, 0);
  assert.ok(Math.abs(result.dumpMaterial - 85) < 1e-9);
});

test('liner footage, hearth, surround, and a second story do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addHearth, true);
  assert.equal(result.addSurround, true);
  assert.ok(Math.abs(result.setHours - (5.6 + 0.7)) < 1e-9);
  assert.ok(Math.abs(result.accessHours - 1.4) < 1e-9);
  assert.ok(Math.abs(result.chimneyHours - (30 * 0.18)) < 1e-9);
  assert.ok(Math.abs(result.packageHours - (2.5 + 2.0 + 0.8 + 1.5)) < 1e-9);
  assert.ok(Math.abs(result.insertMaterial - 2900 * 1.62) < 1e-9);
  assert.ok(Math.abs(result.linerMaterial - (280 + 30 * 28)) < 1e-9);
  assert.ok(Math.abs(result.hearthMaterial - 380) < 1e-9);
  assert.ok(result.chimneyHours + result.packageHours + result.accessHours > result.tripHours);
});

test('a wood-and-liner job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2.5, 'the wood-and-liner house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2.5);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 48 * 1.34) < 1e-9);

  const expectedHours = 1.5 + 3.5 + 1.5 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 48 * 1.34) < 1e-9);

  const expectedMaterials = 1850 + 85 + 125;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 145)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 32) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 32) < 1e-9);
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

test('turning off liner, hearth, and wood drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    fuel: 'gas',
    size: 'small',
    chimney: 'none',
    access: 'one',
    hoursSet: 3.5,
    hoursSetPremium: 0,
    hoursAccess: 0,
    unitCost: 1850,
    unitCostMultiplier: 1,
    linerFeet: 0,
    addHearth: false,
    addSurround: false,
    addDamper: false,
  });
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.chimneyHours, 0);
  assert.equal(stripped.linerMaterial, 0);
  assert.equal(stripped.hearthMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.linerMaterial > 0);
});

test('a liner job without footage still prices — liner hours are zero, not an error', () => {
  const result = calculateBid({
    ...brochure(),
    chimney: 'liner',
    linerFeet: 0,
  });
  assert.equal(result.chimneyHours, 0);
  assert.ok(Math.abs(result.linerMaterial - 280) < 1e-9);
});

test('a rebuild package does not also bill liner footage', () => {
  const result = calculateBid({
    ...brochure(),
    chimney: 'rebuild',
    hoursChimney: 8,
    linerFeet: 30,
  });
  assert.ok(Math.abs(result.chimneyHours - 8) < 1e-9);
  assert.equal(result.linerMaterial, 0);
  assert.ok(Math.abs(result.rebuildMat - 2200) < 1e-9);
});

test('a pellet hang without a circuit or hearth does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    fuel: 'pellet',
    hoursSetPremium: 0.5,
    unitCost: 2450,
    addCircuit: false,
    addHearth: false,
  });
  assert.equal(result.circuitMaterial, 0);
  assert.equal(result.hearthMaterial, 0);
  assert.ok(Math.abs(result.setHours - (3.5 + 0.5)) < 1e-9);
  assert.ok(Math.abs(result.insertMaterial - 2450) < 1e-9);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedSizeKit('small'), { hoursSet: 3.5, unitCostMultiplier: 1 });
  assert.deepEqual(suggestedSizeKit('large'), { hoursSet: 5.6, unitCostMultiplier: 1.62 });
  assert.deepEqual(suggestedFuelKit('gas'), { unitCost: 1850, hoursSetPremium: 0 });
  assert.deepEqual(suggestedFuelKit('pellet'), { unitCost: 2450, hoursSetPremium: 0.5 });
  assert.deepEqual(suggestedFuelKit('wood'), { unitCost: 2900, hoursSetPremium: 0.7 });
  assert.deepEqual(suggestedChimneyKit('none'), { hoursChimney: 0 });
  assert.deepEqual(suggestedChimneyKit('liner'), { hoursChimney: 0 });
  assert.deepEqual(suggestedChimneyKit('rebuild'), { hoursChimney: 8 });
  assert.deepEqual(suggestedAccessKit('one'), { hoursAccess: 0 });
  assert.deepEqual(suggestedAccessKit('two'), { hoursAccess: 1.4 });
  assert.throws(() => suggestedSizeKit('xl'), /Unknown insert size/);
  assert.throws(() => suggestedFuelKit('oil'), /Unknown insert fuel/);
  assert.throws(() => suggestedChimneyKit('cap-only'), /Unknown chimney scope/);
  assert.throws(() => suggestedAccessKit('three'), /Unknown access \/ stack height/);
});

test('unknown fuel, size, chimney, or access is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), fuel: 'oil' }), /Unknown insert fuel/);
  assert.throws(() => calculateBid({ ...brochure(), size: 'xl' }), /Unknown insert size/);
  assert.throws(() => calculateBid({ ...brochure(), chimney: 'cap-only' }), /Unknown chimney scope/);
  assert.throws(() => calculateBid({ ...brochure(), access: 'three' }), /Unknown access \/ stack height/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), linerFeet: -1 }), /Liner footage must be at least 0/);
});

test('job presets are usable and the wood house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.fuel, 'gas');
  assert.equal(special.size, 'small');
  assert.equal(special.chimney, 'none');
  assert.equal(heavy.fuel, 'wood');
  assert.equal(heavy.size, 'large');
  assert.equal(heavy.chimney, 'liner');
  assert.ok(heavy.linerFeet > special.linerFeet);
  assert.equal(heavy.addHearth, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...FUEL_PRESETS, ...SIZE_PRESETS, ...CHIMNEY_PRESETS, ...ACCESS_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the fuel, liner, and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Wood insert, 30 ft liner, hearth, and surround');
  assert.match(text, /FIREPLACE INSERT INSTALL BID/);
  assert.match(text, /Wood-burning insert/);
  assert.match(text, /Large \/ high-output/);
  assert.match(text, /Two-story/);
  assert.match(text, /30 ft stainless liner/);
  assert.match(text, /new hearth pad included/);
  assert.match(text, /surround \/ mantel included/);
  assert.doesNotMatch(text, /48/);
  assert.doesNotMatch(text, /wage/i);
});
