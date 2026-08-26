import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedWorkKit,
  suggestedAccessKit,
  JOB_PRESETS,
  WORK_PRESETS,
  ACCESS_PRESETS,
  LINE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 0.75,
  hoursCameraBase: 0.75,
  hoursCableBase: 0.75,
  hoursJetBase: 1.25,
  hoursPerExtraFoot: 0.02,
  hoursToiletPull: 0.75,
  hoursNewCleanout: 2.5,
  hoursRoofVent: 1.25,
  hoursRootCut: 0.75,
  hoursGreasePass: 0.5,
  hoursSecondLine: 0.75,
  hoursPerExtraHoseFoot: 0.008,
  siteHours: 0.5,
  includedHoseFeet: 80,
  cameraWear: 35,
  cableWear: 15,
  jetWear: 45,
  waxRing: 12,
  cleanoutFitting: 85,
  rootCutterRental: 40,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 55,
  overheadRate: 18,
  targetMargin: 35,
});

const brochure = () => ({
  ...rates(),
  work: 'cable',
  access: 'cleanout',
  line: 'branch',
  lineFeet: 50,
  includedFootage: 50,
  hoseRunFeet: 40,
  hasRoots: false,
  hasGrease: false,
  extraLine: false,
});

const moneyLoser = () => ({
  ...rates(),
  work: 'combo',
  access: 'toilet-pull',
  line: 'main',
  lineFeet: 140,
  includedFootage: 50,
  hoseRunFeet: 150,
  hasRoots: true,
  hasGrease: false,
  extraLine: false,
});

test('brochure cable hours come from the trip and the cable, not from a jet or toilet pull', () => {
  const result = calculateBid(brochure());
  assert.equal(result.includesCable, true);
  assert.equal(result.includesJet, false);
  assert.equal(result.includesCamera, false);
  assert.equal(result.extraFeet, 0);
  assert.equal(result.tripHours, 0.75);
  assert.equal(result.cableHours, 0.75);
  assert.equal(result.jetHours, 0);
  assert.equal(result.cameraHours, 0);
  assert.equal(result.footageHours, 0);
  assert.equal(result.accessHours, 0);
  assert.equal(result.toiletHours, 0);
  assert.equal(result.rootHours, 0);
  assert.equal(result.hoseHours, 0);
});

test('toilet-pull extras do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.includesJet, true);
  assert.equal(result.includesCamera, true);
  assert.equal(result.extraFeet, 90);
  assert.equal(result.jetHours, 1.25);
  assert.equal(result.cameraHours, 0.75);
  assert.ok(Math.abs(result.footageHours - 90 * 0.02) < 1e-9);
  assert.equal(result.toiletHours, 0.75);
  assert.equal(result.rootHours, 0.75);
  assert.ok(Math.abs(result.extraHoseFeet - 70) < 1e-9);
  assert.ok(Math.abs(result.hoseHours - 70 * 0.008) < 1e-9);
  // Access + extra footage + conditions outrun the trip itself — that
  // is the user-visible reason a trip-charge special fails even when
  // the job still looks like "one drain."
  assert.ok(result.accessHours + result.runHours + result.conditionHours > result.tripHours);
});

test('a 140 ft toilet-pull jet prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const main = calculateBid(moneyLoser());
  assert.equal(special.hoursTrip ?? special.tripHours, main.tripHours);
  assert.ok(main.price > special.price * 2.2, 'the toilet-pull main is a different job');
  assert.ok(main.totalHours > special.totalHours * 2);
  assert.equal(special.pricePerExtraFoot, null);
  assert.ok(main.pricePerExtraFoot > special.pricePerFoot);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);

  const expectedHours = 0.75 + 0.75 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = 15;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 55)) < 1e-9);
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

test('turning off roots, grease, and a second line drops those hours and kits', () => {
  const full = calculateBid({
    ...moneyLoser(),
    hasGrease: true,
    extraLine: true,
    access: 'new-cleanout',
  });
  const stripped = calculateBid({
    ...moneyLoser(),
    hasRoots: false,
    hasGrease: false,
    extraLine: false,
    access: 'cleanout',
  });
  assert.equal(stripped.rootHours, 0);
  assert.equal(stripped.greaseHours, 0);
  assert.equal(stripped.secondLineHours, 0);
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.rootMaterial, 0);
  assert.equal(stripped.cleanoutMaterial, 0);
  assert.equal(stripped.waxMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.cleanoutHours, 2.5);
  assert.equal(full.cleanoutMaterial, 85);
});

test('a camera-only job does not bill jet water or cable wear', () => {
  const result = calculateBid({ ...brochure(), work: 'camera' });
  assert.equal(result.jetHours, 0);
  assert.equal(result.cableHours, 0);
  assert.equal(result.cameraHours, 0.75);
  assert.equal(result.jetMaterial, 0);
  assert.equal(result.cableMaterial, 0);
  assert.equal(result.cameraMaterial, 35);
});

test('suggested work and access kits match the shipped presets', () => {
  assert.deepEqual(suggestedWorkKit('cable'), {
    hoursCameraBase: 0,
    hoursCableBase: 0.75,
    hoursJetBase: 0,
    cameraWear: 0,
    cableWear: 15,
    jetWear: 0,
  });
  assert.deepEqual(suggestedWorkKit('combo'), {
    hoursCameraBase: 0.75,
    hoursCableBase: 0,
    hoursJetBase: 1.25,
    cameraWear: 35,
    cableWear: 0,
    jetWear: 45,
  });
  assert.deepEqual(suggestedAccessKit('cleanout'), {
    hoursToiletPull: 0,
    hoursNewCleanout: 0,
    hoursRoofVent: 0,
    waxRing: 0,
    cleanoutFitting: 0,
  });
  assert.deepEqual(suggestedAccessKit('toilet-pull'), {
    hoursToiletPull: 0.75,
    hoursNewCleanout: 0,
    hoursRoofVent: 0,
    waxRing: 12,
    cleanoutFitting: 0,
  });
  assert.throws(() => suggestedWorkKit('snake'), /Unknown work/);
  assert.throws(() => suggestedAccessKit('crawl'), /Unknown access/);
});

test('unknown work, access, or line is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), work: 'snake' }), /Unknown work/);
  assert.throws(() => calculateBid({ ...brochure(), access: 'crawl' }), /Unknown access/);
  assert.throws(() => calculateBid({ ...brochure(), line: 'septic' }), /Unknown line/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), lineFeet: 0 }), /Line footage must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), includedFootage: 80, lineFeet: 50 }), /cannot exceed/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), hoseRunFeet: -1 }), /Hose run from the truck must be at least 0/);
});

test('job presets are usable and the toilet-pull main is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const interior = JOB_PRESETS[2];
  assert.equal(special.work, 'cable');
  assert.equal(special.access, 'cleanout');
  assert.equal(interior.work, 'combo');
  assert.equal(interior.access, 'toilet-pull');
  assert.ok(interior.lineFeet > special.lineFeet);
  assert.equal(interior.hasRoots, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...WORK_PRESETS, ...ACCESS_PRESETS, ...LINE_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the access extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, '140 ft main toilet pull');
  assert.match(text, /SEWER CAMERA \/ HYDRO-JET BID/);
  assert.match(text, /140 ft of line/);
  assert.match(text, /Toilet pull/);
  assert.match(text, /camera inspection included/);
  assert.match(text, /root cutting included/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});
