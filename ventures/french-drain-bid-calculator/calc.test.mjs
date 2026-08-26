import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedDepthKit,
  suggestedPipeKit,
  suggestedSoilKit,
  suggestedOutletKit,
  JOB_PRESETS,
  DEPTH_PRESETS,
  PIPE_PRESETS,
  SOIL_PRESETS,
  OUTLET_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1,
  hoursPerFoot: 0.12,
  hoursPipePremium: 0,
  soilHourFactor: 1,
  hoursOutlet: 1.5,
  hoursCatchBasin: 1.2,
  hoursDownspout: 0.6,
  hoursDrivewayPerFoot: 0.35,
  hoursLawn: 1.5,
  hoursSolidPerFoot: 0.08,
  siteHours: 0.5,
  pipeCostPerFoot: 2.8,
  gravelCostPerFoot: 4.5,
  fabricCostPerFoot: 0.85,
  solidPipeCostPerFoot: 2.4,
  outletCost: 0,
  basinCost: 165,
  downspoutCost: 45,
  drivewayPatchPerFoot: 28,
  lawnRestoreCost: 120,
  dumpFee: 85,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 30,
  travelAndEquipment: 95,
  overheadRate: 15,
  targetMargin: 30,
});

const brochure = () => ({
  ...rates(),
  depth: 'shallow',
  pipe: 'four',
  soil: 'dirt',
  outlet: 'daylight',
  linearFeet: 40,
  extraSolidFeet: 0,
  catchBasins: 0,
  downspoutTies: 0,
  drivewayFeet: 0,
  addCatchBasins: false,
  addDownspouts: false,
  addDriveway: false,
  addLawnRestore: true,
});

const moneyLoser = () => ({
  ...rates(),
  depth: 'deep',
  pipe: 'six',
  soil: 'clay',
  outlet: 'drywell',
  linearFeet: 80,
  extraSolidFeet: 0,
  catchBasins: 2,
  downspoutTies: 3,
  drivewayFeet: 15,
  hoursPerFoot: 0.22,
  hoursPipePremium: 0.03,
  soilHourFactor: 1.45,
  hoursOutlet: 3.8,
  hoursLawn: 2.4,
  pipeCostPerFoot: 5.4,
  gravelCostPerFoot: 9.2,
  outletCost: 380,
  dumpFee: 185,
  lawnRestoreCost: 240,
  addCatchBasins: true,
  addDownspouts: true,
  addDriveway: true,
  addLawnRestore: true,
});

test('brochure daylight trench hours come from the trip, the trench, the outlet, and lawn — not from basins or clay', () => {
  const result = calculateBid(brochure());
  assert.equal(result.addLawnRestore, true);
  assert.equal(result.addCatchBasins, false);
  assert.equal(result.tripHours, 1);
  assert.ok(Math.abs(result.trenchHours - 40 * 0.12) < 1e-9);
  assert.ok(Math.abs(result.outletHours - 1.5) < 1e-9);
  assert.equal(result.basinHours, 0);
  assert.equal(result.drivewayHours, 0);
  assert.ok(Math.abs(result.packageHours - 1.5) < 1e-9);
  assert.ok(Math.abs(result.pipeMaterial - 40 * 2.8) < 1e-9);
  assert.equal(result.outletMaterial, 0);
  assert.equal(result.basinMaterial, 0);
  assert.ok(Math.abs(result.dumpMaterial - 85) < 1e-9);
  assert.ok(Math.abs(result.lawnMaterial - 120) < 1e-9);
});

test('depth, clay, a drywell, basins, and a driveway do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.addDriveway, true);
  assert.equal(result.outlet, 'drywell');
  assert.ok(Math.abs(result.trenchHours - 80 * (0.22 + 0.03) * 1.45) < 1e-9);
  assert.ok(Math.abs(result.outletHours - 3.8) < 1e-9);
  assert.ok(Math.abs(result.basinHours - 2 * 1.2) < 1e-9);
  assert.ok(Math.abs(result.downspoutHours - 3 * 0.6) < 1e-9);
  assert.ok(Math.abs(result.drivewayHours - 15 * 0.35) < 1e-9);
  assert.ok(Math.abs(result.outletMaterial - 380) < 1e-9);
  assert.ok(Math.abs(result.basinMaterial - 330) < 1e-9);
  assert.ok(Math.abs(result.drivewayMaterial - 15 * 28) < 1e-9);
  assert.ok(result.trenchHours + result.outletHours + result.packageHours > result.tripHours);
});

test('an 80-ft clay drywell job prices well above the $25/ft special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 3, 'the clay drywell yard is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 3);
  assert.ok(heavy.materialCost > special.materialCost);
  assert.ok(heavy.pricePerFoot > special.pricePerFoot);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.3) < 1e-9);

  const expectedHours = 1 + 4.8 + 1.5 + 1.5 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.3) < 1e-9);

  const expectedMaterials = 40 * 2.8 + 40 * 4.5 + 40 * 0.85 + 85 + 120;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 95)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(Math.abs(result.pricePerFoot - result.price / 40) < 1e-9);
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

test('the published $25/ft special loses money even on the brochure trench', () => {
  const scored = calculateBid({ ...brochure(), proposedPrice: 40 * 25 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.breakEvenPrice > 1000);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off extras, depth, and clay drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    depth: 'shallow',
    pipe: 'four',
    soil: 'dirt',
    outlet: 'daylight',
    linearFeet: 40,
    hoursPerFoot: 0.12,
    hoursPipePremium: 0,
    soilHourFactor: 1,
    hoursOutlet: 1.5,
    hoursLawn: 1.5,
    pipeCostPerFoot: 2.8,
    gravelCostPerFoot: 4.5,
    outletCost: 0,
    dumpFee: 85,
    lawnRestoreCost: 120,
    addCatchBasins: false,
    addDownspouts: false,
    addDriveway: false,
  });
  assert.equal(stripped.basinHours, 0);
  assert.equal(stripped.drivewayHours, 0);
  assert.equal(stripped.outletMaterial, 0);
  assert.equal(stripped.basinMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.pipeMaterial > stripped.pipeMaterial);
});

test('a daylight outlet does not bill a drywell kit', () => {
  const result = calculateBid({
    ...brochure(),
    outlet: 'daylight',
    hoursOutlet: 1.5,
    outletCost: 0,
  });
  assert.equal(result.outletMaterial, 0);
  assert.ok(result.price < calculateBid({
    ...brochure(),
    outlet: 'drywell',
    hoursOutlet: 3.8,
    outletCost: 380,
  }).price);
});

test('rock without basins or a driveway does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    soil: 'rock',
    soilHourFactor: 2.1,
    dumpFee: 320,
    addCatchBasins: false,
    addDriveway: false,
  });
  assert.equal(result.basinMaterial, 0);
  assert.equal(result.drivewayMaterial, 0);
  assert.ok(Math.abs(result.trenchHours - 40 * 0.12 * 2.1) < 1e-9);
  assert.ok(Math.abs(result.dumpMaterial - 320) < 1e-9);
});

test('turning extras off still prices — extra hours are zero, not an error', () => {
  const result = calculateBid({
    ...brochure(),
    addCatchBasins: false,
    addDownspouts: false,
    addDriveway: false,
    addLawnRestore: false,
    extraSolidFeet: 0,
  });
  assert.equal(result.packageHours, 0);
  assert.equal(result.lawnMaterial, 0);
  assert.equal(result.basinMaterial, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedDepthKit('shallow'), { hoursPerFoot: 0.12, gravelCostPerFoot: 4.5 });
  assert.deepEqual(suggestedDepthKit('deep'), { hoursPerFoot: 0.22, gravelCostPerFoot: 9.2 });
  assert.deepEqual(suggestedPipeKit('four'), { pipeCostPerFoot: 2.8, hoursPipePremium: 0 });
  assert.deepEqual(suggestedPipeKit('six'), { pipeCostPerFoot: 5.4, hoursPipePremium: 0.03 });
  assert.deepEqual(suggestedSoilKit('dirt'), { soilHourFactor: 1, dumpFee: 85 });
  assert.deepEqual(suggestedSoilKit('clay'), { soilHourFactor: 1.45, dumpFee: 185 });
  assert.deepEqual(suggestedSoilKit('rock'), { soilHourFactor: 2.1, dumpFee: 320 });
  assert.deepEqual(suggestedOutletKit('daylight'), { hoursOutlet: 1.5, outletCost: 0 });
  assert.deepEqual(suggestedOutletKit('drywell'), { hoursOutlet: 3.8, outletCost: 380 });
  assert.deepEqual(suggestedOutletKit('storm'), { hoursOutlet: 4.2, outletCost: 265 });
  assert.throws(() => suggestedDepthKit('crawl'), /Unknown French-drain depth/);
  assert.throws(() => suggestedPipeKit('eight'), /Unknown French-drain pipe/);
  assert.throws(() => suggestedSoilKit('sand'), /Unknown French-drain soil/);
  assert.throws(() => suggestedOutletKit('sump'), /Unknown French-drain outlet/);
});

test('unknown depth, pipe, soil, or outlet is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), depth: 'crawl' }), /Unknown French-drain depth/);
  assert.throws(() => calculateBid({ ...brochure(), pipe: 'eight' }), /Unknown French-drain pipe/);
  assert.throws(() => calculateBid({ ...brochure(), soil: 'sand' }), /Unknown French-drain soil/);
  assert.throws(() => calculateBid({ ...brochure(), outlet: 'sump' }), /Unknown French-drain outlet/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), linearFeet: -1 }), /Linear feet must be at least 0/);
});

test('job presets are usable and the clay drywell yard is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.depth, 'shallow');
  assert.equal(special.pipe, 'four');
  assert.equal(special.outlet, 'daylight');
  assert.equal(heavy.depth, 'deep');
  assert.equal(heavy.pipe, 'six');
  assert.equal(heavy.soil, 'clay');
  assert.equal(heavy.outlet, 'drywell');
  assert.equal(heavy.addDriveway, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [
    ...DEPTH_PRESETS, ...PIPE_PRESETS, ...SOIL_PRESETS, ...OUTLET_PRESETS,
  ]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the trench and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Clay drywell driveway run');
  assert.match(text, /FRENCH DRAIN \/ YARD DRAINAGE BID/);
  assert.match(text, /80 ft/);
  assert.match(text, /Deep \(36–48 in\)/);
  assert.match(text, /6-inch perforated/);
  assert.match(text, /Clay/);
  assert.match(text, /Drywell \/ pop-up emitter/);
  assert.match(text, /2 catch basins included/);
  assert.match(text, /15 ft driveway crossing included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
