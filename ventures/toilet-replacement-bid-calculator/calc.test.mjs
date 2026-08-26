import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareToilet,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  suggestedAccessKit,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedToiletKit,
  suggestedRoughInKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('swap-only'),
    ...suggestedToiletKit('two-piece-standard'),
    ...suggestedRoughInKit('12-inch'),
    ...suggestedExtraKit(),
  };
  return {
    toiletCount: 1,
    scope: 'swap-only',
    toilet: 'two-piece-standard',
    roughIn: '12-inch',
    travelMiles: 6,
    includeHaul: false,
    includeWaxFree: false,
    includeBidetSeat: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 45,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('flange-repair'),
    ...suggestedToiletKit('one-piece'),
    ...suggestedRoughInKit('10-inch'),
    ...suggestedExtraKit(),
  };
  return {
    toiletCount: 1,
    scope: 'flange-repair',
    toilet: 'one-piece',
    roughIn: '10-inch',
    travelMiles: 18,
    includeHaul: true,
    includeWaxFree: true,
    includeBidetSeat: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 85,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(0.9, 6, 0.035) - (0.9 + 0.21)) < 1e-9);
  assert.throws(() => travelHours('x', 6, 0.035), /must be a number/);
});

test('the cheap special is a two-piece 12-inch swap, not a flange repair', () => {
  const result = calculateBid(special());
  assert.equal(result.toiletCount, 1);
  assert.equal(result.hoursFlange, 0);
  assert.equal(result.hoursRoughIn, 0);
  assert.equal(result.hoursHaul, 0);
  assert.equal(result.hoursBidet, 0);
  assert.equal(result.hoursWaxFree, 0);
  assert.equal(result.flangeMaterial, 0);
  assert.equal(result.offsetMaterial, 0);
  assert.equal(result.haulMaterial, 0);
  assert.equal(result.bidetMaterial, 0);
  assert.ok(result.hoursSwap > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursSupply > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerToilet > 180 && result.pricePerToilet < 650);
});

test('a flange-repair one-piece on a 10-inch rough-in is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.toiletCount, 1);
  assert.ok(heavy.hoursSwap > 0);
  assert.ok(heavy.hoursFlange > 0);
  assert.ok(heavy.hoursRoughIn > 0);
  assert.ok(heavy.hoursHaul > 0);
  assert.ok(heavy.hoursBidet > 0);
  assert.ok(heavy.hoursType > cheap.hoursType);
  assert.ok(heavy.flangeMaterial > 0);
  assert.ok(heavy.offsetMaterial > 0);
  assert.ok(heavy.haulMaterial > 0);
  assert.ok(heavy.bidetMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerToilet * heavy.toiletCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.toiletCount > cheap.price / cheap.toiletCount);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices four scopes on the same closet', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const swap = rows.find((row) => row.scope === 'swap-only');
  const supply = rows.find((row) => row.scope === 'new-supply');
  const flange = rows.find((row) => row.scope === 'flange-repair');
  const reset = rows.find((row) => row.scope === 'full-reset');
  assert.ok(supply.price > swap.price);
  assert.ok(flange.price > swap.price);
  assert.ok(reset.price > swap.price);
  assert.ok(flange.hoursFlange > swap.hoursFlange);
  assert.ok(reset.flangeMaterial > swap.flangeMaterial);
  assert.ok(supply.supplyMaterial > swap.supplyMaterial);
  assert.ok(flange.delta > 0);
});

test('compareToilet prices four bowls on the same closet', () => {
  const rows = compareToilet(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const twoPiece = rows.find((row) => row.toilet === 'two-piece-standard');
  const comfort = rows.find((row) => row.toilet === 'comfort-height');
  const onePiece = rows.find((row) => row.toilet === 'one-piece');
  const bidet = rows.find((row) => row.toilet === 'bidet-combo');
  assert.ok(twoPiece);
  assert.ok(comfort.price > twoPiece.price);
  assert.ok(onePiece.price > twoPiece.price);
  assert.ok(bidet.price > twoPiece.price);
  assert.ok(onePiece.hoursType > twoPiece.hoursType);
  assert.ok(bidet.fixtureMaterial > twoPiece.fixtureMaterial);
  assert.ok(comfort.upgradeFromTwoPiece > 0);
  assert.equal(twoPiece.upgradeFromTwoPiece, 0);
  assert.ok(twoPiece.cheapest);
  assert.ok(comfort.delta > 0);
});

test('compareToilet keeps the current scope and does not reuse a typed toilet rate', () => {
  const flangeRows = compareToilet(losingJob());
  const cheapRows = compareToilet(special());
  const flangeTwo = flangeRows.find((row) => row.toilet === 'two-piece-standard');
  const cheapTwo = cheapRows.find((row) => row.toilet === 'two-piece-standard');
  assert.ok(flangeTwo.price > cheapTwo.price);
  const overridden = compareToilet({
    ...special(),
    hoursTypePerToilet: 9,
    toiletInvoice: 4000,
  });
  const twoPiece = overridden.find((row) => row.toilet === 'two-piece-standard');
  const baseline = compareToilet(special()).find((row) => row.toilet === 'two-piece-standard');
  assert.ok(Math.abs(twoPiece.price - baseline.price) < 1e-9);
});

test('travel miles add hours and invoice without changing the closet', () => {
  const near = calculateBid({ ...special(), travelMiles: 6 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursSwap, near.hoursSwap);
  assert.equal(far.toiletCount, near.toiletCount);
});

test('a second toilet on the same trip scales the closet, not the drive', () => {
  const one = calculateBid(special());
  const two = calculateBid({ ...special(), toiletCount: 2 });
  assert.equal(two.hoursTravel, one.hoursTravel);
  assert.ok(Math.abs(two.hoursSwap - one.hoursSwap * 2) < 1e-9);
  assert.ok(Math.abs(two.fixtureMaterial - one.fixtureMaterial * 2) < 1e-9);
  assert.ok(two.price > one.price);
  assert.ok(two.price < one.price * 2);
});

test('wax-free replaces the wax ring instead of stacking both seals', () => {
  const wax = calculateBid(special());
  const waxFree = calculateBid({ ...special(), includeWaxFree: true });
  assert.ok(wax.waxMaterial > 0);
  assert.equal(wax.waxFreeMaterial, 0);
  assert.equal(waxFree.waxMaterial, 0);
  assert.ok(waxFree.waxFreeMaterial > 0);
  assert.ok(waxFree.hoursWaxFree > 0);
});

test('unknown scope, toilet, rough-in, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'walk-in-shower' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), toilet: 'wall-hung-carrier' }), /Unknown toilet/);
  assert.throws(() => calculateBid({ ...special(), roughIn: '16-inch' }), /Unknown rough-in/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('walk-in-shower'), /Unknown scope/);
  assert.throws(() => suggestedToiletKit('wall-hung-carrier'), /Unknown toilet/);
  assert.throws(() => suggestedRoughInKit('16-inch'), /Unknown rough-in/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedToiletKit(preset.toilet),
      ...suggestedRoughInKit(preset.roughIn),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 45,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.toiletCount > 0, preset.label);
  }
});

test('compareOwnerSupply zeros the bowl invoice and keeps the set hours', () => {
  const rows = compareOwnerSupply(special());
  assert.equal(rows.length, 3);
  const plumber = rows.find((row) => row.supply === 'plumber-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.ok(plumber.fixtureMaterial > 0);
  assert.equal(fits.fixtureMaterial, 0);
  assert.equal(wrong.fixtureMaterial, 0);
  assert.ok(Math.abs(fits.totalHours - plumber.totalHours) < 1e-9);
  assert.ok(wrong.totalHours > fits.totalHours);
  assert.ok(wrong.hoursTravel > plumber.hoursTravel);
  assert.ok(wrong.offsetMaterial > plumber.offsetMaterial);
  assert.ok(fits.price < plumber.price);
  assert.ok(wrong.price > fits.price);
  assert.ok(fits.cheapest);
  assert.equal(plumber.savedVsPlumber, 0);
  assert.ok(fits.savedVsPlumber > 0);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special()).find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...special(),
    toiletInvoice: 4000,
  });
  const plumber = overridden.find((row) => row.supply === 'plumber-supplied');
  const fits = overridden.find((row) => row.supply === 'owner-fits');
  assert.ok(plumber.fixtureMaterial > 1000);
  assert.equal(fits.fixtureMaterial, 0);
  assert.ok(Math.abs(fits.price - baseline.price) < 1e-9);
});

test('a $249 install-only special still loses when they bought a two-piece that fits', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 249 });
  const plumber = rows.find((row) => row.supply === 'plumber-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(plumber.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(plumber.installOnly.profit < fits.installOnly.profit);
  assert.ok(fits.installOnly.profit < 0);
  const note = ownerSupplyNote(rows);
  assert.match(note, /lose money even when they bought the bowl/i);
  assert.match(note, /Walk-away on the owner-supplied set/i);
});

test('an install-only number can cover the set but not the plumber-supplied bowl', () => {
  const plumberBid = calculateBid(special());
  const ownerBid = calculateBid({ ...special(), toiletInvoice: 0 });
  const between = (plumberBid.totalCost + ownerBid.totalCost) / 2;
  const rows = compareOwnerSupply(special(), { installOnlyPrice: between });
  const plumber = rows.find((row) => row.supply === 'plumber-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(plumber.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, false);
  assert.match(ownerSupplyNote(rows), /covers the set if their bowl actually fits/i);
});

test('proposed price on the bid is the default install-only number', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 249 });
  assert.equal(rows[0].installOnlyPrice, 249);
  assert.equal(rows[0].installOnly.price, 249);
});

test('ownerSupplyNote names the bid drop when no install-only price is set', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the bowl invoice drops the bid/i);
  assert.match(note, /wrong-rough-in callback/i);
});

test('ownerSupplyNote rejects a short row list', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'plumber-supplied' }]), /missing rows/);
});

test('compareAccess keeps weekday hours and raises after-hours wage plus a second trip', () => {
  const kit = suggestedAccessKit();
  const rows = compareAccess(special());
  assert.equal(rows.length, 3);
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-occupied');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.ok(Math.abs(occupied.hoursSwap - weekday.hoursSwap * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.siteHours - weekday.siteHours * 1.25) < 1e-9);
  assert.ok(Math.abs(occupied.loadedWage - weekday.loadedWage) < 1e-9);
  assert.ok(occupied.totalHours > weekday.totalHours);
  assert.ok(occupied.price > weekday.price);
  assert.ok(Math.abs(afterHours.loadedWage - weekday.loadedWage * 1.5) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursTravel - weekday.hoursTravel - kit.afterHoursExtraTripHours) < 1e-9);
  assert.ok(Math.abs(afterHours.hoursSwap - weekday.hoursSwap) < 1e-9);
  assert.ok(afterHours.price > occupied.price);
  assert.equal(weekday.cheapest, true);
  assert.equal(weekday.installOnly, null);
  assert.ok(Math.abs(weekday.price - 565.6505) < 1e-4);
  assert.ok(Math.abs(occupied.price - 595.0833125) < 1e-4);
  assert.ok(Math.abs(afterHours.price - 779.921375) < 1e-4);
});

test('compareAccess does not leak a typed trip into the extra emergency dispatch', () => {
  const baseline = compareAccess(special());
  const overridden = compareAccess({ ...special(), hoursTrip: 9 });
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

test('a $499 Saturday special covers a weekday swap and loses after-hours', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 499 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-occupied');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, false);
  assert.equal(occupied.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 623.9371) < 1e-4);
  assert.match(accessNote(rows), /weekday set covers/i);
  assert.match(accessNote(rows), /\$124\.94/);
  assert.match(accessNote(rows), /\$623\.94/);
});

test('the $249 Saturday special on a one-piece flange repair loses even on a weekday', () => {
  const rows = compareAccess(losingJob(), { installOnlyPrice: 249 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-occupied');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.equal(occupied.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(Math.abs(weekday.price - 1937.114625) < 1e-4);
  assert.ok(Math.abs(afterHours.breakEvenPrice - 1830.04905) < 1e-4);
  assert.match(accessNote(rows), /lose money even on a weekday slot/i);
  assert.match(accessNote(rows), /\$249/);
  assert.match(accessNote(rows), /\$1,830\.05/);
});

test('accessNote names the bid lift when no Saturday number is on the table', () => {
  const note = accessNote(compareAccess(special()));
  assert.match(note, /Same-day while they stay home adds \$29\.43/i);
  assert.match(note, /After-hours \/ Saturday adds \$214\.27/);
});

test('accessNote rejects a missing comparison', () => {
  assert.throws(() => accessNote(null), /missing rows/);
  assert.throws(() => accessNote([{ access: 'weekday-scheduled' }]), /missing rows/);
});

test('suggestedAccessKit uses the extra-kit trip, not a typed set', () => {
  const kit = suggestedAccessKit();
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.occupiedPaceMultiplier, 1.25);
});

test('the customer summary names the closet and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Two-piece hall bath');
  assert.match(text, /TOILET REPLACEMENT BID/);
  assert.match(text, /Two-piece hall bath/);
  assert.match(text, /Swap only/i);
  assert.match(text, /two-piece/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a plumbing-code determination/i);
});
