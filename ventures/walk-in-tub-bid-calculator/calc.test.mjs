import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareTub,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedTubKit,
  suggestedDoorKit,
  suggestedExtraKit,
  suggestedOwnerCallbackKit,
  suggestedAccessKit,
  ACCESS_PRESETS,
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

test('on a typical whirlpool alcove the $1,499 showroom special loses even when they bought the tub', () => {
  const rows = compareOwnerSupply({ ...typicalAging(), proposedPrice: 1499 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(fits.breakEvenPrice - 2082.34) < 0.02);
  assert.ok(Math.abs(contractor.price - 8640.43) < 0.02);
  assert.match(ownerSupplyNote(rows), /lose money even when they bought the tub/);
  assert.match(ownerSupplyNote(rows), /\$2,082\.34/);
});

test('suggestedOwnerCallbackKit is a second trip plus missing hardware', () => {
  const kit = suggestedOwnerCallbackKit();
  assert.equal(kit.hoursCallbackTrip, suggestedExtraKit().hoursTrip);
  assert.ok(kit.hoursMissingHardwareEach > 0);
  assert.ok(kit.missingHardwareEach > 0);
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const rows = compareAccess(special());
  assert.equal(rows.length, 3);
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.ok(weekday.cheapest);
  assert.ok(occupied.price > weekday.price);
  assert.ok(afterHours.price > occupied.price);
  assert.equal(weekday.loadedWage, occupied.loadedWage);
  assert.ok(afterHours.loadedWage > weekday.loadedWage);
  assert.ok(occupied.totalHours > weekday.totalHours);
  assert.ok(occupied.hoursTub > weekday.hoursTub);
  assert.ok(occupied.hoursSet > weekday.hoursSet);
  assert.ok(occupied.siteHours > weekday.siteHours);
  assert.equal(afterHours.hoursTub, weekday.hoursTub);
  assert.ok(afterHours.hoursTravel > weekday.hoursTravel);
  assert.ok(Math.abs(weekday.price - 3757.32) < 0.02);
  assert.ok(Math.abs(occupied.price - 3928.03) < 0.02);
  assert.ok(Math.abs(afterHours.price - 4407.98) < 0.02);
});

test('compareAccess does not leak a typed site day into the extra evening dispatch', () => {
  const baseline = compareAccess(special());
  const overridden = compareAccess({ ...special(), siteHours: 9 });
  const afterHours = overridden.find((row) => row.access === 'after-hours');
  const baselineAfter = baseline.find((row) => row.access === 'after-hours');
  const weekday = overridden.find((row) => row.access === 'weekday-scheduled');
  assert.equal(afterHours.siteHours, weekday.siteHours);
  assert.ok(Math.abs(afterHours.hoursTravel - baselineAfter.hoursTravel) < 1e-9);
});

test('a $3,499 Saturday special covers a weekday soaker and loses after-hours', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 3499 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.installOnly.profit + 27.39) < 0.02);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 3526.39) < 0.02);
  assert.match(accessNote(rows), /weekday set covers/i);
  assert.match(accessNote(rows), /\$27\.39/);
  assert.match(accessNote(rows), /\$3,526\.39/);
});

test('a $5,800 Saturday whirlpool special loses even on a weekday', () => {
  const rows = compareAccess(typicalAging(), { installOnlyPrice: 5800 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(weekday.price - 8640.43) < 0.02);
  assert.ok(Math.abs(afterHours.price - 9566.19) < 0.02);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 7652.95) < 0.02);
  assert.match(accessNote(rows), /lose money even on a weekday slot/i);
  assert.match(accessNote(rows), /\$5,800/);
  assert.match(accessNote(rows), /\$7,652\.95/);
});

test('accessNote names the bid lift when no Saturday number is on the table', () => {
  const note = accessNote(compareAccess(special()));
  assert.match(note, /Only-bath-still-in-use adds \$170\.71/);
  assert.match(note, /After-hours \/ Saturday adds \$650\.66/);
});

test('accessNote uses proposedPrice when installOnlyPrice is omitted', () => {
  const rows = compareAccess({ ...special(), proposedPrice: 3499 });
  assert.equal(rows[0].installOnlyPrice, 3499);
  assert.match(accessNote(rows), /\$3,499\.00/);
});

test('accessNote rejects a missing comparison', () => {
  assert.throws(() => accessNote(null), /missing rows/);
  assert.throws(() => accessNote([{ access: 'weekday-scheduled' }]), /missing rows/);
});

test('ACCESS_PRESETS name the three windows contractors actually get shopped on', () => {
  assert.equal(ACCESS_PRESETS.length, 3);
  assert.equal(ACCESS_PRESETS[0].id, 'weekday-scheduled');
  assert.equal(ACCESS_PRESETS[1].id, 'occupied-weekday');
  assert.equal(ACCESS_PRESETS[2].id, 'after-hours');
  const kit = suggestedAccessKit();
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
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
