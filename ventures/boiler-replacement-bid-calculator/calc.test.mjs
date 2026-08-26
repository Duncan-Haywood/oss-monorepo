import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareRepairVsReplace,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  formatBidSummary,
  priceRepairVisit,
  repairVsReplaceNote,
  travelHours,
  suggestedScopeKit,
  suggestedSystemKit,
  suggestedFuelKit,
  suggestedExtraKit,
  suggestedRepairKit,
  suggestedOwnerCallbackKit,
  suggestedAccessKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('like-for-like'),
    ...suggestedSystemKit('hot-water'),
    ...suggestedFuelKit('gas'),
    ...suggestedExtraKit(),
  };
  return {
    inputMbh: 80,
    zones: 2,
    flueHeight: 18,
    scope: 'like-for-like',
    system: 'hot-water',
    fuel: 'gas',
    travelMiles: 10,
    includeIndirect: false,
    includeLiner: false,
    includeOilToGas: false,
    includePrimarySecondary: false,
    hourlyWage: 48,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('steam-to-hw'),
    ...suggestedSystemKit('steam'),
    ...suggestedFuelKit('oil'),
    ...suggestedExtraKit(),
  };
  return {
    inputMbh: 140,
    zones: 4,
    flueHeight: 30,
    scope: 'steam-to-hw',
    system: 'steam',
    fuel: 'oil',
    travelMiles: 22,
    includeIndirect: true,
    includeLiner: true,
    includeOilToGas: true,
    includePrimarySecondary: true,
    hourlyWage: 48,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 180,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 10, 0.035) - (1.4 + 0.35)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.035), /must be a number/);
});

test('the cheap special is a gas hot-water like-for-like, not a steam conversion', () => {
  const result = calculateBid(special());
  assert.equal(result.inputMbh, 80);
  assert.equal(result.hoursConversion, 0);
  assert.equal(result.hoursIndirect, 0);
  assert.equal(result.hoursLiner, 0);
  assert.equal(result.hoursOilToGas, 0);
  assert.equal(result.hoursPrimarySecondary, 0);
  assert.equal(result.indirectMaterial, 0);
  assert.equal(result.linerMaterial, 0);
  assert.equal(result.oilToGasMaterial, 0);
  assert.ok(result.hoursPlant > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursZones > 0);
  assert.ok(result.shares.plant + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerMbh > 40 && result.pricePerMbh < 180);
});

test('a steam conversion is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.inputMbh, 140);
  assert.ok(heavy.hoursPlant > cheap.hoursPlant);
  assert.ok(heavy.hoursConversion > 0);
  assert.ok(heavy.hoursIndirect > 0);
  assert.ok(heavy.hoursLiner > 0);
  assert.ok(heavy.hoursOilToGas > 0);
  assert.ok(heavy.indirectMaterial > 0);
  assert.ok(heavy.linerMaterial > 0);
  assert.ok(heavy.oilToGasMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerMbh * heavy.inputMbh,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.inputMbh > cheap.price / cheap.inputMbh);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 48 * 1.32);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices three scopes on the same plant', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const swap = rows.find((row) => row.scope === 'like-for-like');
  const condensing = rows.find((row) => row.scope === 'condensing-upgrade');
  const convert = rows.find((row) => row.scope === 'steam-to-hw');
  assert.ok(condensing.price > swap.price);
  assert.ok(convert.price > swap.price);
  assert.ok(convert.hoursConversion > swap.hoursConversion);
  assert.ok(condensing.hoursVent > swap.hoursVent);
  assert.ok(convert.delta > 0);
});

test('travel miles add hours and invoice without changing the plant', () => {
  const near = calculateBid({ ...special(), travelMiles: 10 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursPlant, near.hoursPlant);
  assert.equal(far.inputMbh, near.inputMbh);
});

test('more zones and a larger boiler buy more labor than the cheap special', () => {
  const twoZone = calculateBid(special());
  const fourZone = calculateBid({ ...special(), zones: 4, inputMbh: 140 });
  assert.ok(fourZone.hoursZones > twoZone.hoursZones);
  assert.ok(fourZone.zoneMaterial > twoZone.zoneMaterial);
  assert.ok(fourZone.hoursSize > twoZone.hoursSize);
  assert.ok(fourZone.boilerMaterial > twoZone.boilerMaterial);
});

test('unknown scope, system, fuel, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'furnace-swap' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), system: 'forced-air' }), /Unknown system/);
  assert.throws(() => calculateBid({ ...special(), fuel: 'electric' }), /Unknown fuel/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('furnace-swap'), /Unknown scope/);
  assert.throws(() => suggestedSystemKit('forced-air'), /Unknown system/);
  assert.throws(() => suggestedFuelKit('electric'), /Unknown fuel/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedSystemKit(preset.system),
      ...suggestedFuelKit(preset.fuel),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 48,
      burdenRate: 32,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 95,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.inputMbh > 0, preset.label);
  }
});

test('a $280 circulator special loses on this visit under starting repair rates', () => {
  const kit = suggestedRepairKit();
  const comparison = compareRepairVsReplace(special(), { patchPrice: kit.patchPrice });
  assert.equal(kit.patchPrice, 280);
  assert.ok(comparison.thisVisit.price > 280);
  assert.equal(comparison.rows[0].patchOnly.belowBreakEven, true);
  assert.ok(comparison.rows[0].patchOnly.profit < 0);
  assert.equal(comparison.extraCallsThisWinter, 2);
  assert.equal(comparison.remainingWinters, 3);
  assert.ok(comparison.thisWinterPrice > comparison.thisVisit.price);
  assert.ok(comparison.horizonPrice > comparison.thisWinterPrice);
  assert.ok(comparison.replace.price > comparison.thisVisit.price);
});

test('repair visits omit the replacement van pack and punch-list hours', () => {
  const visit = priceRepairVisit({
    hoursLabor: 2.2,
    parts: 210,
    travelMiles: 10,
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    travelPerMile: 2.8,
    hourlyWage: 48,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
  });
  assert.ok(Math.abs(visit.totalHours - (1.4 + 0.35 + 2.2)) < 1e-9);
  assert.equal(visit.parts, 210);
  assert.ok(Math.abs(visit.profit / visit.price * 100 - 20) < 1e-9);
  assert.ok(visit.directCost < 48 * 1.32 * visit.totalHours + 210 + 28 + 95);
});

test('more winters of the same callback raise the patch horizon, not the plant bid', () => {
  const short = compareRepairVsReplace({ ...special(), remainingWinters: 1, extraCallsThisWinter: 2, callsPerLaterWinter: 3 });
  const long = compareRepairVsReplace({ ...special(), remainingWinters: 5, extraCallsThisWinter: 2, callsPerLaterWinter: 3 });
  assert.equal(short.laterWinterCount, 0);
  assert.equal(short.laterWinterPrice, 0);
  assert.ok(Math.abs(short.horizonPrice - short.thisWinterPrice) < 1e-9);
  assert.ok(long.horizonPrice > short.horizonPrice);
  assert.equal(long.replace.price, short.replace.price);
  assert.equal(long.thisVisit.price, short.thisVisit.price);
});

test('a cracked-section winter of patches can outrun replacement', () => {
  const comparison = compareRepairVsReplace({
    ...special(),
    hoursRepair: 4,
    repairParts: 890,
    extraCallsThisWinter: 3,
    hoursPerExtraCall: 3.2,
    partsPerExtraCall: 640,
    remainingWinters: 2,
    callsPerLaterWinter: 4,
  });
  assert.equal(comparison.patchStillCheaper, false);
  assert.ok(comparison.horizonPrice > comparison.replace.price);
  assert.ok(comparison.wintersUntilReplaceCatches <= comparison.remainingWinters);
  assert.match(repairVsReplaceNote(comparison), /more than replacing/i);
});

test('the $280 note names the visit loss before the horizon', () => {
  const comparison = compareRepairVsReplace(special(), { patchPrice: 280 });
  const note = repairVsReplaceNote(comparison);
  assert.match(note, /\$280/);
  assert.match(note, /loses/);
  assert.match(note, /walk-away/);
  if (comparison.patchStillCheaper) {
    assert.match(note, /undercut replacement/i);
  }
});

test('fractional winters or a 100% margin on a patch are rejected', () => {
  assert.throws(() => compareRepairVsReplace({ ...special(), remainingWinters: 1.5 }), /whole number/);
  assert.throws(() => compareRepairVsReplace({ ...special(), remainingWinters: 0 }), /at least 1/);
  assert.throws(() => compareRepairVsReplace({ ...special(), extraCallsThisWinter: 1.2 }), /whole number/);
  assert.throws(
    () => priceRepairVisit({
      hoursLabor: 2, parts: 100, travelMiles: 10, hoursTrip: 1, hoursPerMile: 0.03,
      travelPerMile: 2, hourlyWage: 48, burdenRate: 32, overheadRate: 15, targetMargin: 100,
    }),
    /less than 100/,
  );
  assert.throws(() => repairVsReplaceNote({ rows: [] }), /missing rows/);
});

test('the customer summary names the plant and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Gas hot-water swap');
  assert.match(text, /BOILER REPLACEMENT BID/);
  assert.match(text, /Gas hot-water swap/);
  assert.match(text, /Like-for-like/i);
  assert.match(text, /hot water/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a heat-loss calculation/i);
});

test('compareOwnerSupply zeros the plant invoice and keeps the hang hours', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const tech = rows.find((row) => row.supply === 'tech-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(tech.boilerMaterial > 0);
  assert.equal(fits.boilerMaterial, 0);
  assert.equal(wrong.boilerMaterial, 0);
  assert.equal(fits.hoursPlant, tech.hoursPlant);
  assert.ok(wrong.hoursPlant > tech.hoursPlant);
  assert.ok(wrong.hoursTravel > tech.hoursTravel);
  assert.ok(fits.price < tech.price);
  assert.ok(wrong.price > fits.price);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special()).find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...special(),
    plantInvoice: 8900,
    fuelInvoicePerMbh: 40,
    fuelHardware: 900,
  }).find((row) => row.supply === 'owner-fits');
  assert.equal(overridden.boilerMaterial, 0);
  assert.ok(Math.abs(overridden.price - baseline.price) < 1e-9);
});

test('a $4,500 hang-only special loses on a tech-supplied plant and can cover a matching crate', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 4500 });
  const tech = rows.find((row) => row.supply === 'tech-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(tech.installOnly.belowBreakEven, true);
  assert.ok(tech.installOnly.profit < 0);
  assert.equal(fits.installOnly.belowBreakEven, false);
  assert.ok(fits.breakEvenPrice > 0);
  assert.match(ownerSupplyNote(rows), /\$4,500/);
  assert.match(ownerSupplyNote(rows), /covers the set if their unit actually matches/i);
});

test('ownerSupplyNote names the bid drop when no hang-only price is set', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the boiler invoice drops the bid/);
  assert.match(note, /wrong-unit callback/);
});

test('ownerSupplyNote names a hang-only that covers only when the unit matches', () => {
  const rows = compareOwnerSupply(special());
  const tech = rows.find((row) => row.supply === 'tech-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const between = (fits.breakEvenPrice + tech.breakEvenPrice) / 2;
  const scored = compareOwnerSupply(special(), { installOnlyPrice: between });
  assert.equal(scored.find((row) => row.supply === 'tech-supplied').installOnly.belowBreakEven, true);
  assert.equal(scored.find((row) => row.supply === 'owner-fits').installOnly.belowBreakEven, false);
  assert.match(ownerSupplyNote(scored), /covers the set if their unit actually matches/i);
});

test('ownerSupplyNote rejects a short or incomplete table', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'tech-supplied' }]), /missing rows/);
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const kit = suggestedAccessKit();
  const rows = compareAccess(special());
  assert.equal(rows.length, 3);
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-no-heat');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.ok(Math.abs(occupied.hoursPlant - weekday.hoursPlant * 1.2) < 1e-9);
  assert.ok(Math.abs(occupied.siteHours - weekday.siteHours * 1.2) < 1e-9);
  assert.ok(Math.abs(occupied.loadedWage - weekday.loadedWage) < 1e-9);
  assert.ok(occupied.totalHours > weekday.totalHours);
  assert.ok(occupied.price > weekday.price);
  assert.ok(Math.abs(afterHours.loadedWage - weekday.loadedWage * 1.5) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursTravel - weekday.hoursTravel - kit.afterHoursExtraTripHours) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursPlant - weekday.hoursPlant) < 1e-9);
  assert.ok(afterHours.price > occupied.price);
  assert.equal(weekday.cheapest, true);
  assert.equal(weekday.installOnly, null);
  assert.ok(Math.abs(weekday.price - 6740.9803) < 1e-4);
  assert.ok(Math.abs(occupied.price - 6899.4595) < 1e-4);
  assert.ok(Math.abs(afterHours.price - 7634.0197) < 1e-4);
});

test('compareAccess does not leak a typed trip into the extra emergency dispatch', () => {
  const baseline = compareAccess(special());
  const overridden = compareAccess({ ...special(), hoursTrip: 16 });
  const weekday = overridden.find((row) => row.access === 'weekday-scheduled');
  const afterHours = overridden.find((row) => row.access === 'after-hours');
  const baselineAfter = baseline.find((row) => row.access === 'after-hours');
  const baselineWeekday = baseline.find((row) => row.access === 'weekday-scheduled');
  assert.ok(weekday.hoursTravel > baselineWeekday.hoursTravel);
  assert.ok(Math.abs(
    (afterHours.hoursTravel - weekday.hoursTravel)
    - (baselineAfter.hoursTravel - baselineWeekday.hoursTravel),
  ) < 1e-9);
});

test('a $5,800 Saturday special covers a weekday hang and loses after-hours', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 5800 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-no-heat');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, false);
  assert.equal(occupied.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.installOnly.profit + 307.2158) < 1e-4);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 6107.2158) < 1e-4);
  assert.match(accessNote(rows), /\$5,800/);
  assert.match(accessNote(rows), /weekday set covers/i);
  assert.match(accessNote(rows), /loses/);
});

test('a $4,500 Saturday special loses even on a weekday slot', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 4500 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.match(accessNote(rows), /lose money even on a weekday/i);
  assert.match(accessNote(rows), /Walk-away after-hours/);
});

test('accessNote names the bid lift when no Saturday price is set', () => {
  const note = accessNote(compareAccess(special()));
  assert.match(note, /Same-day with no heat adds/);
  assert.match(note, /After-hours \/ Saturday adds/);
});

test('a steam conversion Saturday special loses even more', () => {
  const rows = compareAccess(losingJob(), { installOnlyPrice: 4500 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.ok(weekday.price > 19000);
  assert.ok(afterHours.price > weekday.price);
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 17598.967) < 1e-3);
  assert.match(accessNote(rows), /lose money even on a weekday/i);
});

test('accessNote rejects a short or incomplete table', () => {
  assert.throws(() => accessNote([]), /missing rows/);
  assert.throws(() => accessNote([{ access: 'weekday-scheduled' }]), /missing rows/);
});

test('the access kit is overtime and a second trip, not a second plant invoice', () => {
  const kit = suggestedAccessKit();
  const extra = suggestedExtraKit();
  assert.equal(kit.afterHoursExtraTripHours, extra.hoursTrip);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.occupiedPaceMultiplier, 1.2);
});

test('the owner-callback kit is a second trip, not a second plant invoice', () => {
  const kit = suggestedOwnerCallbackKit();
  const extra = suggestedExtraKit();
  assert.equal(kit.hoursCallbackTrip, extra.hoursTrip);
  assert.ok(kit.hoursWrongPlant > 0);
  assert.ok(kit.wrongPlantHardware > 0);
});
