import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareTileSupply,
  compareScope,
  compareAccess,
  tileSupplyNote,
  scopeNote,
  accessNote,
  formatBidSummary,
  billedTileSf,
  suggestedBench,
  suggestedGlass,
  suggestedOwnerTileKit,
  suggestedAccessKit,
  JOB_PRESETS,
  BENCH_PRESETS,
  GLASS_PRESETS,
  SUPPLY_PRESETS,
  ACCESS_PRESETS,
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

test('otherCost stacks into materials without changing tile hours', () => {
  const base = calculateBid(alcove());
  const extra = calculateBid({ ...alcove(), otherCost: 180 });
  assert.equal(extra.tileHours, base.tileHours);
  assert.ok(Math.abs(extra.materialCost - (base.materialCost + 180)) < 1e-9);
  assert.ok(extra.price > base.price);
});

test('owner-supplied tile zeros the invoice and keeps the set hours', () => {
  const kit = suggestedOwnerTileKit();
  const rows = compareTileSupply(alcove());
  assert.equal(rows.length, 3);
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const short = rows.find((row) => row.supply === 'owner-short');
  assert.ok(contractor.tileMaterial > 0);
  assert.equal(fits.tileMaterial, 0);
  assert.equal(short.tileMaterial, 0);
  assert.ok(Math.abs(fits.siteHours - (3 + kit.hoursOwnerHandle)) < 1e-9);
  assert.ok(fits.totalHours > contractor.totalHours);
  assert.ok(fits.price < contractor.price);
  assert.ok(short.price > fits.price);
  assert.ok(Math.abs(short.otherCost - kit.extraTileBuy) < 1e-9);
});

test('the $45 / SF labor-only special loses even when they bought the tile', () => {
  const rows = compareTileSupply(alcove());
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(contractor.laborOnlyPrice, 45 * 95);
  assert.equal(contractor.laborOnly.belowBreakEven, true);
  assert.equal(fits.laborOnly.belowBreakEven, true);
  assert.match(tileSupplyNote(rows), /lose money even when they bought the tile/i);
});

test('a high proposed price is scored as the labor-only number', () => {
  const rows = compareTileSupply({ ...alcove(), proposedPrice: 12000 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(contractor.laborOnlyPrice, 12000);
  assert.equal(contractor.laborOnly.belowBreakEven, false);
  assert.equal(fits.laborOnly.belowBreakEven, false);
  assert.match(tileSupplyNote(rows), /both supply paths hold a margin/i);
});

test('tileSupplyNote names the bid drop when no labor-only price is forced to zero', () => {
  const rows = compareTileSupply(alcove(), { laborOnlyPrice: null, laborOnlyPerSf: 0 });
  // laborOnlyPerSf 0 still produces a $0 labor-only score; force
  // the no-score path by passing rows without laborOnly.
  const stripped = rows.map((row) => ({ ...row, laborOnly: null }));
  assert.match(tileSupplyNote(stripped), /Zeroing the tile invoice drops the bid/i);
});

test('tileSupplyNote rejects a short or incomplete table', () => {
  assert.throws(() => tileSupplyNote([{ supply: 'contractor-supplied' }]), /missing rows/);
  assert.throws(() => tileSupplyNote([
    { supply: 'contractor-supplied' },
    { supply: 'owner-fits' },
    { supply: 'someone-else' },
  ]), /missing a supply row/);
});

test('supply presets name the three paths shops actually get shopped on', () => {
  assert.equal(SUPPLY_PRESETS.length, 3);
  assert.equal(SUPPLY_PRESETS[0].id, 'contractor-supplied');
  assert.equal(SUPPLY_PRESETS[1].id, 'owner-fits');
  assert.equal(SUPPLY_PRESETS[2].id, 'owner-short');
});

test('compareScope prices four bathrooms from the same crew rates', () => {
  const rows = compareScope(alcove());
  assert.equal(rows.length, 4);
  const alcoveRow = rows.find((row) => row.scope === 'alcove');
  const walkInRow = rows.find((row) => row.scope === 'curbless');
  const steamRow = rows.find((row) => row.scope === 'steam');
  const tileOnly = rows.find((row) => row.scope === 'tile-only');
  assert.ok(alcoveRow && walkInRow && steamRow && tileOnly);
  assert.equal(alcoveRow.tileSf, 95);
  assert.equal(walkInRow.tileSf, 115);
  assert.equal(walkInRow.drainHours, 5);
  assert.equal(walkInRow.curblessHours, 7);
  assert.equal(alcoveRow.drainHours, 0);
  assert.equal(alcoveRow.curblessHours, 0);
  assert.equal(alcoveRow.glassMaterial, 480);
  assert.equal(walkInRow.glassMaterial, 1650);
  assert.equal(steamRow.glassMaterial, 2200);
  assert.equal(tileOnly.glassMaterial, 0);
  assert.ok(walkInRow.price > alcoveRow.price * 1.5);
  assert.ok(walkInRow.pricePerTileSf > alcoveRow.pricePerTileSf);
  assert.ok(steamRow.price > walkInRow.price);
  assert.ok(tileOnly.price < alcoveRow.price);
  assert.equal(alcoveRow.cheapest, false);
  assert.equal(tileOnly.cheapest, true);
});

test('compareScope does not reuse a typed glass invoice', () => {
  const cheapGlass = compareScope({ ...alcove(), glassCost: 1, hoursPerBench: 99, benchMaterial: 1 });
  const baseline = compareScope(alcove());
  const walkInCheap = cheapGlass.find((row) => row.scope === 'curbless');
  const walkInBase = baseline.find((row) => row.scope === 'curbless');
  assert.ok(Math.abs(walkInCheap.price - walkInBase.price) < 1e-9);
  assert.equal(walkInCheap.glassMaterial, 1650);
});

test('matching the alcove per-SF on the curbless walk-in loses money', () => {
  const rows = compareScope(alcove());
  const alcoveRow = rows.find((row) => row.scope === 'alcove');
  const walkInRow = rows.find((row) => row.scope === 'curbless');
  assert.ok(alcoveRow.matchAlcove);
  assert.equal(alcoveRow.matchAlcove.belowBreakEven, false);
  assert.ok(Math.abs(alcoveRow.matchAlcove.price - alcoveRow.price) < 1e-6);
  assert.equal(walkInRow.matchAlcove.belowBreakEven, true);
  assert.ok(Math.abs(walkInRow.matchAlcove.perTileSf - alcoveRow.pricePerTileSf) < 1e-9);
  assert.ok(Math.abs(walkInRow.matchAlcove.price - alcoveRow.pricePerTileSf * 115) < 1e-6);
  assert.match(scopeNote(rows), /lose/i);
  assert.match(scopeNote(rows), /Walk-away on that walk-in/i);
});

test('scopeNote names the lift when matching the alcove still covers', () => {
  const rows = compareScope({ ...alcove(), targetMargin: 80 });
  const walkIn = rows.find((row) => row.scope === 'curbless');
  assert.equal(walkIn.matchAlcove.belowBreakEven, false);
  assert.match(scopeNote(rows), /still covers the curbless walk-in/i);
});

test('scopeNote rejects a short or incomplete table', () => {
  assert.throws(() => scopeNote([{ scope: 'alcove' }]), /missing rows/);
  assert.throws(() => scopeNote([
    { scope: 'alcove' },
    { scope: 'curbless' },
    { scope: 'tile-only' },
    { scope: 'someone-else' },
  ]), /missing a bathroom row/);
});

test('job presets carry stable ids for the scope table', () => {
  assert.deepEqual(JOB_PRESETS.map((job) => job.id), ['alcove', 'curbless', 'steam', 'tile-only']);
  for (const job of JOB_PRESETS) {
    assert.ok(job.shortLabel.length > 0);
  }
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const kit = suggestedAccessKit();
  const rows = compareAccess(alcove());
  assert.equal(rows.length, 3);
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedOwnerTileKit().hoursCallbackTrip);
  assert.ok(Math.abs(occupied.tileHours - empty.tileHours * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.siteHours - empty.siteHours * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.loadedWage - empty.loadedWage) < 1e-9);
  assert.ok(occupied.totalHours > empty.totalHours);
  assert.ok(occupied.price > empty.price);
  assert.ok(Math.abs(afterHours.loadedWage - empty.loadedWage * 1.5) < 1e-9);
  assert.ok(Math.abs(afterHours.siteHours - empty.siteHours - kit.afterHoursExtraTripHours) < 1e-9);
  assert.ok(Math.abs(afterHours.tileHours - empty.tileHours) < 1e-9);
  assert.ok(afterHours.price > occupied.price);
  assert.equal(empty.cheapest, true);
  assert.equal(empty.installOnly, null);
  assert.ok(Math.abs(empty.price - 7418.512555555557) < 1e-4);
  assert.ok(Math.abs(occupied.price - 7824.599555555556) < 1e-4);
  assert.ok(Math.abs(afterHours.price - 8894.366055555556) < 1e-4);
});

test('compareAccess does not leak a typed site day into the extra evening dispatch', () => {
  const baseline = compareAccess(alcove());
  const overridden = compareAccess({ ...alcove(), siteHours: 9 });
  const empty = overridden.find((row) => row.access === 'empty-weekday');
  const afterHours = overridden.find((row) => row.access === 'after-hours');
  const baselineAfter = baseline.find((row) => row.access === 'after-hours');
  const baselineEmpty = baseline.find((row) => row.access === 'empty-weekday');
  assert.ok(empty.siteHours > baselineEmpty.siteHours);
  assert.ok(Math.abs((afterHours.siteHours - empty.siteHours) - (baselineAfter.siteHours - baselineEmpty.siteHours)) < 1e-9);
});

test('a $5,500 Saturday special covers a weekday alcove and loses after-hours', () => {
  const rows = compareAccess(alcove(), { installOnlyPrice: 5500 });
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(empty.installOnly.belowBreakEven, false);
  assert.equal(occupied.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 6403.94356) < 1e-4);
  assert.match(accessNote(rows), /empty-weekday set covers/i);
  assert.match(accessNote(rows), /\$903\.94/);
  assert.match(accessNote(rows), /\$6,403\.94/);
});

test('the $45 / SF Saturday special on a curbless walk-in loses even on a weekday', () => {
  const rows = compareAccess(walkIn(), { installOnlyPrice: 45 * 115 });
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(empty.installOnly.belowBreakEven, true);
  assert.equal(occupied.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(empty.price - 12821.251222222223) < 1e-4);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 11061.96532) < 1e-4);
  assert.match(accessNote(rows), /lose money even on an empty weekday/i);
  assert.match(accessNote(rows), /\$5,175/);
  assert.match(accessNote(rows), /\$11,061\.97/);
});

test('accessNote names the bid lift when no Saturday number is on the table', () => {
  const note = accessNote(compareAccess(alcove()));
  assert.match(note, /Only-bath-still-in-use adds \$406\.09/i);
  assert.match(note, /After-hours \/ weekend adds \$1,475\.85/);
});

test('accessNote rejects a missing comparison', () => {
  assert.throws(() => accessNote(null), /missing rows/);
  assert.throws(() => accessNote([{ access: 'empty-weekday' }]), /missing rows/);
});

test('suggestedAccessKit uses the owner-tile callback trip, not a typed set', () => {
  const kit = suggestedAccessKit();
  assert.equal(kit.afterHoursExtraTripHours, suggestedOwnerTileKit().hoursCallbackTrip);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
});

test('access presets name the three windows shops actually get shopped on', () => {
  assert.equal(ACCESS_PRESETS.length, 3);
  assert.equal(ACCESS_PRESETS[0].id, 'empty-weekday');
  assert.equal(ACCESS_PRESETS[1].id, 'occupied-weekday');
  assert.equal(ACCESS_PRESETS[2].id, 'after-hours');
});
