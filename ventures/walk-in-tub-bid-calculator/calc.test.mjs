import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareTub,
  compareOwnerSupply,
  ownerSupplyNote,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedTubKit,
  suggestedDoorKit,
  suggestedExtraKit,
  suggestedOwnerCallbackKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('alcove-swap'),
    ...suggestedTubKit('soaker-acrylic'),
    ...suggestedDoorKit('inward'),
    ...suggestedExtraKit(),
  };
  return {
    tubCount: 1,
    scope: 'alcove-swap',
    tub: 'soaker-acrylic',
    door: 'inward',
    travelMiles: 8,
    includeDemoCastIron: false,
    includeTileSurround: false,
    includeGrabBars: false,
    includeHandheld: false,
    includeFloorSister: false,
    includePermit: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function typicalAging() {
  const kit = {
    ...suggestedScopeKit('alcove-swap'),
    ...suggestedTubKit('whirlpool'),
    ...suggestedDoorKit('outward'),
    ...suggestedExtraKit(),
  };
  return {
    tubCount: 1,
    scope: 'alcove-swap',
    tub: 'whirlpool',
    door: 'outward',
    travelMiles: 14,
    includeDemoCastIron: false,
    includeTileSurround: false,
    includeGrabBars: true,
    includeHandheld: true,
    includeFloorSister: false,
    includePermit: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('alcove-relocate'),
    ...suggestedTubKit('bariatric'),
    ...suggestedDoorKit('walk-through'),
    ...suggestedExtraKit(),
  };
  return {
    tubCount: 1,
    scope: 'alcove-relocate',
    tub: 'bariatric',
    door: 'walk-through',
    travelMiles: 22,
    includeDemoCastIron: true,
    includeTileSurround: true,
    includeGrabBars: true,
    includeHandheld: true,
    includeFloorSister: true,
    includePermit: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 220,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.6, 8, 0.035) - (1.6 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is an acrylic soaker alcove swap, not a relocate-plus-tile job', () => {
  const result = calculateBid(special());
  assert.equal(result.tubCount, 1);
  assert.equal(result.hoursDemoCast, 0);
  assert.equal(result.hoursTile, 0);
  assert.equal(result.hoursGrab, 0);
  assert.equal(result.hoursHandheld, 0);
  assert.equal(result.hoursFloor, 0);
  assert.equal(result.hoursPermit, 0);
  assert.equal(result.tileMaterial, 0);
  assert.ok(result.hoursTub > 0);
  assert.ok(result.hoursDemo > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.fixture + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerTub > 2500 && result.pricePerTub < 9000);
});

test('a relocate extra-wide tile job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.tubCount, 1);
  assert.ok(heavy.hoursTub > cheap.hoursTub);
  assert.ok(heavy.hoursSet > cheap.hoursSet);
  assert.ok(heavy.hoursDemoCast > 0);
  assert.ok(heavy.hoursTile > 0);
  assert.ok(heavy.hoursFloor > 0);
  assert.ok(heavy.tubMaterial > cheap.tubMaterial);
  assert.ok(heavy.tileMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerTub * heavy.tubCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.tubCount > cheap.price / cheap.tubCount);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 42 * 1.3);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...special(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices four alcoves on the same bath', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const swap = rows.find((row) => row.scope === 'alcove-swap');
  const relocate = rows.find((row) => row.scope === 'alcove-relocate');
  const custom = rows.find((row) => row.scope === 'custom-opening');
  const fresh = rows.find((row) => row.scope === 'new-construction');
  assert.ok(swap);
  assert.ok(fresh);
  assert.ok(relocate.price > swap.price);
  assert.ok(custom.price > relocate.price);
  assert.ok(custom.hoursSet > swap.hoursSet);
  assert.ok(custom.delta > 0);
});

test('compareTub prices five units on the same bath', () => {
  const rows = compareTub(special());
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const soaker = rows.find((row) => row.tub === 'soaker-acrylic');
  const whirl = rows.find((row) => row.tub === 'whirlpool');
  const wide = rows.find((row) => row.tub === 'bariatric');
  assert.ok(soaker);
  assert.ok(whirl.price > soaker.price);
  assert.ok(wide.price > soaker.price);
  assert.ok(whirl.upgradeFromSoaker > 0);
  assert.equal(soaker.upgradeFromSoaker, 0);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'nope' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), tub: 'nope' }), /Unknown tub/);
  assert.throws(() => calculateBid({ ...special(), door: 'nope' }), /Unknown door/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('nope'), /Unknown scope/);
  assert.throws(() => suggestedTubKit('nope'), /Unknown tub/);
  assert.throws(() => suggestedDoorKit('nope'), /Unknown door/);
});

test('job presets cover the cheap special and the losing relocate', () => {
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'alcove-swap' && job.tub === 'soaker-acrylic'));
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'alcove-relocate' && job.tub === 'bariatric'));
  assert.ok(JOB_PRESETS.some((job) => job.tubCount === 2));
});

test('compareOwnerSupply zeros the tub invoice and keeps set hours', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(you.tubMaterial > 0);
  assert.equal(covers.tubMaterial, 0);
  assert.equal(wrong.tubMaterial, 0);
  assert.ok(Math.abs(you.totalHours - covers.totalHours) < 1e-9);
  assert.ok(wrong.totalHours > covers.totalHours);
  assert.ok(covers.price < you.price);
  assert.ok(wrong.price > covers.price);
  assert.equal(covers.cheapest, true);
  assert.equal(you.installOnly, null);
});

test('the $1,499 install-only special loses on a typical owner-supplied whirlpool', () => {
  const rows = compareOwnerSupply({ ...typicalAging(), proposedPrice: 1499 });
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(you.installOnly.belowBreakEven);
  assert.ok(covers.installOnly.belowBreakEven);
  assert.ok(wrong.installOnly.belowBreakEven);
  assert.ok(covers.breakEvenPrice > 1499);
  assert.match(ownerSupplyNote(rows), /lose money even when they bought the tub/);
  assert.match(ownerSupplyNote(rows), /\$2,082\.34/);
});

test('on the cheap soaker special, $1,499 covers only if their unit fits', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 1499 });
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(you.installOnly.belowBreakEven, true);
  assert.equal(covers.installOnly.belowBreakEven, false);
  assert.equal(wrong.installOnly.belowBreakEven, false);
  assert.match(ownerSupplyNote(rows), /covers the set if their unit actually fits/);
});

test('owner-supply note without a proposed price names the bid drop', () => {
  const rows = compareOwnerSupply(special());
  assert.match(ownerSupplyNote(rows), /Zeroing the tub invoice/);
  assert.match(ownerSupplyNote(rows), /wrong-unit \/ wrong-drain callback/);
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'you-supply' }]), /missing rows/);
});

test('wrong-unit callback uses the starting kit, not a typed 8-hour set', () => {
  const callback = suggestedOwnerCallbackKit();
  assert.equal(callback.hoursCallbackTrip, 1.6);
  assert.equal(callback.hoursFitEach, 2.0);
  assert.equal(callback.restockEach, 95);
  const rows = compareOwnerSupply({
    ...special(),
    hoursTrip: 8,
    siteHours: 6,
  });
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(Math.abs(wrong.hoursTravel - covers.hoursTravel - 1.6) < 1e-9);
  assert.ok(Math.abs(wrong.siteHours - covers.siteHours - 2.0) < 1e-9);
  assert.ok(wrong.softCost > covers.softCost);
});

test('installOnlyPrice option overrides the proposed price', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 1499 }, { installOnlyPrice: 999 });
  assert.equal(rows[0].installOnlyPrice, 999);
  assert.equal(rows[0].installOnly.price, 999);
});

test('formatBidSummary is a customer-facing draft without wages', () => {
  const text = formatBidSummary(calculateBid(losingJob()), 'Losing relocate');
  assert.match(text, /WALK-IN TUB INSTALL BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /Losing relocate/);
  assert.match(text, /bariatric|extra-wide/i);
  assert.match(text, /relocate/i);
  assert.doesNotMatch(text, /hourly wage/i);
  assert.doesNotMatch(text, /\$42/);
});

test('flag helpers accept common form values', () => {
  const on = calculateBid({ ...special(), includeTileSurround: '1' });
  const off = calculateBid({ ...special(), includeTileSurround: '0' });
  assert.ok(on.hoursTile > 0);
  assert.equal(off.hoursTile, 0);
});
