import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedSizeKit,
  suggestedAccessKit,
  suggestedPowerKit,
  JOB_PRESETS,
  SIZE_PRESETS,
  ACCESS_PRESETS,
  POWER_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.5,
  hoursSet: 2.5,
  hoursAccess: 0,
  hoursPower: 1.2,
  hoursPerCircuitFoot: 0.06,
  hoursPad: 3.5,
  hoursHaul: 1.8,
  hoursCoverLift: 0.8,
  hoursSteps: 0.6,
  hoursGas: 2.4,
  siteHours: 0.5,
  unitCost: 4800,
  unitCostMultiplier: 1,
  craneFee: 850,
  circuitKit: 220,
  circuitPerFoot: 9.5,
  padCost: 980,
  haulFee: 185,
  coverLiftCost: 420,
  stepsCost: 160,
  gasCost: 380,
  permitFee: 165,
  hourlyWage: 48,
  burdenRate: 34,
  travelAndEquipment: 145,
  overheadRate: 18,
  targetMargin: 32,
});

const brochure = () => ({
  ...rates(),
  size: 'compact',
  access: 'drive',
  power: 'existing',
  circuitFeet: 0,
  addPad: false,
  addHaul: false,
  addCoverLift: false,
  addSteps: false,
  addGas: false,
});

const moneyLoser = () => ({
  ...rates(),
  size: 'large',
  access: 'crane',
  power: 'run60',
  hoursSet: 5.2,
  hoursAccess: 3.6,
  unitCostMultiplier: 2.1,
  circuitFeet: 60,
  addPad: true,
  addHaul: true,
  addCoverLift: true,
  addSteps: true,
  addGas: false,
});

test('brochure driveway drop hours come from the trip, the set, and site — not from a crane, pad, or circuit', () => {
  const result = calculateBid(brochure());
  assert.equal(result.addPad, false);
  assert.equal(result.addHaul, false);
  assert.equal(result.tripHours, 1.5);
  assert.ok(Math.abs(result.setHours - 2.5) < 1e-9);
  assert.equal(result.accessHours, 0);
  assert.equal(result.powerHours, 0);
  assert.equal(result.packageHours, 0);
  assert.ok(Math.abs(result.spaMaterial - 4800) < 1e-9);
  assert.equal(result.craneMaterial, 0);
  assert.equal(result.circuitMaterial, 0);
  assert.equal(result.padMaterial, 0);
  assert.ok(Math.abs(result.permitMaterial - 165) < 1e-9);
});

test('crane, 60-ft circuit, pad, haul, and cover lift do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addPad, true);
  assert.equal(result.addHaul, true);
  assert.equal(result.addCoverLift, true);
  assert.ok(Math.abs(result.setHours - 5.2) < 1e-9);
  assert.ok(Math.abs(result.accessHours - 3.6) < 1e-9);
  assert.ok(Math.abs(result.powerHours - (1.2 + 60 * 0.06)) < 1e-9);
  assert.ok(Math.abs(result.packageHours - (3.5 + 1.8 + 0.8 + 0.6)) < 1e-9);
  assert.ok(Math.abs(result.spaMaterial - 4800 * 2.1) < 1e-9);
  assert.ok(Math.abs(result.craneMaterial - 850) < 1e-9);
  assert.ok(Math.abs(result.circuitMaterial - (220 + 60 * 9.5)) < 1e-9);
  assert.ok(Math.abs(result.padMaterial - 980) < 1e-9);
  assert.ok(result.accessHours + result.powerHours + result.packageHours > result.tripHours);
});

test('a crane-and-pad job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 1.8, 'the crane-and-pad house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 3);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 48 * 1.34) < 1e-9);

  const expectedHours = 1.5 + 2.5 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 48 * 1.34) < 1e-9);

  const expectedMaterials = 4800 + 165;
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

test('turning off crane, circuit, pad, and extras drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    size: 'compact',
    access: 'drive',
    power: 'existing',
    hoursSet: 2.5,
    hoursAccess: 0,
    unitCostMultiplier: 1,
    circuitFeet: 0,
    addPad: false,
    addHaul: false,
    addCoverLift: false,
    addSteps: false,
  });
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.powerHours, 0);
  assert.equal(stripped.craneMaterial, 0);
  assert.equal(stripped.circuitMaterial, 0);
  assert.equal(stripped.padMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.craneMaterial > 0);
});

test('a new circuit without footage still prices — circuit hours are the disconnect, not an error', () => {
  const result = calculateBid({
    ...brochure(),
    power: 'run50',
    hoursPower: 0,
    circuitFeet: 0,
  });
  assert.equal(result.powerHours, 0);
  assert.ok(Math.abs(result.circuitMaterial - 220) < 1e-9);
});

test('an existing 50A stub does not also bill circuit footage', () => {
  const result = calculateBid({
    ...brochure(),
    power: 'existing',
    circuitFeet: 60,
    hoursPower: 1.2,
  });
  assert.equal(result.powerHours, 0);
  assert.equal(result.circuitMaterial, 0);
});

test('a 60A disconnect without a crane or pad does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    power: 'run60',
    circuitFeet: 20,
    hoursPower: 1.2,
    addPad: false,
    access: 'drive',
    hoursAccess: 0,
  });
  assert.equal(result.craneMaterial, 0);
  assert.equal(result.padMaterial, 0);
  assert.ok(Math.abs(result.powerHours - (1.2 + 20 * 0.06)) < 1e-9);
  assert.ok(Math.abs(result.circuitMaterial - (220 + 20 * 9.5)) < 1e-9);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedSizeKit('compact'), { hoursSet: 2.5, unitCostMultiplier: 1 });
  assert.deepEqual(suggestedSizeKit('large'), { hoursSet: 5.2, unitCostMultiplier: 2.1 });
  assert.deepEqual(suggestedAccessKit('drive'), { hoursAccess: 0 });
  assert.deepEqual(suggestedAccessKit('gate'), { hoursAccess: 1.8 });
  assert.deepEqual(suggestedAccessKit('crane'), { hoursAccess: 3.6 });
  assert.deepEqual(suggestedPowerKit('existing'), { hoursPower: 0 });
  assert.deepEqual(suggestedPowerKit('run50'), { hoursPower: 0 });
  assert.deepEqual(suggestedPowerKit('run60'), { hoursPower: 1.2 });
  assert.throws(() => suggestedSizeKit('xl'), /Unknown spa size/);
  assert.throws(() => suggestedAccessKit('helicopter'), /Unknown access path/);
  assert.throws(() => suggestedPowerKit('120v'), /Unknown power scope/);
});

test('unknown size, access, or power is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), size: 'xl' }), /Unknown spa size/);
  assert.throws(() => calculateBid({ ...brochure(), access: 'helicopter' }), /Unknown access path/);
  assert.throws(() => calculateBid({ ...brochure(), power: '120v' }), /Unknown power scope/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), circuitFeet: -1 }), /Circuit footage must be at least 0/);
});

test('job presets are usable and the crane house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.size, 'compact');
  assert.equal(special.access, 'drive');
  assert.equal(special.power, 'existing');
  assert.equal(heavy.size, 'large');
  assert.equal(heavy.access, 'crane');
  assert.equal(heavy.power, 'run60');
  assert.ok(heavy.circuitFeet > special.circuitFeet);
  assert.equal(heavy.addPad, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...SIZE_PRESETS, ...ACCESS_PRESETS, ...POWER_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the size, crane, and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Large swim spa, crane, pad, and 60A');
  assert.match(text, /HOT TUB \/ SPA INSTALL BID/);
  assert.match(text, /Large \/ swim spa/);
  assert.match(text, /Crane \/ boom over fence or house/);
  assert.match(text, /60 ft new circuit/);
  assert.match(text, /new concrete pad included/);
  assert.match(text, /cover lift included/);
  assert.doesNotMatch(text, /48/);
  assert.doesNotMatch(text, /wage/i);
});
