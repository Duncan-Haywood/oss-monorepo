import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedSlopeMultiplier,
  suggestedPlanSf,
  suggestedRoofSf,
  suggestedSquares,
  suggestedParapetWastePct,
  suggestedMembraneSquares,
  suggestedTearOffSquares,
  suggestedInsulationSquares,
  suggestedMembraneKit,
  suggestedScopeKit,
  suggestedStoryKit,
  JOB_PRESETS,
  MEMBRANE_PRESETS,
  SLOPE_PRESETS,
  SCOPE_PRESETS,
  STORY_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  membrane: 'tpo-45',
  scope: 'recover',
  slope: 'quarter',
  stories: '1',
  lengthFeet: 40,
  widthFeet: 30,
  slopeMultiplier: 1.000,
  roofSf: 1200,
  squares: 12,
  wastePct: 8,
  parapetWastePct: 0,
  membraneSquares: 12.96,
  tearOffSquares: 0,
  insulationSquares: 0,
  insulationLayers: 0,
  parapetLf: 0,
  drainCount: 2,
  curbCount: 0,
  walkPadSquares: 0,
  hoursTrip: 3,
  hoursPerSquare: 1.4,
  extraHoursPerSquare: 0,
  hoursTearoffPerSquare: 0,
  hoursPerInsulationSquare: 0.55,
  hoursPerParapetLf: 0.12,
  hoursPerDrain: 0.8,
  hoursPerCurb: 1.4,
  hoursPerWalkPadSquare: 0.6,
  weldHours: 4,
  hoursCoverBoard: 3,
  siteHours: 0.8,
  membranePerSquare: 165,
  insulationPerSquare: 95,
  coverBoardPerSquare: 48,
  parapetPerLf: 18,
  drainEach: 165,
  curbEach: 240,
  walkPadPerSquare: 85,
  fastenerLump: 160,
  dumpsterPerSquare: 28,
  weldFee: 220,
  mobilizationFee: 350,
  permitFee: 425,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 160,
  overheadRate: 15,
  targetMargin: 25,
  includeCoverBoard: false,
  includePermit: false,
});

test('low slope barely changes plan square feet — the coupon already billed the plan', () => {
  assert.equal(suggestedSlopeMultiplier('quarter'), 1.000);
  assert.equal(suggestedSlopeMultiplier('half'), 1.001);
  assert.equal(suggestedSlopeMultiplier('one'), 1.003);
  assert.equal(suggestedPlanSf(40, 30), 1200);
  assert.equal(suggestedRoofSf(40, 30, 'quarter'), 1200);
  assert.equal(suggestedSquares(40, 30, 'quarter'), 12);
});

test('an 80×50 commercial deck is 40.04 squares at 1/2", not the 40 the plan counted', () => {
  assert.equal(suggestedPlanSf(80, 50), 4000);
  assert.ok(Math.abs(suggestedRoofSf(80, 50, 'half') - 4004) < 1e-9);
  assert.ok(Math.abs(suggestedSquares(80, 50, 'half') - 40.04) < 1e-9);
});

test('parapet flashing adds waste the square special cannot see', () => {
  assert.equal(suggestedParapetWastePct(0), 0);
  assert.equal(suggestedParapetWastePct(20), 2);
  assert.equal(suggestedParapetWastePct(80), 8);
  assert.equal(suggestedParapetWastePct(200), 10);
});

test('membrane squares include kit waste; recover tear-off is zero', () => {
  assert.ok(Math.abs(suggestedMembraneSquares(12, 8, 0) - 12.96) < 1e-9);
  assert.equal(suggestedTearOffSquares(12, 'recover'), 0);
  assert.equal(suggestedTearOffSquares(12, 'tear-off'), 12);
  assert.equal(suggestedTearOffSquares(40.04, 'tear-off-insul'), 40.04);
  assert.equal(suggestedInsulationSquares(40.04, 0), 0);
  assert.equal(suggestedInsulationSquares(40.04, 2), 80.08);
});

test('the $650/square coupon still clears the garage recover, and fails on the commercial tear-off', () => {
  const garage = calculateBid(coupon());
  assert.equal(garage.planSf, 1200);
  assert.equal(garage.squares, 12);
  assert.equal(garage.tearOffSquares, 0);
  assert.equal(garage.weldLaborHours, 0);
  assert.ok(garage.pricePerSquare > 400 && garage.pricePerSquare < 650, `garage is ${garage.pricePerSquare}/sq`);
  assert.ok(garage.price < 650 * garage.squares, 'the $650/square coupon still clears the garage recover');

  const commercial = calculateBid({
    ...coupon(),
    membrane: 'tpo-80',
    scope: 'tear-off-insul',
    slope: 'half',
    stories: '2',
    lengthFeet: 80,
    widthFeet: 50,
    slopeMultiplier: 1.001,
    roofSf: 4004,
    squares: 40.04,
    wastePct: 10,
    parapetWastePct: 8,
    membraneSquares: 40.04 * 1.18,
    tearOffSquares: 40.04,
    insulationSquares: 80.08,
    insulationLayers: 2,
    parapetLf: 80,
    drainCount: 6,
    curbCount: 4,
    walkPadSquares: 2,
    hoursPerSquare: 2.1,
    extraHoursPerSquare: 0.35,
    hoursTearoffPerSquare: 1.4,
    weldHours: 4,
    membranePerSquare: 295,
    includeCoverBoard: true,
    includePermit: true,
  });
  assert.equal(commercial.planSf, 4000);
  assert.equal(commercial.squares, 40.04);
  assert.equal(commercial.tearOffSquares, 40.04);
  assert.equal(commercial.weldLaborHours, 4);
  assert.ok(commercial.price > garage.price);
  const couponPrice = 650 * 40.04;
  assert.ok(commercial.price > couponPrice, `TPO-80 tear-off ${commercial.price} should beat a $650/sq coupon of ${couponPrice}`);
});

test('TPO 80 and EPDM on the same garage are different jobs than TPO 45', () => {
  const thin = calculateBid(coupon());
  const epdm = calculateBid({
    ...coupon(),
    membrane: 'epdm-60',
    wastePct: 10,
    membraneSquares: 12 * 1.10,
    hoursPerSquare: 1.8,
    membranePerSquare: 185,
  });
  const thick = calculateBid({
    ...coupon(),
    membrane: 'tpo-80',
    wastePct: 10,
    membraneSquares: 12 * 1.10,
    hoursPerSquare: 2.1,
    membranePerSquare: 295,
    weldHours: 4,
  });
  assert.ok(epdm.membraneHours > thin.membraneHours);
  assert.ok(epdm.membraneMaterial > thin.membraneMaterial);
  assert.ok(epdm.price > thin.price);
  assert.ok(thick.weldLaborHours > 0);
  assert.ok(thick.weldMaterial > 0);
  assert.equal(thin.weldLaborHours, 0);
  assert.equal(thin.weldMaterial, 0);
  assert.ok(thick.price > epdm.price);
  assert.ok(thick.membraneShareOfDirect > 15, `membrane is ${thick.membraneShareOfDirect.toFixed(1)}% of direct`);
});

test('tear-off, wet insulation, and two-story hours never appear in the recover coupon', () => {
  const recover = calculateBid(coupon());
  const torn = calculateBid({
    ...coupon(),
    scope: 'tear-off',
    tearOffSquares: 12,
    hoursTearoffPerSquare: 0.9,
  });
  const wet = calculateBid({
    ...coupon(),
    scope: 'tear-off-insul',
    tearOffSquares: 12,
    hoursTearoffPerSquare: 1.4,
    insulationSquares: 24,
    insulationLayers: 2,
  });
  const twoStory = calculateBid({
    ...coupon(),
    stories: '2',
    extraHoursPerSquare: 0.35,
  });
  assert.equal(recover.tearOffHours, 0);
  assert.ok(torn.tearOffHours > 0);
  assert.ok(torn.dumpsterMaterial > 0);
  assert.ok(torn.price > recover.price);
  assert.ok(wet.insulationHours > recover.insulationHours);
  assert.ok(wet.price > torn.price);
  assert.ok(twoStory.storyHours > recover.storyHours);
  assert.ok(twoStory.price > recover.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 36 * 1.32);

  const expectedHours = 3 + 12.96 * 1.4 + 0 + 0 + 0 + 0 + 2 * 0.8 + 0 + 0 + 0 + 0 + 0.8;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 36 * 1.32;
  const material = 12.96 * 165 + 2 * 165 + 160;
  const soft = 160 + 350 + 0 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('cover board, permit, and welder stay off until the flags and membrane require them', () => {
  const off = calculateBid(coupon());
  assert.equal(off.coverHours, 0);
  assert.equal(off.coverMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.weldLaborHours, 0);
  assert.equal(off.weldMaterial, 0);

  const on = calculateBid({
    ...coupon(),
    includeCoverBoard: true,
    includePermit: true,
    membrane: 'tpo-80',
    hoursPerSquare: 2.1,
    membranePerSquare: 295,
  });
  assert.equal(on.coverHours, 3);
  assert.ok(on.coverMaterial > 0);
  assert.equal(on.permitMaterial, 425);
  assert.equal(on.weldLaborHours, 4);
  assert.equal(on.weldMaterial, 220);
  assert.ok(on.price > off.price);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...coupon(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(coupon());
  const scored = calculateBid({ ...coupon(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed $650/square coupon on the garage is scored, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const couponBid = calculateBid({ ...coupon(), proposedPrice: 650 * 12 });
  assert.equal(couponBid.proposed.belowBreakEven, false);
  assert.ok(couponBid.proposed.price > bid.breakEvenPrice);

  const scored = calculateBid({ ...coupon(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(coupon()).proposed, null);
  assert.equal(calculateBid({ ...coupon(), proposedPrice: '' }).proposed, null);
});

test('unknown membrane, slope, scope, or stories is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), membrane: 'shingle' }), /Unknown membrane/);
  assert.throws(() => calculateBid({ ...coupon(), slope: '4' }), /Unknown slope/);
  assert.throws(() => calculateBid({ ...coupon(), scope: 'partial' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...coupon(), stories: '4' }), /Unknown stories/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped membrane, scope, and story lists', () => {
  assert.equal(suggestedMembraneKit('tpo-45').membranePerSquare, 165);
  assert.equal(suggestedMembraneKit('tpo-80').hoursPerSquare, 2.1);
  assert.equal(suggestedMembraneKit('tpo-80').weldHours, 4);
  assert.equal(suggestedScopeKit('recover').dumpsterPerSquare, 0);
  assert.equal(suggestedScopeKit('tear-off').hoursPerSquare, 0.9);
  assert.equal(suggestedScopeKit('tear-off-insul').hoursPerSquare, 1.4);
  assert.equal(suggestedStoryKit('1').extraHoursPerSquare, 0);
  assert.equal(suggestedStoryKit('2').extraHoursPerSquare, 0.35);
  assert.equal(suggestedStoryKit('3').extraHoursPerSquare, 0.75);
  for (const preset of MEMBRANE_PRESETS) {
    assert.ok(Number.isFinite(suggestedMembraneKit(preset.id).hoursPerSquare));
  }
  for (const preset of SCOPE_PRESETS) {
    assert.ok(Number.isFinite(suggestedScopeKit(preset.id).hoursPerSquare));
  }
  for (const preset of STORY_PRESETS) {
    assert.ok(Number.isFinite(suggestedStoryKit(preset.id).extraHoursPerSquare));
  }
  for (const preset of SLOPE_PRESETS) {
    assert.ok(suggestedSlopeMultiplier(preset.id) >= 1);
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    membrane: first.membrane,
    scope: first.scope,
    slope: first.slope,
    stories: first.stories,
    lengthFeet: first.lengthFeet,
    widthFeet: first.widthFeet,
  });
  assert.equal(result.planSf, 1200);
  assert.equal(result.squares, 12);
});

test('the customer-facing summary omits wages and names the membrane and squares', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /FLAT ROOF \/ TPO \/ EPDM BID/);
  assert.match(text, /40×30/);
  assert.match(text, /membrane/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$36/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
