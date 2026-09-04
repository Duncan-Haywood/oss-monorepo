import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPanelCost,
  suggestedServiceKit,
  JOB_PRESETS,
  SERVICE_PRESETS,
  PANEL_STYLE_PRESETS,
  LOCATION_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursPanelSwap: 4,
  hoursServiceChange: 6,
  hoursUnderground: 5,
  hoursFinishedAccess: 3,
  hoursPerFeederFoot: 0.15,
  hoursPerCircuit: 0.35,
  hoursPerAfci: 0.2,
  hoursMeterSocket: 3,
  hoursGrounding: 2.5,
  hoursTemporaryPower: 2,
  hoursUtilityCoordination: 1.5,
  siteHours: 2,
  panelCost: 280,
  breakerCostEach: 12,
  afciCostEach: 48,
  seCablePerFoot: 8,
  mastKitCost: 185,
  meterSocketCost: 320,
  groundRodKit: 95,
  tempPowerCost: 175,
  permitFee: 185,
  utilityFee: 250,
  hourlyWage: 52,
  burdenRate: 34,
  travelAndEquipment: 165,
  overheadRate: 18,
  targetMargin: 30,
});

const brochure = () => ({
  ...rates(),
  existingAmps: 100,
  newAmps: 100,
  service: 'overhead',
  panelStyle: 'main-breaker',
  location: 'garage',
  feederFeet: 8,
  circuitCount: 10,
  afciCount: 0,
  replaceMeterSocket: false,
  newGrounding: false,
  temporaryPower: false,
});

const underground = () => ({
  ...rates(),
  existingAmps: 100,
  newAmps: 200,
  service: 'underground',
  panelStyle: 'meter-main',
  location: 'finished',
  feederFeet: 40,
  circuitCount: 20,
  afciCount: 20,
  replaceMeterSocket: true,
  newGrounding: true,
  temporaryPower: true,
  panelCost: 720,
  seCablePerFoot: 14,
  mastKitCost: 0,
});

test('same-amp swap hours come from the panel and the circuits, not from a service change', () => {
  const result = calculateBid(brochure());
  assert.equal(result.ampUpgrade, false);
  assert.equal(result.ampDelta, 0);
  assert.equal(result.swapHours, 4);
  assert.equal(result.serviceChangeHours, 0);
  assert.equal(result.pathHours, 0);
  assert.equal(result.meterHours, 0);
  assert.equal(result.utilityHours, 0);
  assert.equal(result.groundHours, 0);
  assert.equal(result.tempHours, 0);
  assert.ok(Math.abs(result.feederHours - 8 * 0.15) < 1e-9);
  assert.ok(Math.abs(result.circuitHours - 10 * 0.35) < 1e-9);
  assert.equal(result.afciHours, 0);
});

test('underground 200A extras do not scale with the amp rating on the label', () => {
  const result = calculateBid(underground());
  assert.equal(result.ampUpgrade, true);
  assert.equal(result.ampDelta, 100);
  assert.equal(result.serviceChangeHours, 6);
  assert.equal(result.pathHours, 5);
  assert.equal(result.accessHours, 3);
  assert.ok(Math.abs(result.feederHours - 6) < 1e-9);
  assert.ok(Math.abs(result.circuitHours - 7) < 1e-9);
  assert.ok(Math.abs(result.afciHours - 4) < 1e-9);
  assert.equal(result.meterHours, 3);
  assert.equal(result.groundHours, 2.5);
  assert.equal(result.tempHours, 2);
  assert.equal(result.utilityHours, 1.5);
  // Landing + service extras outrun the panel swap itself — that is
  // the user-visible reason a per-amp quote fails even when the new
  // rating looks ordinary.
  assert.ok(result.landingHours + result.serviceHours > result.swapHours);
});

test('a 200A underground job prices well above the brochure swap despite the same starting amp', () => {
  const swap = calculateBid(brochure());
  const upgrade = calculateBid(underground());
  assert.equal(swap.existingAmps, upgrade.existingAmps);
  assert.ok(upgrade.price > swap.price * 3, 'the underground job is a different job');
  assert.ok(upgrade.totalHours > swap.totalHours * 3);
  assert.equal(swap.pricePerUpgradeAmp, null);
  assert.ok(upgrade.pricePerUpgradeAmp > swap.pricePerNewAmp);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 52 * 1.34) < 1e-9);

  const expectedHours = 4 + 8 * 0.15 + 10 * 0.35 + 2;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 52 * 1.34) < 1e-9);

  const expectedMaterials = 280 + 10 * 12 + 8 * 8 + 185 + 185;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 165)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off meter, grounding, and temp power drops those hours and kits', () => {
  const full = calculateBid(underground());
  const stripped = calculateBid({
    ...underground(),
    replaceMeterSocket: false,
    newGrounding: false,
    temporaryPower: false,
  });
  assert.equal(stripped.meterHours, 0);
  assert.equal(stripped.groundHours, 0);
  assert.equal(stripped.tempHours, 0);
  assert.equal(stripped.meterMaterial, 0);
  assert.equal(stripped.groundMaterial, 0);
  assert.equal(stripped.tempMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Utility coordination still fires because this is still an amp upgrade.
  assert.equal(stripped.utilityHours, 1.5);
  assert.equal(stripped.utilityMaterial, 250);
});

test('same-amp jobs do not bill a utility disconnect fee', () => {
  const result = calculateBid(brochure());
  assert.equal(result.utilityMaterial, 0);
  assert.equal(result.utilityHours, 0);
});

test('suggested panel and service kits match the shipped presets', () => {
  assert.deepEqual(suggestedPanelCost('main-breaker', 100), { panelCost: 280 });
  assert.deepEqual(suggestedPanelCost('meter-main', 200), { panelCost: 720 });
  assert.deepEqual(suggestedPanelCost('meter-main', 400), { panelCost: 1450 });
  assert.deepEqual(suggestedServiceKit('overhead'), {
    seCablePerFoot: 8,
    mastKitCost: 185,
    hoursUnderground: 0,
  });
  assert.deepEqual(suggestedServiceKit('underground'), {
    seCablePerFoot: 14,
    mastKitCost: 0,
    hoursUnderground: 5,
  });
  assert.throws(() => suggestedPanelCost('load-center', 200), /Unknown panel/);
  assert.throws(() => suggestedServiceKit('network'), /Unknown service/);
});

test('unknown style, path, or location is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), panelStyle: 'load-center' }), /Unknown panel/);
  assert.throws(() => calculateBid({ ...brochure(), service: 'network' }), /Unknown service/);
  assert.throws(() => calculateBid({ ...brochure(), location: 'attic' }), /Unknown panel location/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), existingAmps: 0 }), /Existing service amps must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), newAmps: 0 }), /New service amps must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), afciCount: 12, circuitCount: 10 }), /cannot exceed/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), feederFeet: -1 }), /Feeder feet must be at least 0/);
});

test('job presets are usable and the underground job is not a markup on the swap', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const swap = JOB_PRESETS[0];
  const interior = JOB_PRESETS[2];
  assert.equal(swap.newAmps, swap.existingAmps);
  assert.equal(interior.service, 'underground');
  assert.equal(interior.temporaryPower, true);
  assert.ok(interior.feederFeet > swap.feederFeet);
  assert.ok(interior.afciCount > swap.afciCount);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...SERVICE_PRESETS, ...PANEL_STYLE_PRESETS, ...LOCATION_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the service extras', () => {
  const result = calculateBid(underground());
  const text = formatBidSummary(result, '100A to 200A underground');
  assert.match(text, /ELECTRICAL PANEL \/ SERVICE UPGRADE BID/);
  assert.match(text, /100A → 200A/);
  assert.match(text, /Underground/);
  assert.match(text, /temporary power included/);
  assert.match(text, /new grounding/);
  assert.doesNotMatch(text, /52/);
  assert.doesNotMatch(text, /wage/i);
});
