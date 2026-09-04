import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareWindow,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedWindowKit,
  suggestedWellKit,
  suggestedExtraKit,
  suggestedOwnerCallbackKit,
  suggestedAccessKit,
  ACCESS_PRESETS,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('retrofit-existing'),
    ...suggestedWindowKit('vinyl-hopper'),
    ...suggestedWellKit('plastic'),
    ...suggestedExtraKit(),
  };
  return {
    windowCount: 1,
    scope: 'retrofit-existing',
    window: 'vinyl-hopper',
    well: 'plastic',
    travelMiles: 8,
    includeCover: false,
    includeLadder: false,
    includeDrain: false,
    includeHaul: false,
    includeInteriorFinish: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function typicalLegalBedroom() {
  const kit = {
    ...suggestedScopeKit('new-cut-masonry'),
    ...suggestedWindowKit('vinyl-slider'),
    ...suggestedWellKit('steel'),
    ...suggestedExtraKit(),
  };
  return {
    windowCount: 1,
    scope: 'new-cut-masonry',
    window: 'vinyl-slider',
    well: 'steel',
    travelMiles: 14,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: false,
    includeInteriorFinish: false,
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
    ...suggestedScopeKit('new-cut-poured'),
    ...suggestedWindowKit('vinyl-casement'),
    ...suggestedWellKit('stone'),
    ...suggestedExtraKit(),
  };
  return {
    windowCount: 1,
    scope: 'new-cut-poured',
    window: 'vinyl-casement',
    well: 'stone',
    travelMiles: 22,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: true,
    includeInteriorFinish: true,
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
  assert.ok(Math.abs(travelHours(1.4, 8, 0.035) - (1.4 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is a hopper retrofit, not a poured-wall cut', () => {
  const result = calculateBid(special());
  assert.equal(result.windowCount, 1);
  assert.equal(result.hoursCut, 0);
  assert.equal(result.hoursCover, 0);
  assert.equal(result.hoursLadder, 0);
  assert.equal(result.hoursDrain, 0);
  assert.equal(result.hoursHaul, 0);
  assert.equal(result.hoursFinish, 0);
  assert.equal(result.coverMaterial, 0);
  assert.ok(result.hoursWindow > 0);
  assert.ok(result.hoursWell > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.sash + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerWindow > 800 && result.pricePerWindow < 4500);
});

test('a poured-wall stone-well job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.windowCount, 1);
  assert.ok(heavy.hoursWindow > cheap.hoursWindow);
  assert.ok(heavy.hoursCut > 0);
  assert.ok(heavy.hoursWell > cheap.hoursWell);
  assert.ok(heavy.hoursCover > 0);
  assert.ok(heavy.hoursDrain > 0);
  assert.ok(heavy.hoursHaul > 0);
  assert.ok(heavy.hoursFinish > 0);
  assert.ok(heavy.wellMaterial > cheap.wellMaterial);
  assert.ok(heavy.coverMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerWindow * heavy.windowCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.windowCount > cheap.price / cheap.windowCount);
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

test('compareScope prices four cuts on the same opening', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const retrofit = rows.find((row) => row.scope === 'retrofit-existing');
  const wood = rows.find((row) => row.scope === 'new-cut-wood');
  const masonry = rows.find((row) => row.scope === 'new-cut-masonry');
  const poured = rows.find((row) => row.scope === 'new-cut-poured');
  assert.ok(wood.price > retrofit.price);
  assert.ok(masonry.price > wood.price);
  assert.ok(poured.price > masonry.price);
  assert.ok(poured.hoursCut > retrofit.hoursCut);
  assert.ok(poured.delta > 0);
});

test('compareWindow prices four sashes on the same opening', () => {
  const rows = compareWindow(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const hopper = rows.find((row) => row.window === 'vinyl-hopper');
  const slider = rows.find((row) => row.window === 'vinyl-slider');
  const casement = rows.find((row) => row.window === 'vinyl-casement');
  const fiber = rows.find((row) => row.window === 'fiberglass');
  assert.ok(hopper);
  assert.ok(slider.price > hopper.price);
  assert.ok(casement.price > hopper.price);
  assert.ok(fiber.price > hopper.price);
  assert.ok(slider.upgradeFromHopper > 0);
  assert.equal(hopper.upgradeFromHopper, 0);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'nope' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), window: 'nope' }), /Unknown window/);
  assert.throws(() => calculateBid({ ...special(), well: 'nope' }), /Unknown well/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('nope'), /Unknown scope/);
  assert.throws(() => suggestedWindowKit('nope'), /Unknown window/);
  assert.throws(() => suggestedWellKit('nope'), /Unknown well/);
});

test('job presets cover the cheap special and the losing poured cut', () => {
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'retrofit-existing' && job.window === 'vinyl-hopper'));
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'new-cut-poured' && job.well === 'stone'));
  assert.ok(JOB_PRESETS.some((job) => job.windowCount === 2));
});

test('formatBidSummary is a customer-facing draft without wages', () => {
  const text = formatBidSummary(calculateBid(losingJob()), 'Losing poured cut');
  assert.match(text, /EGRESS WINDOW INSTALL BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /Losing poured cut/);
  assert.match(text, /casement/i);
  assert.match(text, /poured/i);
  assert.doesNotMatch(text, /hourly wage/i);
  assert.doesNotMatch(text, /\$42/);
});

test('flag helpers accept common form values', () => {
  const on = calculateBid({ ...special(), includeCover: '1' });
  const off = calculateBid({ ...special(), includeCover: '0' });
  assert.ok(on.hoursCover > 0);
  assert.equal(off.hoursCover, 0);
});

test('compareOwnerSupply zeros sash and well invoices and keeps the cut hours', () => {
  const rows = compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: null });
  assert.equal(rows.length, 3);
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(contractor.windowMaterial > 0);
  assert.ok(contractor.wellMaterial > 0);
  assert.equal(fits.windowMaterial, 0);
  assert.equal(fits.wellMaterial, 0);
  assert.equal(wrong.windowMaterial, 0);
  assert.equal(wrong.wellMaterial, 0);
  assert.ok(Math.abs(fits.hoursCut - contractor.hoursCut) < 1e-9);
  assert.ok(Math.abs(fits.totalHours - contractor.totalHours) < 1e-9);
  assert.ok(wrong.totalHours > fits.totalHours);
  assert.ok(wrong.hoursTravel > contractor.hoursTravel);
  assert.ok(wrong.softCost > contractor.softCost);
  assert.ok(fits.price < contractor.price);
  assert.ok(wrong.price > fits.price);
  assert.ok(fits.cheapest);
  assert.equal(contractor.savedVsContractor, 0);
  assert.ok(fits.savedVsContractor > 0);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: null })
    .find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...typicalLegalBedroom(),
    windowInvoice: 4000,
    wellInvoice: 2800,
  }, { installOnlyPrice: null });
  const contractor = overridden.find((row) => row.supply === 'contractor-supplied');
  const fits = overridden.find((row) => row.supply === 'owner-fits');
  assert.ok(contractor.windowMaterial > 1000);
  assert.equal(fits.windowMaterial, 0);
  assert.equal(fits.wellMaterial, 0);
  assert.ok(Math.abs(fits.price - baseline.price) < 1e-9);
});

test('a $1,800 just-set special still loses on a masonry legal bedroom even when they bought the kit', () => {
  const rows = compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: 1800 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(contractor.installOnly.profit < fits.installOnly.profit);
  assert.ok(fits.installOnly.profit < 0);
  const note = ownerSupplyNote(rows);
  assert.match(note, /lose money even when they bought the sash and well/i);
  assert.match(note, /Walk-away on the owner-supplied set/i);
});

test('an install-only number can cover the set but not the contractor-supplied kit', () => {
  const contractorBid = calculateBid(typicalLegalBedroom());
  const ownerBid = calculateBid({
    ...typicalLegalBedroom(),
    windowInvoice: 0,
    wellInvoice: 0,
  });
  const between = (contractorBid.totalCost + ownerBid.totalCost) / 2;
  const rows = compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: between });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, false);
  assert.match(ownerSupplyNote(rows), /covers the set if their kit actually fits/i);
});

test('proposed price on the bid is the default install-only number', () => {
  const rows = compareOwnerSupply({ ...typicalLegalBedroom(), proposedPrice: 1800 });
  assert.equal(rows[0].installOnlyPrice, 1800);
  assert.equal(rows[0].installOnly.price, 1800);
});

test('the $1,800 Facebook special is the default install-only number', () => {
  const rows = compareOwnerSupply(typicalLegalBedroom());
  assert.equal(rows[0].installOnlyPrice, 1800);
});

test('ownerSupplyNote names the bid drop when install-only scoring is skipped', () => {
  const note = ownerSupplyNote(compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: null }));
  assert.match(note, /Zeroing the sash and well invoices drops the bid/i);
  assert.match(note, /wrong-size callback/i);
});

test('ownerSupplyNote rejects a short row list', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'contractor-supplied' }]), /missing rows/);
});

test('typical masonry legal bedroom numbers stay the ones the SEO article cites', () => {
  const rows = compareOwnerSupply(typicalLegalBedroom(), { installOnlyPrice: 1800 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(Math.abs(contractor.price - 3976.62) < 0.02);
  assert.ok(Math.abs(fits.price - 2539.12) < 0.02);
  assert.ok(Math.abs(fits.breakEvenPrice - 2031.30) < 0.02);
  assert.ok(Math.abs(wrong.price - 3569.17) < 0.02);
  assert.ok(Math.abs(fits.installOnly.profit + 231.30) < 0.02);
});

test('the owner-callback kit is a second trip plus a legal slider', () => {
  const kit = suggestedOwnerCallbackKit();
  const extra = suggestedExtraKit();
  const slider = suggestedWindowKit('vinyl-slider');
  assert.equal(kit.hoursCallbackTrip, extra.hoursTrip);
  assert.equal(kit.hoursWrongSizeEach, slider.hoursWindowEach);
  assert.equal(kit.replacementSashEach, slider.windowInvoice);
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const kit = suggestedAccessKit();
  const rows = compareAccess(typicalLegalBedroom());
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(rows.length, 3);
  assert.equal(ACCESS_PRESETS[1].id, 'occupied-weekday');
  assert.equal(ACCESS_PRESETS[2].id, 'after-hours');
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.ok(Math.abs(occupied.hoursWindow - weekday.hoursWindow * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.hoursCut - weekday.hoursCut * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.siteHours - weekday.siteHours * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.loadedWage - weekday.loadedWage) < 1e-9);
  assert.ok(occupied.totalHours > weekday.totalHours);
  assert.ok(occupied.price > weekday.price);
  assert.ok(Math.abs(afterHours.loadedWage - weekday.loadedWage * 1.5) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursTravel - weekday.hoursTravel - kit.afterHoursExtraTripHours) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursWindow - weekday.hoursWindow) < 1e-9);
  assert.ok(afterHours.price > occupied.price);
  assert.ok(Math.abs(weekday.price - 3976.62) < 1e-2);
  assert.ok(Math.abs(occupied.price - 4163.03) < 1e-2);
  assert.ok(Math.abs(afterHours.price - 4990.68) < 1e-2);
});

test('compareAccess does not leak a typed trip into the extra overnight plate', () => {
  const baseline = compareAccess(typicalLegalBedroom());
  const overridden = compareAccess({ ...typicalLegalBedroom(), hoursTrip: 9 });
  const weekday = overridden.find((row) => row.access === 'weekday-scheduled');
  const afterHours = overridden.find((row) => row.access === 'after-hours');
  const baselineAfter = baseline.find((row) => row.access === 'after-hours');
  const baselineWeekday = baseline.find((row) => row.access === 'weekday-scheduled');
  assert.ok(Math.abs((afterHours.hoursTravel - weekday.hoursTravel) - (baselineAfter.hoursTravel - baselineWeekday.hoursTravel)) < 1e-9);
});

test('a $3,500 Saturday special covers a weekday legal bedroom and loses after-hours', () => {
  const rows = compareAccess(typicalLegalBedroom(), { installOnlyPrice: 3500 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, false);
  assert.equal(occupied.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 3992.54) < 1e-2);
  assert.match(accessNote(rows), /empty-weekday set covers/i);
  assert.match(accessNote(rows), /\$492\.54/);
  assert.match(accessNote(rows), /\$3,992\.54/);
});

test('the $1,800 Saturday special on a poured stone well loses even on a weekday', () => {
  const rows = compareAccess(losingJob(), { installOnlyPrice: 1800 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.equal(occupied.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(weekday.price - 7494.94) < 1e-2);
  assert.ok(Math.abs(afterHours.price - 9045.85) < 1e-2);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 7236.68) < 1e-2);
  assert.match(accessNote(rows), /lose money even on an empty weekday/i);
  assert.match(accessNote(rows), /\$1,800/);
  assert.match(accessNote(rows), /\$7,236\.68/);
});

test('accessNote names the bid lift when no Saturday number is on the table', () => {
  const note = accessNote(compareAccess(typicalLegalBedroom()));
  assert.match(note, /They-stay-in-the-basement adds \$186\.41/);
  assert.match(note, /After-hours \/ Saturday adds \$1,014\.06/);
});

test('accessNote rejects a missing comparison', () => {
  assert.throws(() => accessNote(null), /missing rows/);
  assert.throws(() => accessNote([{ access: 'weekday-scheduled' }]), /missing rows/);
});

test('the access kit is time-and-a-half plus the extra-kit trip', () => {
  const kit = suggestedAccessKit();
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
});
