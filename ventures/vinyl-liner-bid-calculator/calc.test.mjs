import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedWaterSurface,
  suggestedPerimeter,
  suggestedWallSf,
  suggestedHopperExtraSf,
  suggestedStairSf,
  suggestedLinerSf,
  suggestedWastePercent,
  suggestedOrderSf,
  suggestedMilKit,
  suggestedBeadKit,
  suggestedAccessKit,
  suggestedStairKit,
  JOB_PRESETS,
  SHAPE_PRESETS,
  DEPTH_PRESETS,
  MIL_PRESETS,
  BEAD_PRESETS,
  STAIR_PRESETS,
  PATTERN_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  shape: 'rectangle',
  depth: 'hopper',
  mil: '20',
  bead: 'standard',
  stairs: 'none',
  pattern: 'solid',
  access: 'easy',
  lengthFeet: 32,
  widthFeet: 16,
  wallHeightFeet: 3.5,
  waterSurfaceSf: 512,
  perimeterLf: 96,
  wallSf: 336,
  hopperExtraSf: 112.64,
  stairSf: 0,
  linerSf: 960.64,
  wastePercent: 8,
  orderSf: 1037.4912,
  hoursTrip: 3,
  hoursPer100SfLiner: 1.8,
  hoursStairs: 0,
  hoursBead: 0,
  hoursPerTrackLf: 0.12,
  hoursCove: 2.4,
  hoursFoam: 3.2,
  hoursAccess: 0,
  hoursPump: 2.5,
  hoursCover: 1.4,
  siteHours: 0.8,
  linerPerSf: 1.85,
  fittingsLump: 185,
  disposalFee: 95,
  trackPerLf: 8.5,
  coveLump: 320,
  foamPerLf: 4.25,
  coverFee: 480,
  mobilizationFee: 225,
  permitFee: 185,
  hourlyWage: 30,
  burdenRate: 30,
  travelAndEquipment: 125,
  overheadRate: 15,
  targetMargin: 25,
  replaceTrack: false,
  replaceCove: false,
  replaceWallFoam: false,
  includeCover: false,
  includePermit: false,
  pumpDown: true,
});

test('a rectangle is length × width; an oval is the ellipse the coupon still calls a 16×32', () => {
  assert.equal(suggestedWaterSurface(32, 16, 'rectangle'), 512);
  assert.equal(suggestedWaterSurface(36, 18, 'rectangle'), 648);
  assert.ok(Math.abs(suggestedWaterSurface(36, 18, 'oval') - Math.PI * 18 * 9) < 1e-9);
  assert.equal(suggestedWaterSurface(32, 16, 'kidney'), 32 * 16 * 0.85);
});

test('a 16×32 rectangle is 96 lf of wall; an oval of the same box is shorter', () => {
  assert.equal(suggestedPerimeter(32, 16, 'rectangle'), 96);
  assert.equal(suggestedPerimeter(40, 20, 'rectangle'), 120);
  const oval = suggestedPerimeter(36, 18, 'oval');
  assert.ok(oval > 80 && oval < 96, `18×36 oval perimeter is ${oval}`);
  assert.equal(suggestedPerimeter(32, 16, 'kidney'), 96 * 1.08);
});

test('wall vinyl is perimeter × wall height, not water surface', () => {
  assert.equal(suggestedWallSf(96, 3.5), 336);
  assert.equal(suggestedWallSf(108, 3.5), 378);
});

test('hopper extra is a share of water surface the coupon never counted', () => {
  assert.equal(suggestedHopperExtraSf(512, 'flat'), 0);
  assert.equal(suggestedHopperExtraSf(512, 'spoon'), 512 * 0.06);
  assert.equal(suggestedHopperExtraSf(512, 'hopper'), 512 * 0.22);
});

test('stairs add vinyl the water-surface special cannot see', () => {
  assert.equal(suggestedStairSf('none'), 0);
  assert.equal(suggestedStairSf('hop-out'), 28);
  assert.equal(suggestedStairSf('wedding-cake'), 85);
});

test('a 16×32 hopper is 961 sf of liner on a 512 sf water surface', () => {
  const liner = suggestedLinerSf(512, 336, 112.64, 0);
  assert.equal(liner, 960.64);
  assert.equal(suggestedWastePercent('solid'), 8);
  assert.equal(suggestedWastePercent('pattern'), 14);
  assert.ok(Math.abs(suggestedOrderSf(960.64, 8) - 1037.4912) < 1e-9);
});

test('the $2,999 special undercounts liner when the 16×32 coupon is applied to an 18×36', () => {
  const small = calculateBid(coupon());
  assert.equal(small.waterSurfaceSf, 512);
  assert.equal(small.linerSf, 960.64);
  assert.equal(small.wallSf, 336);
  assert.ok(small.pricePerWaterSf > 8 && small.pricePerWaterSf < 14, `open 16×32 is ${small.pricePerWaterSf}/sf water`);
  assert.ok(small.price > 2999, 'the $2,999 special does not cover a hopper 16×32');

  const water = suggestedWaterSurface(36, 18, 'rectangle');
  const perimeter = suggestedPerimeter(36, 18, 'rectangle');
  const walls = suggestedWallSf(perimeter, 3.5);
  const hopper = suggestedHopperExtraSf(water, 'hopper');
  const liner = suggestedLinerSf(water, walls, hopper, 0);
  const larger = calculateBid({
    ...coupon(),
    lengthFeet: 36,
    widthFeet: 18,
    waterSurfaceSf: water,
    perimeterLf: perimeter,
    wallSf: walls,
    hopperExtraSf: hopper,
    linerSf: liner,
    orderSf: suggestedOrderSf(liner, 8),
  });
  assert.equal(larger.waterSurfaceSf, 648);
  assert.ok(larger.linerSf > small.linerSf);
  assert.ok(larger.price > small.price);
});

test('wedding-cake stairs plus a patterned 27-mil liner is a different job than the 16×32 coupon', () => {
  const plain = calculateBid(coupon());
  const upgraded = calculateBid({
    ...coupon(),
    mil: '27',
    stairs: 'wedding-cake',
    pattern: 'pattern',
    stairSf: 85,
    linerSf: 960.64 + 85,
    wastePercent: 14,
    orderSf: suggestedOrderSf(960.64 + 85, 14),
    hoursStairs: 4.2,
    hoursPer100SfLiner: 2.1,
    linerPerSf: 2.85,
  });
  assert.equal(plain.stairSf, 0);
  assert.equal(upgraded.stairSf, 85);
  assert.ok(upgraded.linerShareOfDirect > 40, `liner is ${upgraded.linerShareOfDirect.toFixed(1)}% of direct`);
  assert.ok(upgraded.price > plain.price);
  assert.ok(upgraded.price > 2999, 'the $2,999 special cannot cover stairs and 27 mil');
});

test('new bead track on the same 16×32 is a real share of direct cost the coupon cannot see', () => {
  const existing = calculateBid(coupon());
  const track = calculateBid({
    ...coupon(),
    replaceTrack: true,
  });
  assert.equal(existing.trackHours, 0);
  assert.equal(existing.trackMaterial, 0);
  assert.ok(track.trackHours > 0);
  assert.ok(track.trackMaterial > 0);
  assert.ok(track.price > existing.price);
  assert.ok(track.extrasShareOfDirect > 5, `track extras are ${track.extrasShareOfDirect.toFixed(1)}% of direct`);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 30 * 1.3);

  const expectedHours = 3 + 960.64 * 1.8 / 100 + 0 + 0 + 0 + 0 + 0 + 0 + 2.5 + 0 + 0.8;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 30 * 1.3;
  const material = 1037.4912 * 1.85 + 185 + 95;
  const soft = 125 + 225 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('track, cove, foam, cover, permit, and pump stay off until the flags are on', () => {
  const off = calculateBid({ ...coupon(), pumpDown: false });
  assert.equal(off.trackHours, 0);
  assert.equal(off.trackMaterial, 0);
  assert.equal(off.coveHours, 0);
  assert.equal(off.coveMaterial, 0);
  assert.equal(off.foamHours, 0);
  assert.equal(off.foamMaterial, 0);
  assert.equal(off.coverHours, 0);
  assert.equal(off.coverMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.pumpHours, 0);

  const on = calculateBid({
    ...coupon(),
    replaceTrack: true,
    replaceCove: true,
    replaceWallFoam: true,
    includeCover: true,
    includePermit: true,
    pumpDown: true,
  });
  assert.ok(on.trackHours > 0);
  assert.equal(on.coveHours, 2.4);
  assert.equal(on.coveMaterial, 320);
  assert.ok(on.foamHours > 0);
  assert.equal(on.coverHours, 1.4);
  assert.equal(on.coverMaterial, 480);
  assert.equal(on.permitMaterial, 185);
  assert.equal(on.pumpHours, 2.5);
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

test('a proposed $2,999 special on the 16×32 is underwater, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const special = calculateBid({ ...coupon(), proposedPrice: 2999 });
  assert.equal(special.proposed.belowBreakEven, true);
  assert.ok(special.proposed.price < bid.breakEvenPrice);

  const scored = calculateBid({ ...coupon(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(coupon()).proposed, null);
  assert.equal(calculateBid({ ...coupon(), proposedPrice: '' }).proposed, null);
});

test('unknown shape, depth, mil, bead, stairs, pattern, or access is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), shape: 'lagoon' }), /Unknown shape/);
  assert.throws(() => calculateBid({ ...coupon(), depth: 'diving' }), /Unknown depth/);
  assert.throws(() => calculateBid({ ...coupon(), mil: '40' }), /Unknown mil/);
  assert.throws(() => calculateBid({ ...coupon(), bead: 'staple' }), /Unknown bead/);
  assert.throws(() => calculateBid({ ...coupon(), stairs: 'ladder' }), /Unknown stairs/);
  assert.throws(() => calculateBid({ ...coupon(), pattern: 'tile' }), /Unknown pattern/);
  assert.throws(() => calculateBid({ ...coupon(), access: 'crane' }), /Unknown access/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped mil, bead, access, and stair lists', () => {
  assert.equal(suggestedMilKit('20').linerPerSf, 1.85);
  assert.equal(suggestedMilKit('27').hoursPer100Sf, 2.1);
  assert.equal(suggestedBeadKit('standard').extraHours, 0);
  assert.equal(suggestedBeadKit('overlap').extraHours, 2.5);
  assert.equal(suggestedAccessKit('easy').extraHours, 0);
  assert.equal(suggestedAccessKit('tight').extraHours, 4.5);
  assert.equal(suggestedStairKit('none').hours, 0);
  assert.equal(suggestedStairKit('wedding-cake').hours, 4.2);
  for (const preset of MIL_PRESETS) {
    assert.ok(Number.isFinite(suggestedMilKit(preset.id).hoursPer100Sf));
  }
  for (const preset of BEAD_PRESETS) {
    assert.ok(Number.isFinite(suggestedBeadKit(preset.id).extraHours));
  }
  for (const preset of ACCESS_PRESETS) {
    assert.ok(Number.isFinite(suggestedAccessKit(preset.id).extraHours));
  }
  for (const preset of STAIR_PRESETS) {
    assert.ok(Number.isFinite(suggestedStairKit(preset.id).hours));
  }
  for (const preset of SHAPE_PRESETS) {
    assert.ok(preset.id.length > 0);
  }
  for (const preset of DEPTH_PRESETS) {
    assert.ok(preset.id.length > 0);
  }
  for (const preset of PATTERN_PRESETS) {
    assert.ok(Number.isFinite(suggestedWastePercent(preset.id)));
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    shape: first.shape,
    depth: first.depth,
    mil: first.mil,
    bead: first.bead,
    stairs: first.stairs,
    pattern: first.pattern,
    access: first.access,
    lengthFeet: first.lengthFeet,
    widthFeet: first.widthFeet,
  });
  assert.equal(result.waterSurfaceSf, 512);
  assert.equal(result.linerSf, 960.64);
});

test('the customer-facing summary omits wages and names the liner and stairs', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /VINYL POOL LINER BID/);
  assert.match(text, /32×16/);
  assert.match(text, /liner/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$30/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
