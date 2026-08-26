import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareRepairVsReplace,
  formatBidSummary,
  priceRepairVisit,
  repairVsReplaceNote,
  travelHours,
  suggestedScopeKit,
  suggestedSystemKit,
  suggestedFuelKit,
  suggestedExtraKit,
  suggestedRepairKit,
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
