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

test('compareOwnerSupply zeros the tub invoice and keeps the set hours', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(contractor);
  assert.ok(fits);
  assert.ok(wrong);
  assert.equal(fits.cheapest, true);
  assert.ok(fits.price < contractor.price);
  assert.ok(fits.fixtureMaterial < contractor.fixtureMaterial);
  assert.equal(fits.totalHours, contractor.totalHours);
  assert.equal(fits.hoursSet, contractor.hoursSet);
  assert.ok(wrong.totalHours > fits.totalHours);
  assert.ok(wrong.price > fits.price);
  assert.ok(wrong.doorMaterial > fits.doorMaterial);
  assert.ok(wrong.hoursTravel > fits.hoursTravel);
  assert.ok(wrong.hoursDoor > fits.hoursDoor);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special()).find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...special(),
    tubInvoice: 9999,
  }).find((row) => row.supply === 'owner-fits');
  assert.ok(baseline);
  assert.ok(overridden);
  assert.equal(overridden.fixtureMaterial, baseline.fixtureMaterial);
  assert.ok(Math.abs(overridden.price - baseline.price) < 1e-9);
});

test('compareOwnerSupply scores a $995 install-only special against each cost base', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 995 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, false);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(fits.breakEvenPrice < 995);
  assert.ok(wrong.breakEvenPrice > 995);
  const note = ownerSupplyNote(rows);
  assert.match(note, /\$995\.00/);
  assert.match(note, /covers the set if their tub actually fits/i);
  assert.match(note, /wrong-drain callback still loses/i);
});

test('compareOwnerSupply scores a $795 install-only special as a loss even when they bought the tub', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 795 });
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.ok(fits.breakEvenPrice > 795);
  const note = ownerSupplyNote(rows);
  assert.match(note, /\$795\.00/);
  assert.match(note, /lose money even when they bought the tub/i);
  assert.match(note, /walk-away/i);
});

test('ownerSupplyNote names the bid drop when no install-only price is set', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the tub invoice drops the bid/i);
  assert.match(note, /wrong-drain callback/i);
});

test('ownerSupplyNote names the path that covers when only the owner-supplied set holds', () => {
  const rows = compareOwnerSupply(special());
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const between = Math.round((fits.breakEvenPrice + rows.find((row) => row.supply === 'contractor-supplied').breakEvenPrice) / 2);
  const scored = compareOwnerSupply(special(), { installOnlyPrice: between });
  assert.match(ownerSupplyNote(scored), /covers the set if their tub actually fits/i);
});

test('ownerSupplyNote uses proposedPrice when installOnlyPrice is omitted', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 995 });
  assert.equal(rows[0].installOnlyPrice, 995);
  assert.match(ownerSupplyNote(rows), /\$995\.00/);
});

test('ownerSupplyNote rejects a short row list', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'contractor-supplied' }]), /missing rows/);
});

test('suggestedOwnerCallbackKit is a second trip plus missing hardware', () => {
  const kit = suggestedOwnerCallbackKit();
  assert.equal(kit.hoursCallbackTrip, suggestedExtraKit().hoursTrip);
  assert.ok(kit.hoursMissingHardwareEach > 0);
  assert.ok(kit.missingHardwareEach > 0);
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
