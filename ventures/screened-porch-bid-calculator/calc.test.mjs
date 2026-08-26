import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPerimeter,
  suggestedScreenHeightFeet,
  suggestedWallScreenSf,
  suggestedKneeWallLf,
  suggestedPanelCount,
  suggestedRoofSf,
  suggestedCeilingSf,
  suggestedMeshKit,
  suggestedRoofKit,
  suggestedCeilingKit,
  suggestedHeightKit,
  JOB_PRESETS,
  ATTACHMENT_PRESETS,
  ROOF_PRESETS,
  CEILING_PRESETS,
  MESH_PRESETS,
  HEIGHT_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  attachment: 'attached',
  roof: 'existing',
  ceiling: 'none',
  mesh: 'fiberglass',
  height: '8',
  widthFeet: 12,
  depthFeet: 10,
  wallHeightFeet: 8,
  kneeWallInches: 0,
  panelWidthInches: 36,
  perimeterLf: 32,
  wallScreenSf: 256,
  roofSf: 0,
  ceilingSf: 0,
  kneeWallLf: 0,
  panelCount: 11,
  doorCount: 1,
  hoursTrip: 2,
  hoursPerPanel: 0.55,
  extraHoursPerPanel: 0,
  hoursPer100SfScreen: 1.1,
  hoursPerKneeLf: 0.35,
  hoursPer100SfRoof: 0,
  hoursPer100SfCeiling: 0,
  hoursPerDoor: 1.4,
  hoursFan: 1.1,
  hoursDemo: 2.5,
  hoursSite: 0.4,
  siteHours: 0.5,
  screenPerSf: 1.35,
  panelEach: 38,
  kneeWallPerLf: 28,
  roofPerSf: 0,
  ceilingPerSf: 0,
  doorEach: 285,
  hardwareLump: 175,
  fanFee: 240,
  demoFee: 275,
  mobilizationFee: 185,
  permitFee: 225,
  hourlyWage: 30,
  burdenRate: 30,
  travelAndEquipment: 95,
  overheadRate: 15,
  targetMargin: 25,
  includeFan: false,
  includePermit: false,
  demoExisting: false,
});

test('an attached porch screens three sides; a wrap screens four', () => {
  // 12 wide × 10 deep attached: 12 + 2×10 = 32 lf. Freestanding: 2×(12+10) = 44.
  assert.equal(suggestedPerimeter(12, 10, 'attached'), 32);
  assert.equal(suggestedPerimeter(12, 10, 'freestanding'), 44);
  assert.equal(suggestedPerimeter(16, 12, 'attached'), 40);
  assert.equal(suggestedPerimeter(32, 16, 'freestanding'), 96);
});

test('knee wall subtracts from screen height instead of from floor square feet', () => {
  assert.equal(suggestedScreenHeightFeet(8, 0), 8);
  assert.equal(suggestedScreenHeightFeet(8, 36), 5);
  assert.equal(suggestedScreenHeightFeet(10, 24), 8);
  assert.equal(suggestedScreenHeightFeet(8, 96), 0);
});

test('a 10×12 attached screen-in is 256 sf of wall screen on a 120 sf floor', () => {
  assert.equal(suggestedWallScreenSf(12, 10, 'attached', 8, 0), 256);
  assert.equal(suggestedWallScreenSf(16, 12, 'attached', 8, 36), 200);
  assert.equal(suggestedKneeWallLf(12, 10, 'attached', 0), 0);
  assert.equal(suggestedKneeWallLf(16, 12, 'attached', 36), 40);
});

test('panels come from the perimeter, not from floor square feet', () => {
  assert.equal(suggestedPanelCount(32, 36), 11);
  assert.equal(suggestedPanelCount(40, 36), 14);
  assert.equal(suggestedPanelCount(96, 48), 24);
});

test('roof and ceiling square feet stay zero until the shop actually builds them', () => {
  assert.equal(suggestedRoofSf(12, 10, 'existing'), 0);
  assert.equal(suggestedRoofSf(16, 12, 'framed'), 192);
  assert.equal(suggestedRoofSf(32, 16, 'screen-roof'), 512);
  assert.equal(suggestedCeilingSf(16, 12, 'none'), 0);
  assert.equal(suggestedCeilingSf(16, 12, 'beadboard'), 192);
  assert.equal(suggestedCeilingSf(16, 12, 'vinyl'), 192);
});

test('the $55/sf coupon undercounts screen when the 10×12 special is applied to 12×16', () => {
  const small = calculateBid(coupon());
  assert.equal(small.footprintSf, 120);
  assert.equal(small.wallScreenSf, 256);
  assert.equal(small.panelCount, 11);
  assert.equal(small.roofSf, 0);
  // Starting rates on the 10×12 screen-in land well under the published
  // $55/sf coupon — that coupon still has margin on the simple job. The
  // failure is applying the same number to a 12×16 that has more screen.
  assert.ok(small.pricePerSf > 20 && small.pricePerSf < 40, `open 10×12 is ${small.pricePerSf}/sf`);
  assert.ok(small.price < 55 * 120, 'the $55/sf coupon still clears the 10×12');

  const larger = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    wallScreenSf: 320,
    panelCount: 14,
  });
  assert.equal(larger.footprintSf, 192);
  assert.equal(larger.wallScreenSf, 320);
  assert.ok(larger.price > small.price);
  assert.ok(larger.panelCount > small.panelCount);
});

test('knee wall plus a new roof is a different job than the screen-in coupon', () => {
  const screenIn = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    wallScreenSf: 320,
    panelCount: 14,
  });
  const enclosed = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    wallScreenSf: 200,
    roofSf: 192,
    ceilingSf: 192,
    kneeWallLf: 40,
    panelCount: 14,
    roof: 'framed',
    ceiling: 'beadboard',
    kneeWallInches: 36,
    hoursPer100SfRoof: 3.4,
    roofPerSf: 12,
    hoursPer100SfCeiling: 2.4,
    ceilingPerSf: 7.5,
  });
  assert.equal(screenIn.kneeWallLf, 0);
  assert.equal(enclosed.kneeWallLf, 40);
  assert.equal(enclosed.roofSf, 192);
  assert.equal(enclosed.ceilingSf, 192);
  assert.ok(enclosed.enclosureShareOfDirect > 50, `enclosure is ${enclosed.enclosureShareOfDirect.toFixed(1)}% of direct`);
  assert.ok(enclosed.price > screenIn.price);
  const couponPrice = 55 * 192;
  assert.ok(enclosed.price > couponPrice, `enclosed ${enclosed.price} should beat a $55/sf coupon of ${couponPrice}`);
});

test('pet mesh on the same 12×16 is a real share of direct cost the coupon cannot see', () => {
  const fiberglass = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    wallScreenSf: 320,
    panelCount: 14,
  });
  const pet = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    perimeterLf: 40,
    wallScreenSf: 320,
    panelCount: 14,
    mesh: 'pet',
    hoursPer100SfScreen: 1.5,
    screenPerSf: 2.4,
  });
  assert.ok(pet.screenHours > fiberglass.screenHours);
  assert.ok(pet.screenMaterial > fiberglass.screenMaterial);
  assert.ok(pet.price > fiberglass.price);
  assert.ok(pet.screenShareOfDirect > 20, `screen is ${pet.screenShareOfDirect.toFixed(1)}% of direct`);
});

test('10-foot walls add hours the 8-foot special never priced', () => {
  const eight = calculateBid(coupon());
  const ten = calculateBid({
    ...coupon(),
    height: '10',
    wallHeightFeet: 10,
    wallScreenSf: 320,
    extraHoursPerPanel: 0.2,
  });
  assert.ok(ten.panelHours > eight.panelHours);
  assert.ok(ten.wallScreenSf > eight.wallScreenSf);
  assert.ok(ten.price > eight.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 30 * 1.3);

  const expectedHours = 2 + 11 * 0.55 + 256 * 1.1 / 100 + 0 + 0 + 0 + 1 * 1.4 + 0 + 0 + 0.4 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 30 * 1.3;
  const material = 256 * 1.35 + 11 * 38 + 1 * 285 + 175;
  const soft = 95 + 185 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('fan, demo, permit, roof, and ceiling stay off until the flags are on', () => {
  const off = calculateBid(coupon());
  assert.equal(off.fanHours, 0);
  assert.equal(off.fanMaterial, 0);
  assert.equal(off.demoHours, 0);
  assert.equal(off.demoMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.roofHours, 0);
  assert.equal(off.ceilingHours, 0);

  const on = calculateBid({
    ...coupon(),
    includeFan: true,
    includePermit: true,
    demoExisting: true,
    roof: 'framed',
    ceiling: 'vinyl',
    roofSf: 120,
    ceilingSf: 120,
    hoursPer100SfRoof: 3.4,
    roofPerSf: 12,
    hoursPer100SfCeiling: 1.6,
    ceilingPerSf: 4.25,
  });
  assert.equal(on.fanHours, 1.1);
  assert.equal(on.fanMaterial, 240);
  assert.equal(on.demoHours, 2.5);
  assert.equal(on.demoMaterial, 275);
  assert.equal(on.permitMaterial, 225);
  assert.ok(on.roofHours > 0);
  assert.ok(on.ceilingHours > 0);
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

test('a proposed $55/sf coupon on the 10×12 is scored, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const couponBid = calculateBid({ ...coupon(), proposedPrice: 55 * 120 });
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

test('unknown attachment, roof, ceiling, mesh, or height is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), attachment: 'gazebo' }), /Unknown attachment/);
  assert.throws(() => calculateBid({ ...coupon(), roof: 'thatch' }), /Unknown roof/);
  assert.throws(() => calculateBid({ ...coupon(), ceiling: 'tin' }), /Unknown ceiling/);
  assert.throws(() => calculateBid({ ...coupon(), mesh: 'chicken-wire' }), /Unknown mesh/);
  assert.throws(() => calculateBid({ ...coupon(), height: '14' }), /Unknown height/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), depthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped mesh, roof, ceiling, and height lists', () => {
  assert.equal(suggestedMeshKit('fiberglass').screenPerSf, 1.35);
  assert.equal(suggestedMeshKit('hurricane').hoursPer100Sf, 2.1);
  assert.equal(suggestedRoofKit('existing').roofPerSf, 0);
  assert.equal(suggestedRoofKit('framed').hoursPer100Sf, 3.4);
  assert.equal(suggestedCeilingKit('none').ceilingPerSf, 0);
  assert.equal(suggestedCeilingKit('beadboard').ceilingPerSf, 7.5);
  assert.equal(suggestedHeightKit('8').wallHeightFeet, 8);
  assert.equal(suggestedHeightKit('12').extraHoursPerPanel, 0.4);
  for (const preset of MESH_PRESETS) {
    assert.ok(Number.isFinite(suggestedMeshKit(preset.id).hoursPer100Sf));
  }
  for (const preset of ROOF_PRESETS) {
    assert.ok(Number.isFinite(suggestedRoofKit(preset.id).roofPerSf));
  }
  for (const preset of CEILING_PRESETS) {
    assert.ok(Number.isFinite(suggestedCeilingKit(preset.id).ceilingPerSf));
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
    roof: first.roof,
    ceiling: first.ceiling,
    mesh: first.mesh,
    height: first.height,
    widthFeet: first.widthFeet,
    depthFeet: first.depthFeet,
  });
  assert.equal(result.footprintSf, 120);
  assert.equal(result.panelCount, 11);
});

test('the customer-facing summary omits wages and names the screen and knee wall', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /SCREENED PORCH \/ LANAI BID/);
  assert.match(text, /12×10/);
  assert.match(text, /screen/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$30/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
