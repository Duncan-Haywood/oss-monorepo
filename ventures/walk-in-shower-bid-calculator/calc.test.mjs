import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  billedTileSf,
  suggestedBench,
  suggestedGlass,
  JOB_PRESETS,
  BENCH_PRESETS,
  GLASS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  wastePercent: 12,
  hoursPer100Tile: 18,
  hoursDemoTub: 4,
  hoursRelocateValve: 4,
  hoursLinearDrain: 5,
  hoursCurbless: 7,
  hoursPerNiche: 1.6,
  hoursPerBench: 4.5,
  hoursSteam: 3.5,
  hoursWaterproofPer100: 3.5,
  siteHours: 3,
  tileCostPerSf: 8,
  membraneCostPerSf: 2.5,
  dumpsterFee: 425,
  linearDrainCost: 320,
  valveRelocateParts: 180,
  nicheKitEach: 45,
  benchMaterial: 85,
  glassCost: 480,
  steamUnitCost: 1400,
  fixturesAllowance: 650,
  permitFee: 175,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 285,
  overheadRate: 16,
  targetMargin: 28,
});

const alcove = () => ({
  ...rates(),
  wallTileSf: 80,
  floorTileSf: 15,
  niches: 1,
  tearOutTub: true,
  relocateValve: false,
  linearDrain: false,
  curbless: false,
  steamUnit: false,
  bench: 'none',
  glass: 'framed',
});

const walkIn = () => ({
  ...rates(),
  wallTileSf: 90,
  floorTileSf: 25,
  niches: 2,
  tearOutTub: true,
  relocateValve: true,
  linearDrain: true,
  curbless: true,
  steamUnit: false,
  bench: 'masonry',
  glass: 'frameless',
  glassCost: 1650,
  hoursPerBench: 4.5,
  benchMaterial: 85,
});

test('billed tile includes waste on walls and floor', () => {
  assert.ok(Math.abs(billedTileSf(80, 15, 12) - 95 * 1.12) < 1e-9);
});

test('tile hours come from square footage, not from the drain or the glass', () => {
  const result = calculateBid(alcove());
  assert.equal(result.tileSf, 95);
  assert.ok(Math.abs(result.tileHours - 95 / 100 * 18) < 1e-9);
  assert.ok(Math.abs(result.waterproofHours - 95 / 100 * 3.5) < 1e-9);
  assert.equal(result.drainHours, 0);
  assert.equal(result.curblessHours, 0);
  assert.equal(result.valveHours, 0);
});

test('linear drain, curbless slope, and valve relocate do not scale with tile SF', () => {
  const result = calculateBid(walkIn());
  assert.equal(result.tileSf, 115);
  assert.equal(result.drainHours, 5);
  assert.equal(result.curblessHours, 7);
  assert.equal(result.valveHours, 4);
  assert.equal(result.demoHours, 4);
  assert.ok(Math.abs(result.nicheHours - 3.2) < 1e-9);
  assert.equal(result.benchHours, 4.5);
  // Drain, slope, valve, niches, and the bench together outrun tile
  // hours on this house — that is the user-visible reason a per-SF
  // quote fails even when wall count looks ordinary.
  assert.ok(result.wetHours + result.finishHours + result.valveHours > result.tileHours);
});

test('a curbless walk-in prices above the brochure alcove despite similar tile SF', () => {
  const brochure = calculateBid(alcove());
  const interior = calculateBid(walkIn());
  assert.ok(interior.tileSf / brochure.tileSf < 1.25, 'tile SF is close');
  assert.ok(interior.price > brochure.price * 1.5, 'but the walk-in is a different job');
  assert.ok(interior.pricePerTileSf > brochure.pricePerTileSf);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(alcove());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);
  assert.ok(Math.abs(result.tileBilledSf - 95 * 1.12) < 1e-9);
  assert.ok(Math.abs(result.tileMaterial - result.tileBilledSf * 8) < 1e-9);

  const expectedHours = result.tileHours + result.waterproofHours + 4 + 1.6 + 3;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = result.tileMaterial + result.membraneMaterial + 425 + 45 + 480 + 650 + 175;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 285)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...alcove(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(alcove());
  const scored = calculateBid({ ...alcove(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(alcove());
  const scored = calculateBid({ ...alcove(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(alcove()).proposed, null);
  assert.equal(calculateBid({ ...alcove(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...alcove(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...alcove(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off demo drops dumpster hours and the dumpster fee', () => {
  const withDemo = calculateBid(alcove());
  const tileOnly = calculateBid({ ...alcove(), tearOutTub: false });
  assert.equal(tileOnly.demoHours, 0);
  assert.equal(tileOnly.demoMaterial, 0);
  assert.ok(tileOnly.price < withDemo.price);
});

test('a none bench and none glass contribute neither hours nor material', () => {
  const result = calculateBid({
    ...alcove(),
    bench: 'none',
    glass: 'none',
    glassCost: 0,
    niches: 0,
    tearOutTub: false,
  });
  assert.equal(result.benchHours, 0);
  assert.equal(result.benchMaterial, 0);
  assert.equal(result.glassMaterial, 0);
  assert.equal(result.nicheHours, 0);
});

test('suggested bench and glass rates match the shipped presets', () => {
  assert.deepEqual(suggestedBench('masonry'), { hoursPerBench: 4.5, benchMaterial: 85 });
  assert.deepEqual(suggestedGlass('frameless'), { glassCost: 1650 });
  assert.throws(() => suggestedBench('ottoman'), /Unknown bench/);
  assert.throws(() => suggestedGlass('plexiglass'), /Unknown glass/);
});

test('unknown bench or glass is rejected', () => {
  assert.throws(() => calculateBid({ ...alcove(), bench: 'ottoman' }), /Unknown bench/);
  assert.throws(() => calculateBid({ ...alcove(), glass: 'plexiglass' }), /Unknown glass/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...alcove(), wallTileSf: 0, floorTileSf: 0 }), /wall or floor tile/);
  assert.throws(() => calculateBid({ ...alcove(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...alcove(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...alcove(), wastePercent: -1 }), /Tile waste must be at least 0/);
});

test('job presets are usable and the walk-in is not a markup on the alcove', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const brochure = JOB_PRESETS[0];
  const interior = JOB_PRESETS[1];
  assert.equal(brochure.linearDrain, false);
  assert.equal(interior.linearDrain, true);
  assert.equal(interior.curbless, true);
  assert.ok(interior.wallTileSf + interior.floorTileSf > 0);
});

test('bench and glass presets are labeled positive options', () => {
  for (const preset of BENCH_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.hours >= 0);
  }
  for (const preset of GLASS_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.cost >= 0);
  }
});

test('customer-facing summary omits wages and names the wet-area extras', () => {
  const result = calculateBid(walkIn());
  const text = formatBidSummary(result, '5x5 curbless walk-in');
  assert.match(text, /WALK-IN SHOWER BID/);
  assert.match(text, /linear drain included/);
  assert.match(text, /curbless/);
  assert.match(text, /Frameless/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});
