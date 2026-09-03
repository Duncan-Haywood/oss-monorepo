import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedFoundationHours,
  suggestedFan,
  JOB_PRESETS,
  FOUNDATION_PRESETS,
  FAN_PRESETS,
  DISCHARGE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  includedFootprint: 1200,
  includedSuctionPoints: 1,
  hoursBaseSystem: 4,
  hoursPerExtra100SqFt: 0.2,
  hoursPerExtraSuction: 2.5,
  hoursCrawlMembrane: 4,
  hoursRoofDischarge: 1.5,
  hoursHighSuctionFan: 0.5,
  hoursNewCircuit: 2,
  hoursPostTest: 0.75,
  hoursPermit: 0.5,
  hoursPerFirestop: 0.75,
  siteHours: 1,
  fanCost: 185,
  pipeAndSealCost: 145,
  extraSuctionMaterial: 95,
  membranePerSqFt: 0.45,
  circuitCost: 185,
  testKitCost: 45,
  permitFee: 85,
  firestopCostEach: 35,
  hourlyWage: 42,
  burdenRate: 34,
  travelAndEquipment: 85,
  overheadRate: 16,
  targetMargin: 28,
});

const brochure = () => ({
  ...rates(),
  foundation: 'basement',
  footprintSqFt: 1200,
  suctionPoints: 1,
  fan: 'standard',
  discharge: 'sidewall',
  crawlMembrane: false,
  membraneSqFt: 0,
  newCircuit: false,
  postTest: false,
  permit: false,
  firestopCount: 0,
});

const mixed = () => ({
  ...rates(),
  foundation: 'mixed',
  footprintSqFt: 2400,
  suctionPoints: 2,
  fan: 'high-suction',
  discharge: 'roof',
  crawlMembrane: true,
  membraneSqFt: 800,
  newCircuit: true,
  postTest: true,
  permit: true,
  firestopCount: 2,
  hoursBaseSystem: 5,
  fanCost: 320,
  hoursHighSuctionFan: 0.5,
});

test('brochure hours come from the base system, not from extra suction or a membrane', () => {
  const result = calculateBid(brochure());
  assert.equal(result.highSuction, false);
  assert.equal(result.roofDischarge, false);
  assert.equal(result.extraSqFt, 0);
  assert.equal(result.extraSuctionPoints, 0);
  assert.equal(result.systemHours, 4);
  assert.equal(result.footprintHours, 0);
  assert.equal(result.suctionHours, 0);
  assert.equal(result.membraneHours, 0);
  assert.equal(result.roofHours, 0);
  assert.equal(result.fanHours, 0);
  assert.equal(result.circuitHours, 0);
  assert.equal(result.testHours, 0);
  assert.equal(result.permitHours, 0);
  assert.equal(result.firestopHours, 0);
  assert.equal(result.siteHours, 1);
});

test('mixed-foundation extras do not scale with the brochure footprint', () => {
  const result = calculateBid(mixed());
  assert.equal(result.footprintSqFt, 2400);
  assert.equal(result.extraSqFt, 1200);
  assert.equal(result.extraSuctionPoints, 1);
  assert.ok(Math.abs(result.footprintHours - 2.4) < 1e-9);
  assert.ok(Math.abs(result.suctionHours - 2.5) < 1e-9);
  assert.equal(result.membraneHours, 4);
  assert.equal(result.roofHours, 1.5);
  assert.equal(result.fanHours, 0.5);
  assert.equal(result.circuitHours, 2);
  assert.equal(result.testHours, 0.75);
  assert.equal(result.permitHours, 0.5);
  assert.ok(Math.abs(result.firestopHours - 1.5) < 1e-9);
  // Access + extras outrun the base system itself — that is the
  // user-visible reason a per-square-foot quote fails even when the
  // first suction looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.systemHours);
});

test('a mixed slab-and-crawl job prices well above the brochure special despite a similar first suction', () => {
  const special = calculateBid(brochure());
  const job = calculateBid(mixed());
  assert.equal(special.suctionPoints, 1);
  assert.ok(job.suctionPoints > special.suctionPoints);
  assert.ok(job.price > special.price * 3, 'the mixed job is a different job');
  assert.ok(job.totalHours > special.totalHours * 3);
  assert.ok(job.pricePerSqFt > special.pricePerSqFt);
});

test('price stacks burden, kits, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.34) < 1e-9);

  const expectedHours = 4 + 1;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.34) < 1e-9);

  const expectedMaterials = 185 + 145;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off membrane, circuit, test, and permit drops those hours and kits', () => {
  const full = calculateBid(mixed());
  const stripped = calculateBid({
    ...mixed(),
    crawlMembrane: false,
    newCircuit: false,
    postTest: false,
    permit: false,
    firestopCount: 0,
  });
  assert.equal(stripped.membraneHours, 0);
  assert.equal(stripped.circuitHours, 0);
  assert.equal(stripped.testHours, 0);
  assert.equal(stripped.permitHours, 0);
  assert.equal(stripped.firestopHours, 0);
  assert.equal(stripped.membraneMaterial, 0);
  assert.equal(stripped.circuitMaterial, 0);
  assert.equal(stripped.testMaterial, 0);
  assert.equal(stripped.permitMaterial, 0);
  assert.equal(stripped.firestopMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Extra footprint and extra suction still fire because the house is unchanged.
  assert.ok(stripped.footprintHours > 0);
  assert.ok(stripped.suctionHours > 0);
});

test('a sidewall discharge does not bill roof-penetration hours', () => {
  const result = calculateBid(brochure());
  assert.equal(result.roofHours, 0);
  assert.equal(result.serviceHours, 0);
});

test('a standard fan does not bill high-suction hours even if that hour field is filled', () => {
  const result = calculateBid({ ...brochure(), hoursHighSuctionFan: 0.5, fanCost: 320 });
  assert.equal(result.fanHours, 0);
  assert.equal(result.highSuction, false);
  // Fan kit still uses the typed cost — the installer may have already
  // overwritten it — but high-suction labor stays off.
  assert.equal(result.fanMaterial, 320);
});

test('suggested foundation hours and fan kits match the shipped presets', () => {
  assert.deepEqual(suggestedFoundationHours('basement'), { hoursBaseSystem: 4 });
  assert.deepEqual(suggestedFoundationHours('crawl'), { hoursBaseSystem: 5 });
  assert.deepEqual(suggestedFoundationHours('slab'), { hoursBaseSystem: 5.5 });
  assert.deepEqual(suggestedFoundationHours('mixed'), { hoursBaseSystem: 5 });
  assert.deepEqual(suggestedFan('standard'), { fanCost: 185, hoursHighSuctionFan: 0 });
  assert.deepEqual(suggestedFan('high-suction'), { fanCost: 320, hoursHighSuctionFan: 0.5 });
  assert.throws(() => suggestedFoundationHours('pier'), /Unknown foundation/);
  assert.throws(() => suggestedFan('inline'), /Unknown fan/);
});

test('unknown foundation, fan, or discharge is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), foundation: 'pier' }), /Unknown foundation/);
  assert.throws(() => calculateBid({ ...brochure(), fan: 'inline' }), /Unknown fan/);
  assert.throws(() => calculateBid({ ...brochure(), discharge: 'chimney' }), /Unknown discharge/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), footprintSqFt: 0 }), /Footprint square feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), suctionPoints: 0 }), /Suction points must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), includedFootprint: 0 }), /Included footprint must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), membraneSqFt: -1 }), /Membrane square feet must be at least 0/);
  assert.throws(() => calculateBid({ ...brochure(), firestopCount: -1 }), /Firestop count must be at least 0/);
});

test('job presets are usable and the mixed job is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const combo = JOB_PRESETS[2];
  assert.equal(special.foundation, 'basement');
  assert.equal(special.suctionPoints, 1);
  assert.equal(special.crawlMembrane, false);
  assert.equal(combo.foundation, 'mixed');
  assert.equal(combo.crawlMembrane, true);
  assert.ok(combo.footprintSqFt > special.footprintSqFt);
  assert.ok(combo.suctionPoints > special.suctionPoints);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...FOUNDATION_PRESETS, ...FAN_PRESETS, ...DISCHARGE_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the suction extras', () => {
  const result = calculateBid(mixed());
  const text = formatBidSummary(result, 'Mixed slab + crawl');
  assert.match(text, /RADON MITIGATION \/ SSD BID/);
  assert.match(text, /2400 sq ft footprint/);
  assert.match(text, /2 suction points/);
  assert.match(text, /High-suction/);
  assert.match(text, /crawl membrane included/);
  assert.match(text, /new dedicated circuit included/);
  assert.match(text, /post-mitigation test included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
