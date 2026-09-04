import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPerimeter,
  suggestedGlassHeightFeet,
  suggestedGlassSf,
  suggestedKneeWallLf,
  suggestedWindowCount,
  suggestedFloorSf,
  suggestedRoofSf,
  suggestedEnclosureKit,
  suggestedFoundationKit,
  suggestedRoofKit,
  suggestedHeightKit,
  JOB_PRESETS,
  ATTACHMENT_PRESETS,
  ENCLOSURE_PRESETS,
  FOUNDATION_PRESETS,
  ROOF_PRESETS,
  HEIGHT_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  attachment: 'attached',
  enclosure: 'three-season',
  foundation: 'existing-deck',
  roof: 'existing',
  height: '8',
  widthFeet: 12,
  depthFeet: 10,
  wallHeightFeet: 8,
  kneeWallInches: 0,
  windowWidthInches: 48,
  perimeterLf: 32,
  glassSf: 256,
  floorSf: 120,
  roofSf: 0,
  kneeWallLf: 0,
  windowCount: 8,
  sliderCount: 1,
  hoursTrip: 3,
  hoursPerWindow: 1.4,
  extraHoursPerWindow: 0,
  hoursPer100SfGlass: 1.8,
  hoursPerKneeLf: 0.4,
  hoursPer100SfFloor: 1.4,
  hoursPer100SfRoof: 0,
  hoursPerSlider: 2.2,
  hoursHvac: 6,
  hoursElectrical: 4,
  hoursSite: 0.5,
  siteHours: 0.6,
  glassPerSf: 14,
  windowEach: 280,
  kneeWallPerLf: 32,
  floorPerSf: 6,
  roofPerSf: 0,
  sliderEach: 1450,
  hardwareLump: 275,
  hvacFee: 3200,
  electricalFee: 1400,
  mobilizationFee: 325,
  permitFee: 650,
  hourlyWage: 38,
  burdenRate: 30,
  travelAndEquipment: 140,
  overheadRate: 15,
  targetMargin: 25,
  includeHvac: false,
  includeElectrical: false,
  includePermit: false,
});

test('an attached sunroom glazes three sides; a wrap glazes four', () => {
  // 12 wide × 10 deep attached: 12 + 2×10 = 32 lf. Wrap: 2×(12+10) = 44.
  assert.equal(suggestedPerimeter(12, 10, 'attached'), 32);
  assert.equal(suggestedPerimeter(12, 10, 'wrap'), 44);
  assert.equal(suggestedPerimeter(16, 12, 'attached'), 40);
  assert.equal(suggestedPerimeter(20, 16, 'wrap'), 72);
});

test('knee wall subtracts from glass height instead of from floor square feet', () => {
  assert.equal(suggestedGlassHeightFeet(8, 0), 8);
  assert.equal(suggestedGlassHeightFeet(8, 24), 6);
  assert.equal(suggestedGlassHeightFeet(10, 24), 8);
  assert.equal(suggestedGlassHeightFeet(8, 96), 0);
});

test('a 10×12 attached three-season is 256 sf of glass on a 120 sf floor', () => {
  assert.equal(suggestedGlassSf(12, 10, 'attached', 8, 0), 256);
  assert.equal(suggestedGlassSf(16, 12, 'attached', 8, 24), 240);
  assert.equal(suggestedKneeWallLf(12, 10, 'attached', 0), 0);
  assert.equal(suggestedKneeWallLf(16, 12, 'attached', 24), 40);
});

test('windows come from the perimeter, not from floor square feet', () => {
  assert.equal(suggestedWindowCount(32, 48), 8);
  assert.equal(suggestedWindowCount(40, 48), 10);
  assert.equal(suggestedWindowCount(72, 48), 18);
});

test('floor and roof square feet stay on the footprint the coupon already counted', () => {
  assert.equal(suggestedFloorSf(12, 10, 'existing-deck'), 120);
  assert.equal(suggestedFloorSf(16, 12, 'new-slab'), 192);
  assert.equal(suggestedRoofSf(12, 10, 'existing'), 0);
  assert.equal(suggestedRoofSf(16, 12, 'new-insulated'), 192);
});

test('the $180/sf coupon undercounts glass when the 10×12 special is applied to 12×16', () => {
  const small = calculateBid(coupon());
  assert.equal(small.footprintSf, 120);
  assert.equal(small.glassSf, 256);
  assert.equal(small.windowCount, 8);
  assert.equal(small.roofSf, 0);
  // Starting rates on the 10×12 three-season land well under the published
  // $180/sf coupon — that coupon still has margin on the simple job. The
  // failure is applying the same number to a 12×16 that has more glass.
  assert.ok(small.pricePerSf > 80 && small.pricePerSf < 160, `open 10×12 is ${small.pricePerSf}/sf`);
  assert.ok(small.price < 180 * 120, 'the $180/sf coupon still clears the 10×12');

  const larger = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    glassSf: 320,
    floorSf: 192,
    windowCount: 10,
  });
  assert.equal(larger.footprintSf, 192);
  assert.equal(larger.glassSf, 320);
  assert.ok(larger.price > small.price);
  assert.ok(larger.windowCount > small.windowCount);
});

test('a four-season with a new slab and insulated roof is a different job than the coupon', () => {
  const threeSeason = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    glassSf: 320,
    floorSf: 192,
    windowCount: 10,
  });
  const fourSeason = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    glassSf: 240,
    floorSf: 192,
    roofSf: 192,
    kneeWallLf: 40,
    windowCount: 10,
    enclosure: 'four-season',
    foundation: 'new-slab',
    roof: 'new-insulated',
    kneeWallInches: 24,
    hoursPer100SfGlass: 3.4,
    glassPerSf: 42,
    hoursPer100SfFloor: 4.2,
    floorPerSf: 14,
    hoursPer100SfRoof: 3.8,
    roofPerSf: 16,
    includeHvac: true,
    includeElectrical: true,
    includePermit: true,
  });
  assert.equal(threeSeason.kneeWallLf, 0);
  assert.equal(fourSeason.kneeWallLf, 40);
  assert.equal(fourSeason.roofSf, 192);
  assert.ok(fourSeason.envelopeShareOfDirect > 50, `envelope is ${fourSeason.envelopeShareOfDirect.toFixed(1)}% of direct`);
  assert.ok(fourSeason.price > threeSeason.price);
  const couponPrice = 180 * 192;
  assert.ok(fourSeason.price > couponPrice, `four-season ${fourSeason.price} should beat a $180/sf coupon of ${couponPrice}`);
});

test('insulated glass on the same 12×16 is a real share of direct cost the coupon cannot see', () => {
  const vinyl = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    glassSf: 320,
    floorSf: 192,
    windowCount: 10,
  });
  const insulated = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    glassSf: 320,
    floorSf: 192,
    windowCount: 10,
    enclosure: 'four-season',
    hoursPer100SfGlass: 3.4,
    glassPerSf: 42,
  });
  assert.ok(insulated.glassHours > vinyl.glassHours);
  assert.ok(insulated.glassMaterial > vinyl.glassMaterial);
  assert.ok(insulated.price > vinyl.price);
  assert.ok(insulated.glassShareOfDirect > 20, `glass is ${insulated.glassShareOfDirect.toFixed(1)}% of direct`);
});

test('10-foot walls add hours the 8-foot special never priced', () => {
  const eight = calculateBid(coupon());
  const ten = calculateBid({
    ...coupon(),
    height: '10',
    wallHeightFeet: 10,
    glassSf: 320,
    extraHoursPerWindow: 0.25,
  });
  assert.ok(ten.windowHours > eight.windowHours);
  assert.ok(ten.glassSf > eight.glassSf);
  assert.ok(ten.price > eight.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 38 * 1.3);

  const expectedHours = 3 + 8 * 1.4 + 256 * 1.8 / 100 + 0 + 120 * 1.4 / 100 + 0 + 1 * 2.2 + 0 + 0 + 0.5 + 0.6;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 38 * 1.3;
  const material = 256 * 14 + 8 * 280 + 120 * 6 + 1 * 1450 + 275;
  const soft = 140 + 325 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('HVAC, electrical, permit, and a new roof stay off until the flags are on', () => {
  const off = calculateBid(coupon());
  assert.equal(off.hvacHours, 0);
  assert.equal(off.hvacMaterial, 0);
  assert.equal(off.electricalHours, 0);
  assert.equal(off.electricalMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.roofHours, 0);

  const on = calculateBid({
    ...coupon(),
    includeHvac: true,
    includeElectrical: true,
    includePermit: true,
    roof: 'new-insulated',
    roofSf: 120,
    hoursPer100SfRoof: 3.8,
    roofPerSf: 16,
  });
  assert.equal(on.hvacHours, 6);
  assert.equal(on.hvacMaterial, 3200);
  assert.equal(on.electricalHours, 4);
  assert.equal(on.electricalMaterial, 1400);
  assert.equal(on.permitMaterial, 650);
  assert.ok(on.roofHours > 0);
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

test('a proposed $180/sf coupon on the 10×12 is scored, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const couponBid = calculateBid({ ...coupon(), proposedPrice: 180 * 120 });
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

test('unknown attachment, enclosure, foundation, roof, or height is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), attachment: 'gazebo' }), /Unknown attachment/);
  assert.throws(() => calculateBid({ ...coupon(), enclosure: 'screen' }), /Unknown enclosure/);
  assert.throws(() => calculateBid({ ...coupon(), foundation: 'piers' }), /Unknown foundation/);
  assert.throws(() => calculateBid({ ...coupon(), roof: 'thatch' }), /Unknown roof/);
  assert.throws(() => calculateBid({ ...coupon(), height: '14' }), /Unknown height/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), depthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped enclosure, foundation, roof, and height lists', () => {
  assert.equal(suggestedEnclosureKit('three-season').glassPerSf, 14);
  assert.equal(suggestedEnclosureKit('four-season').hoursPer100Sf, 3.4);
  assert.equal(suggestedFoundationKit('existing-deck').floorPerSf, 6);
  assert.equal(suggestedFoundationKit('new-slab').hoursPer100Sf, 4.2);
  assert.equal(suggestedRoofKit('existing').roofPerSf, 0);
  assert.equal(suggestedRoofKit('new-insulated').hoursPer100Sf, 3.8);
  assert.equal(suggestedHeightKit('8').wallHeightFeet, 8);
  assert.equal(suggestedHeightKit('10').extraHoursPerWindow, 0.25);
  for (const preset of ENCLOSURE_PRESETS) {
    assert.ok(Number.isFinite(suggestedEnclosureKit(preset.id).hoursPer100Sf));
  }
  for (const preset of FOUNDATION_PRESETS) {
    assert.ok(Number.isFinite(suggestedFoundationKit(preset.id).floorPerSf));
  }
  for (const preset of ROOF_PRESETS) {
    assert.ok(Number.isFinite(suggestedRoofKit(preset.id).roofPerSf));
  }
  for (const preset of HEIGHT_PRESETS) {
    assert.ok(suggestedHeightKit(preset.id).wallHeightFeet > 0);
  }
  for (const preset of ATTACHMENT_PRESETS) {
    assert.ok(preset.id.length > 0);
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    attachment: first.attachment,
    enclosure: first.enclosure,
    foundation: first.foundation,
    roof: first.roof,
    height: first.height,
    widthFeet: first.widthFeet,
    depthFeet: first.depthFeet,
  });
  assert.equal(result.footprintSf, 120);
  assert.equal(result.windowCount, 8);
});

test('the customer-facing summary omits wages and names the glass and floor', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /SUNROOM \/ THREE-SEASON \/ FOUR-SEASON BID/);
  assert.match(text, /12×10/);
  assert.match(text, /glass/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$38/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
