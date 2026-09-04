import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedCapacityKit,
  suggestedSystemKit,
  suggestedWorkKit,
  suggestedPipeKit,
  JOB_PRESETS,
  CAPACITY_PRESETS,
  SYSTEM_PRESETS,
  WORK_PRESETS,
  PIPE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 0.5,
  hoursSoftenerBase: 1.75,
  hoursPerExtraPipeFoot: 0.08,
  hoursDrainBase: 0.25,
  hoursPerExtraDrainFoot: 0.04,
  hoursIron: 1.5,
  hoursRo: 1.25,
  hoursHaulAway: 0.5,
  hoursElectrical: 0.75,
  siteHours: 0.4,
  softenerCost: 380,
  ironCost: 620,
  roCost: 340,
  bypassCost: 65,
  pipePerFoot: 1.2,
  drainFittingCost: 35,
  drainPerFoot: 1.4,
  haulFee: 45,
  electricalCost: 95,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 18,
  targetMargin: 35,
});

const brochure = () => ({
  ...rates(),
  capacity: '32k',
  system: 'salt',
  work: 'softener',
  pipe: 'pex',
  pipeFeet: 8,
  includedPipeFeet: 10,
  drainFeet: 6,
  includedDrainFeet: 15,
  haulAway: false,
  addElectrical: false,
});

const moneyLoser = () => ({
  ...rates(),
  capacity: '64k',
  system: 'salt',
  work: 'softener-iron',
  pipe: 'copper',
  pipeFeet: 45,
  includedPipeFeet: 10,
  drainFeet: 40,
  includedDrainFeet: 15,
  hoursPerExtraPipeFoot: 0.16,
  pipePerFoot: 8.5,
  softenerCost: 780,
  haulAway: true,
  addElectrical: true,
});

test('brochure hang hours come from the trip and the hang, not from iron or copper', () => {
  const result = calculateBid(brochure());
  assert.equal(result.addIron, false);
  assert.equal(result.addRo, false);
  assert.equal(result.needsDrain, true);
  assert.equal(result.extraPipeFeet, 0);
  assert.equal(result.extraDrainFeet, 0);
  assert.equal(result.tripHours, 0.5);
  assert.equal(result.hangHours, 1.75);
  assert.equal(result.pipeHours, 0);
  assert.equal(result.drainHours, 0.25);
  assert.equal(result.ironHours, 0);
  assert.equal(result.roHours, 0);
  assert.equal(result.haulHours, 0);
  assert.equal(result.electricalHours, 0);
  assert.equal(result.ironMaterial, 0);
  assert.equal(result.roMaterial, 0);
  assert.equal(result.haulMaterial, 0);
  assert.equal(result.pipeMaterial, 0);
  assert.equal(result.drainMaterial, 35);
  assert.equal(result.bypassMaterial, 65);
});

test('extra copper, iron, drain, haul-away, and receptacle do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addIron, true);
  assert.equal(result.extraPipeFeet, 35);
  assert.equal(result.extraDrainFeet, 25);
  assert.equal(result.ironHours, 1.5);
  assert.equal(result.haulHours, 0.5);
  assert.equal(result.electricalHours, 0.75);
  assert.ok(Math.abs(result.pipeHours - 35 * 0.16) < 1e-9);
  assert.ok(Math.abs(result.drainHours - (0.25 + 25 * 0.04)) < 1e-9);
  assert.ok(Math.abs(result.pipeMaterial - 35 * 8.5) < 1e-9);
  assert.ok(Math.abs(result.drainMaterial - (35 + 25 * 1.4)) < 1e-9);
  assert.equal(result.softenerMaterial, 780);
  assert.equal(result.ironMaterial, 620);
  assert.equal(result.electricalMaterial, 95);
  assert.equal(result.haulMaterial, 45);
  // Access extras + extra footage outrun the trip itself — that is the
  // user-visible reason a trip-charge special fails even when the job
  // still looks like "one softener."
  assert.ok(result.runHours + result.packageHours > result.tripHours);
});

test('a 64k copper-and-iron job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2.4, 'the copper-and-iron house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2);
  assert.equal(special.pricePerExtraPipeFoot, null);
  assert.ok(heavy.pricePerExtraPipeFoot > 0);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.32) < 1e-9);

  const expectedHours = 0.5 + 1.75 + 0.25 + 0.4;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.32) < 1e-9);

  const expectedMaterials = 380 + 65 + 35;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
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

test('turning off iron, haul-away, receptacle, and extra copper drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    work: 'softener',
    pipe: 'pex',
    hoursPerExtraPipeFoot: 0.08,
    pipePerFoot: 1.2,
    pipeFeet: 8,
    includedPipeFeet: 10,
    drainFeet: 6,
    includedDrainFeet: 15,
    haulAway: false,
    addElectrical: false,
  });
  assert.equal(stripped.ironHours, 0);
  assert.equal(stripped.haulHours, 0);
  assert.equal(stripped.electricalHours, 0);
  assert.equal(stripped.pipeHours, 0);
  assert.equal(stripped.ironMaterial, 0);
  assert.equal(stripped.electricalMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.ironHours, 1.5);
  assert.equal(full.ironMaterial, 620);
});

test('a salt-free job does not bill a brine drain even when drain footage is entered', () => {
  const result = calculateBid({
    ...brochure(),
    system: 'salt-free',
    hoursSoftenerBase: 1.5,
    hoursDrainBase: 0.25,
    drainFittingCost: 35,
    drainFeet: 40,
    includedDrainFeet: 15,
  });
  assert.equal(result.needsDrain, false);
  assert.equal(result.drainHours, 0);
  assert.equal(result.extraDrainFeet, 0);
  assert.equal(result.drainMaterial, 0);
  assert.equal(result.hangHours, 1.5);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedCapacityKit('32k'), { softenerCost: 380 });
  assert.deepEqual(suggestedCapacityKit('64k'), { softenerCost: 780 });
  assert.deepEqual(suggestedSystemKit('salt'), {
    hoursSoftenerBase: 1.75, hoursDrainBase: 0.25, drainFittingCost: 35,
  });
  assert.deepEqual(suggestedSystemKit('salt-free'), {
    hoursSoftenerBase: 1.5, hoursDrainBase: 0, drainFittingCost: 0,
  });
  assert.deepEqual(suggestedWorkKit('softener'), {
    hoursIron: 0, ironCost: 0, hoursRo: 0, roCost: 0,
  });
  assert.deepEqual(suggestedWorkKit('softener-iron'), {
    hoursIron: 1.5, ironCost: 620, hoursRo: 0, roCost: 0,
  });
  assert.deepEqual(suggestedPipeKit('pex'), { hoursPerExtraPipeFoot: 0.08, pipePerFoot: 1.2 });
  assert.deepEqual(suggestedPipeKit('copper'), { hoursPerExtraPipeFoot: 0.16, pipePerFoot: 8.5 });
  assert.throws(() => suggestedCapacityKit('80k'), /Unknown grain capacity/);
  assert.throws(() => suggestedSystemKit('uv'), /Unknown system type/);
  assert.throws(() => suggestedWorkKit('whole-house'), /Unknown work/);
  assert.throws(() => suggestedPipeKit('cpvc'), /Unknown pipe/);
});

test('unknown capacity, system, work, or pipe is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), capacity: '80k' }), /Unknown grain capacity/);
  assert.throws(() => calculateBid({ ...brochure(), system: 'uv' }), /Unknown system type/);
  assert.throws(() => calculateBid({ ...brochure(), work: 'whole-house' }), /Unknown work/);
  assert.throws(() => calculateBid({ ...brochure(), pipe: 'cpvc' }), /Unknown pipe/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), pipeFeet: 0 }), /Pipe run must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), drainFeet: -1 }), /Drain run must be at least 0/);
});

test('job presets are usable and the copper-and-iron house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.work, 'softener');
  assert.equal(special.pipe, 'pex');
  assert.equal(heavy.work, 'softener-iron');
  assert.equal(heavy.pipe, 'copper');
  assert.ok(heavy.pipeFeet > special.pipeFeet);
  assert.equal(heavy.haulAway, true);
  assert.equal(heavy.addElectrical, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...CAPACITY_PRESETS, ...SYSTEM_PRESETS, ...WORK_PRESETS, ...PIPE_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the pipe extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, '64k copper and iron');
  assert.match(text, /WATER SOFTENER \/ IRON FILTER BID/);
  assert.match(text, /45 ft of pipe/);
  assert.match(text, /Copper/);
  assert.match(text, /iron filter included/);
  assert.match(text, /haul-away of the old unit included/);
  assert.match(text, /brine receptacle included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
