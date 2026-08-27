import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedConfigKit,
  suggestedFrameKit,
  suggestedGlazingKit,
  suggestedInstallKit,
  suggestedAccessKit,
  JOB_PRESETS,
  CONFIG_PRESETS,
  FRAME_PRESETS,
  GLAZING_PRESETS,
  INSTALL_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1,
  hoursSet: 4.5,
  hoursSetPremium: 0,
  hoursGlazingPremium: 0,
  setHourFactor: 1,
  hoursNewcon: 0,
  hoursAccess: 0,
  hoursScreen: 0.9,
  hoursTransom: 1.4,
  hoursInteriorTrim: 1.2,
  hoursSillPan: 1.5,
  hoursThreshold: 1.3,
  hoursTearOut: 1.4,
  siteHours: 0.5,
  unitCost: 980,
  unitCostMultiplier: 1,
  glazingCostFactor: 1,
  screenCost: 95,
  transomCost: 380,
  trimCost: 140,
  sillPanCost: 165,
  thresholdCost: 95,
  dumpFee: 65,
  permitFee: 0,
  hourlyWage: 48,
  burdenRate: 32,
  travelAndEquipment: 110,
  overheadRate: 16,
  targetMargin: 32,
});

const brochure = () => ({
  ...rates(),
  config: 'two-6',
  frame: 'vinyl',
  glazing: 'dual',
  install: 'retrofit',
  access: 'ground',
  addScreen: false,
  addTransom: false,
  addInteriorTrim: false,
  addSillPan: false,
  addThreshold: false,
  tearOut: true,
});

const moneyLoser = () => ({
  ...rates(),
  config: 'four-16',
  frame: 'fiberglass',
  glazing: 'impact',
  install: 'newcon',
  access: 'balcony',
  hoursSet: 11.5,
  hoursSetPremium: 0.55,
  hoursGlazingPremium: 0.7,
  setHourFactor: 1.35,
  hoursNewcon: 2.8,
  hoursAccess: 1.8,
  hoursInteriorTrim: 2.8,
  unitCost: 2100,
  unitCostMultiplier: 3.05,
  glazingCostFactor: 1.65,
  addScreen: true,
  addTransom: true,
  addInteriorTrim: true,
  addSillPan: true,
  addThreshold: true,
  tearOut: true,
});

test('brochure vinyl hang hours come from the trip, the set, and tear-out — not from extra panels or impact glass', () => {
  const result = calculateBid(brochure());
  assert.equal(result.tearOut, true);
  assert.equal(result.addTransom, false);
  assert.equal(result.tripHours, 1);
  assert.ok(Math.abs(result.setHours - 4.5) < 1e-9);
  assert.equal(result.wrapHours, 0);
  assert.equal(result.accessHours, 0);
  assert.ok(Math.abs(result.packageHours - 1.4) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 980) < 1e-9);
  assert.equal(result.transomMaterial, 0);
  assert.equal(result.sillMaterial, 0);
  assert.ok(Math.abs(result.dumpMaterial - 65) < 1e-9);
});

test('extra panels, impact glass, new-construction wrap, and a balcony do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addTransom, true);
  assert.equal(result.install, 'newcon');
  assert.ok(Math.abs(result.setHours - (11.5 + 0.55 + 0.7) * 1.35) < 1e-9);
  assert.ok(Math.abs(result.wrapHours - 2.8) < 1e-9);
  assert.ok(Math.abs(result.accessHours - 1.8) < 1e-9);
  assert.ok(Math.abs(result.packageHours - (0.9 + 1.4 + 2.8 + 1.5 + 1.3 + 1.4)) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 2100 * 3.05 * 1.65) < 1e-9);
  assert.ok(Math.abs(result.transomMaterial - 380) < 1e-9);
  assert.ok(Math.abs(result.sillMaterial - 165) < 1e-9);
  assert.ok(result.setHours + result.wrapHours + result.accessHours + result.packageHours > result.tripHours);
});

test('a 4-panel impact balcony job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 5, 'the 4-panel impact balcony house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 3);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 48 * 1.32) < 1e-9);

  const expectedHours = 1 + 4.5 + 1.4 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 48 * 1.32) < 1e-9);

  const expectedMaterials = 980 + 65;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 110)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
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

test('the published $1,800 special loses money even on the brochure hang', () => {
  const scored = calculateBid({ ...brochure(), proposedPrice: 1800 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.breakEvenPrice > 1800);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off extras, extra panels, and impact glass drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    config: 'two-6',
    frame: 'vinyl',
    glazing: 'dual',
    install: 'retrofit',
    access: 'ground',
    hoursSet: 4.5,
    hoursSetPremium: 0,
    hoursGlazingPremium: 0,
    setHourFactor: 1,
    hoursNewcon: 0,
    hoursAccess: 0,
    hoursInteriorTrim: 1.2,
    unitCost: 980,
    unitCostMultiplier: 1,
    glazingCostFactor: 1,
    addScreen: false,
    addTransom: false,
    addInteriorTrim: false,
    addSillPan: false,
    addThreshold: false,
  });
  assert.equal(stripped.wrapHours, 0);
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.transomMaterial, 0);
  assert.equal(stripped.sillMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.doorMaterial > stripped.doorMaterial);
});

test('a retrofit hang does not bill new-construction wrap hours', () => {
  const result = calculateBid({
    ...brochure(),
    install: 'retrofit',
    setHourFactor: 1,
    hoursNewcon: 0,
  });
  assert.equal(result.wrapHours, 0);
  assert.ok(Math.abs(result.setHours - 4.5) < 1e-9);
  assert.ok(result.price < calculateBid({
    ...brochure(),
    install: 'newcon',
    setHourFactor: 1.35,
    hoursNewcon: 2.8,
  }).price);
});

test('wood-clad without a transom or sill pan does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    frame: 'wood-clad',
    hoursSetPremium: 0.85,
    unitCost: 3200,
    addTransom: false,
    addSillPan: false,
  });
  assert.equal(result.transomMaterial, 0);
  assert.equal(result.sillMaterial, 0);
  assert.ok(Math.abs(result.setHours - (4.5 + 0.85)) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 3200) < 1e-9);
});

test('turning extras off still prices — extra hours are zero, not an error', () => {
  const result = calculateBid({
    ...brochure(),
    addScreen: false,
    addTransom: false,
    addInteriorTrim: false,
    addSillPan: false,
    addThreshold: false,
    tearOut: false,
  });
  assert.equal(result.packageHours, 0);
  assert.equal(result.screenMaterial, 0);
  assert.equal(result.dumpMaterial, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedConfigKit('two-6'), {
    hoursSet: 4.5, hoursInteriorTrim: 1.2, unitCostMultiplier: 1,
  });
  assert.deepEqual(suggestedConfigKit('four-16'), {
    hoursSet: 11.5, hoursInteriorTrim: 2.8, unitCostMultiplier: 3.05,
  });
  assert.deepEqual(suggestedFrameKit('vinyl'), { unitCost: 980, hoursSetPremium: 0 });
  assert.deepEqual(suggestedFrameKit('fiberglass'), { unitCost: 2100, hoursSetPremium: 0.55 });
  assert.deepEqual(suggestedFrameKit('wood-clad'), { unitCost: 3200, hoursSetPremium: 0.85 });
  assert.deepEqual(suggestedGlazingKit('dual'), { glazingCostFactor: 1, hoursGlazingPremium: 0 });
  assert.deepEqual(suggestedGlazingKit('impact'), { glazingCostFactor: 1.65, hoursGlazingPremium: 0.7 });
  assert.deepEqual(suggestedInstallKit('retrofit'), { setHourFactor: 1, hoursNewcon: 0 });
  assert.deepEqual(suggestedInstallKit('newcon'), { setHourFactor: 1.35, hoursNewcon: 2.8 });
  assert.deepEqual(suggestedAccessKit('ground'), { hoursAccess: 0 });
  assert.deepEqual(suggestedAccessKit('balcony'), { hoursAccess: 1.8 });
  assert.throws(() => suggestedConfigKit('french'), /Unknown patio-door configuration/);
  assert.throws(() => suggestedFrameKit('steel'), /Unknown patio-door frame/);
  assert.throws(() => suggestedGlazingKit('single'), /Unknown patio-door glazing/);
  assert.throws(() => suggestedInstallKit('pocket'), /Unknown patio-door install method/);
  assert.throws(() => suggestedAccessKit('roof'), /Unknown patio-door access/);
});

test('unknown config, frame, glazing, install, or access is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), config: 'french' }), /Unknown patio-door configuration/);
  assert.throws(() => calculateBid({ ...brochure(), frame: 'steel' }), /Unknown patio-door frame/);
  assert.throws(() => calculateBid({ ...brochure(), glazing: 'single' }), /Unknown patio-door glazing/);
  assert.throws(() => calculateBid({ ...brochure(), install: 'pocket' }), /Unknown patio-door install method/);
  assert.throws(() => calculateBid({ ...brochure(), access: 'roof' }), /Unknown patio-door access/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), hoursSet: -1 }), /Hours to set the unit must be at least 0/);
});

test('job presets are usable and the 4-panel house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.config, 'two-6');
  assert.equal(special.frame, 'vinyl');
  assert.equal(special.glazing, 'dual');
  assert.equal(heavy.config, 'four-16');
  assert.equal(heavy.frame, 'fiberglass');
  assert.equal(heavy.glazing, 'impact');
  assert.equal(heavy.install, 'newcon');
  assert.equal(heavy.access, 'balcony');
  assert.equal(heavy.addTransom, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [
    ...CONFIG_PRESETS, ...FRAME_PRESETS, ...GLAZING_PRESETS, ...INSTALL_PRESETS, ...ACCESS_PRESETS,
  ]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the panels and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Fiberglass 4-panel impact balcony');
  assert.match(text, /PATIO \/ SLIDING GLASS DOOR REPLACEMENT BID/);
  assert.match(text, /16-foot 4-panel/);
  assert.match(text, /Fiberglass/);
  assert.match(text, /Impact \/ hurricane/);
  assert.match(text, /Second-story balcony/);
  assert.match(text, /transom included/);
  assert.match(text, /sill pan \/ exterior flashing included/);
  assert.doesNotMatch(text, /48/);
  assert.doesNotMatch(text, /wage/i);
});
