import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  unitedInches,
  sizeHoursAdd,
  storyHoursAdd,
  UNIT_TYPE_PRESETS,
  FRAME_PRESETS,
  BASE_UI,
  LARGE_UI,
  OVERSIZE_UI,
  LARGE_HOURS_ADD,
  OVERSIZE_HOURS_ADD,
  DEFAULT_DISPOSAL_PER_OPENING,
} from './calc.mjs';

const house = () => ({
  openings: [
    { name: 'Living picture', type: 'picture', widthIn: 60, heightIn: 48, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' },
    { name: 'Bedrooms', type: 'double-hung', widthIn: 30, heightIn: 54, quantity: 4, story: 2, frame: 'vinyl', install: 'insert', condition: 'clean' },
    { name: 'Kitchen slider', type: 'slider', widthIn: 60, heightIn: 36, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' },
    { name: 'Master casement', type: 'casement', widthIn: 32, heightIn: 60, quantity: 1, story: 2, frame: 'vinyl', install: 'insert', condition: 'rot' },
  ],
  hourlyWage: 38,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 28,
  setupHours: 1,
  minOnSiteHours: 6,
  tripFee: 95,
  scaffoldingCost: 375,
  disposalPerOpening: 18,
  permitCost: 85,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 25,
});

test('United Inches are width plus height, the unit the glass shop prices', () => {
  assert.equal(unitedInches(30, 40), 70);
  assert.equal(unitedInches(60, 48), 108);
});

test('size adders kick in only after a stock 3040', () => {
  assert.equal(sizeHoursAdd(BASE_UI), 0);
  assert.equal(sizeHoursAdd(LARGE_UI), 0);
  assert.equal(sizeHoursAdd(LARGE_UI + 1), LARGE_HOURS_ADD);
  assert.equal(sizeHoursAdd(OVERSIZE_UI + 1), OVERSIZE_HOURS_ADD);
});

test('story adders are zero on the first floor and jump on the third', () => {
  assert.equal(storyHoursAdd(1), 0);
  assert.equal(storyHoursAdd(2), 0.75);
  assert.equal(storyHoursAdd(3), 2.1);
  assert.equal(storyHoursAdd(4), 2.1);
});

test('identical opening counts still produce different material when UI differs', () => {
  const small = calculateBid({
    ...house(),
    openings: [{ name: '3040', type: 'double-hung', widthIn: 30, heightIn: 40, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
    scaffoldingCost: 0,
    minOnSiteHours: 0,
    setupHours: 0,
    milesOneWay: 0,
    tripFee: 0,
    permitCost: 0,
    disposalPerOpening: 0,
    overheadRate: 0,
    targetMargin: 0,
    hourlyWage: 0,
  });
  const large = calculateBid({
    ...house(),
    openings: [{ name: '6048', type: 'double-hung', widthIn: 60, heightIn: 48, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
    scaffoldingCost: 0,
    minOnSiteHours: 0,
    setupHours: 0,
    milesOneWay: 0,
    tripFee: 0,
    permitCost: 0,
    disposalPerOpening: 0,
    overheadRate: 0,
    targetMargin: 0,
    hourlyWage: 0,
  });
  assert.equal(small.openingCount, large.openingCount);
  assert.ok(large.unitMaterial > small.unitMaterial, 'larger UI must buy more unit');
  assert.ok(large.installHours > small.installHours, 'oversize must take more set time');
});

test('second-story bedrooms consume labor out of proportion to their count', () => {
  const result = calculateBid(house());
  const bedrooms = result.openings.find(row => row.name === 'Bedrooms');
  const picture = result.openings.find(row => row.name === 'Living picture');
  assert.equal(result.openingCount, 7);
  assert.equal(bedrooms.quantity, 4);
  assert.ok(bedrooms.hours > picture.hours * 3, `four 2nd-story DHs should dwarf one 1st-floor picture: ${bedrooms.hours} vs ${picture.hours}`);
  assert.ok(result.secondStoryShareOfLabor > 50, `2nd story is ${result.secondStoryShareOfLabor.toFixed(1)}% of productive hours`);
  assert.equal(result.needsAccess, true);
  assert.equal(result.scaffolding, 375);
});

test('rot repair is carpentry hours hiding inside a window line', () => {
  const clean = calculateBid({
    ...house(),
    openings: [{ name: 'Master', type: 'casement', widthIn: 32, heightIn: 60, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
  });
  const rot = calculateBid({
    ...house(),
    openings: [{ name: 'Master', type: 'casement', widthIn: 32, heightIn: 60, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'rot' }],
  });
  assert.ok(rot.installHours - clean.installHours > 1.5);
  assert.ok(rot.unitMaterial - clean.unitMaterial === 65);
});

test('a bay is a different job, not one more opening', () => {
  const hung = calculateBid({
    ...house(),
    openings: [{ name: 'DH', type: 'double-hung', widthIn: 30, heightIn: 40, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
    minOnSiteHours: 0,
    setupHours: 0,
  });
  const bay = calculateBid({
    ...house(),
    openings: [{ name: 'Bay', type: 'bay', widthIn: 96, heightIn: 60, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
    minOnSiteHours: 0,
    setupHours: 0,
  });
  assert.ok(bay.installHours > hung.installHours * 3);
  assert.ok(bay.unitMaterial > hung.unitMaterial * 4);
});

test('price stacks burden, disposal, scaffolding, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 38 * 1.32);
  assert.equal(result.disposal, 7 * DEFAULT_DISPOSAL_PER_OPENING);
  assert.equal(result.scaffolding, 375);

  const direct = result.laborCost + result.unitMaterial + result.addOnParts + result.disposal
    + result.scaffolding + result.tripFee + result.permitCost + result.otherCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a $550-a-window special on this house is underwater', () => {
  const bid = calculateBid(house());
  const special = calculateBid({ ...house(), proposedPrice: 550 * bid.openingCount });
  assert.equal(special.proposed.belowBreakEven, true);
  assert.ok(special.proposed.profit < 0);
  assert.ok(bid.pricePerOpening > 550, `real average is ${bid.pricePerOpening.toFixed(0)} per opening`);
});

test('a first-floor-only job does not buy scaffolding', () => {
  const result = calculateBid({
    ...house(),
    openings: [{ name: 'Slider', type: 'slider', widthIn: 60, heightIn: 36, quantity: 2, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
  });
  assert.equal(result.needsAccess, false);
  assert.equal(result.scaffolding, 0);
  assert.equal(result.maxStory, 1);
});

test('quantity scales hours and material without inventing extra openings in the takeoff list', () => {
  const one = calculateBid({
    ...house(),
    openings: [{ name: 'DH', type: 'double-hung', widthIn: 30, heightIn: 54, quantity: 1, story: 2, frame: 'vinyl', install: 'insert', condition: 'clean' }],
  });
  const four = calculateBid({
    ...house(),
    openings: [{ name: 'DH', type: 'double-hung', widthIn: 30, heightIn: 54, quantity: 4, story: 2, frame: 'vinyl', install: 'insert', condition: 'clean' }],
  });
  assert.equal(four.openings.length, 1);
  assert.equal(four.openingCount, 4);
  assert.ok(Math.abs(four.installHours - one.installHours * 4) < 1e-9);
  assert.ok(Math.abs(four.unitMaterial - one.unitMaterial * 4) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...house(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
});

test('minimum on-site hours lift a tiny takeoff instead of quoting a free stop', () => {
  const result = calculateBid({
    ...house(),
    openings: [{ name: 'Hopper', type: 'hopper', widthIn: 24, heightIn: 16, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean' }],
    setupHours: 0.25,
    minOnSiteHours: 6,
    milesOneWay: 0,
  });
  assert.equal(result.minimumApplied, true);
  assert.equal(result.onSiteHours, 6);
});

test('a nameless opening still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    openings: [{ widthIn: 30, heightIn: 40, quantity: 1, story: 1 }, { name: '   ', widthIn: 24, heightIn: 36, quantity: 1, story: 1 }],
  });
  assert.equal(result.openings[0].name, 'Opening 1');
  assert.equal(result.openings[1].name, 'Opening 2');
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), openings: [] }), /at least one opening/);
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), speedMph: 0 }), /Travel speed must be greater than zero/);
  assert.throws(
    () => calculateBid({ ...house(), openings: [{ name: 'Bad', widthIn: -1, heightIn: 40, quantity: 1, story: 1 }] }),
    /Bad: width must be at least 0/,
  );
});

test('presets are usable positive numbers', () => {
  assert.ok(UNIT_TYPE_PRESETS.length >= 6);
  for (const preset of UNIT_TYPE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.hours > 0 && preset.materialBase > 0);
  }
  for (const preset of FRAME_PRESETS) {
    assert.ok(preset.materialMult > 0 && preset.hoursMult > 0);
  }
});
