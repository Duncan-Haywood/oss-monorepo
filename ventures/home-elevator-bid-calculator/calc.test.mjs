import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareDrive,
  compareHoistway,
  compareCab,
  cabNote,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  formatBidSummary,
  travelHours,
  suggestedDriveKit,
  suggestedHoistwayKit,
  suggestedCabKit,
  suggestedExtraKit,
  suggestedOwnerCallbackKit,
  suggestedAccessKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedDriveKit('pneumatic'),
    ...suggestedHoistwayKit('through-floor'),
    ...suggestedCabKit('acrylic'),
    ...suggestedExtraKit(),
  };
  return {
    stops: 2,
    travelFeet: 12,
    capacityLbs: 400,
    drive: 'pneumatic',
    hoistway: 'through-floor',
    cab: 'acrylic',
    travelMiles: 10,
    includePit: false,
    includeMachineRoom: false,
    includeAutoDoors: false,
    includeBattery: false,
    includeFeeder: false,
    includePermit: false,
    hourlyWage: 52,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 420,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedDriveKit('hydraulic'),
    ...suggestedHoistwayKit('new-wood'),
    ...suggestedCabKit('wood-panel'),
    ...suggestedExtraKit(),
  };
  return {
    stops: 3,
    travelFeet: 28,
    capacityLbs: 1000,
    drive: 'hydraulic',
    hoistway: 'new-wood',
    cab: 'wood-panel',
    travelMiles: 22,
    includePit: true,
    includeMachineRoom: true,
    includeAutoDoors: true,
    includeBattery: true,
    includeFeeder: true,
    includePermit: true,
    hourlyWage: 52,
    burdenRate: 32,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 980,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(3.2, 10, 0.04) - (3.2 + 0.4)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.04), /must be a number/);
});

test('the cheap special is two-stop pneumatic through-floor, not a hydraulic shaft', () => {
  const result = calculateBid(special());
  assert.equal(result.stops, 2);
  assert.equal(result.travelFeet, 12);
  assert.equal(result.hoursPit, 0);
  assert.equal(result.hoursMachineRoom, 0);
  assert.equal(result.hoursAutoDoors, 0);
  assert.equal(result.hoursBattery, 0);
  assert.equal(result.hoursFeeder, 0);
  assert.equal(result.hoursPermit, 0);
  assert.equal(result.pitMaterial, 0);
  assert.equal(result.feederMaterial, 0);
  assert.ok(result.hoursUnit > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursHoistway > 0);
  assert.ok(result.shares.fixture + result.shares.labor > result.shares.extra);
  assert.ok(result.price > 15000 && result.price < 45000);
  assert.ok(result.pricePerStop > 7000 && result.pricePerStop < 22000);
});

test('a three-stop hydraulic shaft job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.stops, 3);
  assert.ok(heavy.hoursUnit > cheap.hoursUnit);
  assert.ok(heavy.hoursHoistway > cheap.hoursHoistway);
  assert.ok(heavy.hoursPit > 0);
  assert.ok(heavy.hoursMachineRoom > 0);
  assert.ok(heavy.hoursFeeder > 0);
  assert.ok(heavy.hoursPermit > 0);
  assert.ok(heavy.pitMaterial > 0);
  assert.ok(heavy.feederMaterial > 0);
  assert.ok(heavy.permitMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.price,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price > cheap.price * 1.6);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 52 * 1.32);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 500 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), drive: 'dumbwaiter' }), /Unknown drive/);
  assert.throws(() => calculateBid({ ...special(), hoistway: 'chimney' }), /Unknown hoistway/);
  assert.throws(() => calculateBid({ ...special(), cab: 'gold' }), /Unknown cab/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...special(), stops: 'x' }), /must be a number/);
});

test('compareDrive ranks pneumatic cheapest on a through-floor house and names the hydraulic upgrade', () => {
  const rows = compareDrive(special());
  assert.equal(rows.length, 4);
  assert.equal(rows[0].drive, 'pneumatic');
  assert.equal(rows[0].cheapest, true);
  const hydraulic = rows.find((row) => row.drive === 'hydraulic');
  assert.ok(hydraulic.upgradeFromPneumatic > 0);
  assert.ok(hydraulic.price > rows[0].price);
});

test('compareHoistway ranks reuse cheapest and names the wood-shaft upgrade over through-floor', () => {
  const rows = compareHoistway(special());
  assert.equal(rows.length, 5);
  assert.equal(rows[0].hoistway, 'existing-shaft');
  assert.equal(rows[0].cheapest, true);
  const through = rows.find((row) => row.hoistway === 'through-floor');
  const wood = rows.find((row) => row.hoistway === 'new-wood');
  assert.ok(through);
  assert.ok(wood.upgradeFromThroughFloor > 0);
  assert.ok(wood.price > through.price);
  assert.ok(wood.hoursHoistway > through.hoursHoistway);
});

test('compareCab ranks acrylic cheapest and names the glass upgrade over the tube', () => {
  const rows = compareCab(special());
  assert.equal(rows.length, 4);
  assert.equal(rows[0].cab, 'acrylic');
  assert.equal(rows[0].cheapest, true);
  const standard = rows.find((row) => row.cab === 'standard');
  const wood = rows.find((row) => row.cab === 'wood-panel');
  const glass = rows.find((row) => row.cab === 'glass-cab');
  assert.ok(standard.upgradeFromAcrylic > 0);
  assert.ok(wood.upgradeFromAcrylic > standard.upgradeFromAcrylic);
  assert.ok(glass.upgradeFromAcrylic > wood.upgradeFromAcrylic);
  assert.ok(glass.price > rows[0].price);
  assert.ok(glass.hoursCab > rows[0].hoursCab);
  assert.ok(glass.cabMaterial > rows[0].cabMaterial);
});

test('compareCab does not leak a typed cab invoice into the kit rows', () => {
  const baseline = compareCab(special()).find((row) => row.cab === 'glass-cab');
  const overridden = compareCab({
    ...special(),
    hoursCab: 99,
    cabInvoice: 99999,
  }).find((row) => row.cab === 'glass-cab');
  assert.ok(baseline);
  assert.ok(overridden);
  assert.equal(overridden.cabMaterial, baseline.cabMaterial);
  assert.equal(overridden.hoursCab, baseline.hoursCab);
  assert.ok(Math.abs(overridden.price - baseline.price) < 1e-9);
});

test('compareCab keeps drive and hoistway with the current job', () => {
  const cheap = compareCab(special()).find((row) => row.cab === 'acrylic');
  const hydraulic = compareCab(losingJob()).find((row) => row.cab === 'acrylic');
  assert.ok(cheap);
  assert.ok(hydraulic);
  assert.ok(hydraulic.price > cheap.price);
  assert.ok(hydraulic.totalHours > cheap.totalHours);
});

test('cabNote names the glass add-on over acrylic', () => {
  const note = cabNote(compareCab(special()));
  assert.match(note, /acrylic tube is the cheap-special cab/i);
  assert.match(note, /glass adds/i);
  assert.match(note, /losing bid/i);
});

test('cabNote rejects a short row list', () => {
  assert.throws(() => cabNote([]), /missing rows/);
  assert.throws(() => cabNote([{ cab: 'acrylic' }]), /missing rows/);
});

test('job presets cover the cheap special and the losing hydraulic shaft', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  assert.equal(JOB_PRESETS[0].drive, 'pneumatic');
  assert.equal(JOB_PRESETS[0].hoistway, 'through-floor');
  assert.equal(JOB_PRESETS[2].drive, 'hydraulic');
  assert.equal(JOB_PRESETS[2].stops, 3);
  assert.equal(JOB_PRESETS[2].includePit, true);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Cheap special');
  assert.match(text, /HOME ELEVATOR BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /2 stops/);
  assert.match(text, /Pneumatic vacuum/);
  assert.match(text, /not an elevator specification/);
  assert.doesNotMatch(text, /52/);
  assert.doesNotMatch(text, /hourly wage/i);
});

test('compareOwnerSupply zeros the unit invoice and keeps the set hours', () => {
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
  assert.equal(fits.hoursUnit, contractor.hoursUnit);
  assert.ok(wrong.totalHours > fits.totalHours);
  assert.ok(wrong.price > fits.price);
  assert.ok(wrong.cabMaterial > fits.cabMaterial);
  assert.ok(wrong.hoursTravel > fits.hoursTravel);
  assert.ok(wrong.hoursCab > fits.hoursCab);
});

test('compareOwnerSupply does not leak a typed invoice into the owner-supplied rows', () => {
  const baseline = compareOwnerSupply(special()).find((row) => row.supply === 'owner-fits');
  const overridden = compareOwnerSupply({
    ...special(),
    unitInvoice: 99999,
  }).find((row) => row.supply === 'owner-fits');
  assert.ok(baseline);
  assert.ok(overridden);
  assert.equal(overridden.fixtureMaterial, baseline.fixtureMaterial);
  assert.ok(Math.abs(overridden.price - baseline.price) < 1e-9);
});

test('compareOwnerSupply scores a $6,995 install-only special against each cost base', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 6995 });
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  assert.equal(contractor.installOnly.belowBreakEven, true);
  assert.equal(fits.installOnly.belowBreakEven, false);
  assert.equal(wrong.installOnly.belowBreakEven, true);
  assert.ok(fits.breakEvenPrice < 6995);
  assert.ok(wrong.breakEvenPrice > 6995);
  const note = ownerSupplyNote(rows);
  assert.match(note, /\$6,995\.00/);
  assert.match(note, /covers the set if their unit actually fits/i);
  assert.match(note, /wrong-opening callback still loses/i);
});

test('compareOwnerSupply scores a $4,995 install-only special as a loss even when they bought the unit', () => {
  const rows = compareOwnerSupply(special(), { installOnlyPrice: 4995 });
  const fits = rows.find((row) => row.supply === 'owner-fits');
  assert.equal(fits.installOnly.belowBreakEven, true);
  assert.ok(fits.breakEvenPrice > 4995);
  const note = ownerSupplyNote(rows);
  assert.match(note, /\$4,995\.00/);
  assert.match(note, /lose money even when they bought the unit/i);
  assert.match(note, /walk-away/i);
});

test('ownerSupplyNote names the bid drop when no install-only price is set', () => {
  const note = ownerSupplyNote(compareOwnerSupply(special()));
  assert.match(note, /Zeroing the unit invoice drops the bid/i);
  assert.match(note, /wrong-opening callback/i);
});

test('ownerSupplyNote names the path that covers when only the owner-supplied set holds', () => {
  const rows = compareOwnerSupply(special());
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const between = Math.round((fits.breakEvenPrice + contractor.breakEvenPrice) / 2);
  const scored = compareOwnerSupply(special(), { installOnlyPrice: between });
  assert.match(ownerSupplyNote(scored), /covers the set if their unit actually fits/i);
});

test('ownerSupplyNote uses proposedPrice when installOnlyPrice is omitted', () => {
  const rows = compareOwnerSupply({ ...special(), proposedPrice: 4995 });
  assert.equal(rows[0].installOnlyPrice, 4995);
  assert.match(ownerSupplyNote(rows), /\$4,995\.00/);
});

test('ownerSupplyNote rejects a short row list', () => {
  assert.throws(() => ownerSupplyNote([]), /missing rows/);
  assert.throws(() => ownerSupplyNote([{ supply: 'contractor-supplied' }]), /missing rows/);
});

test('suggestedOwnerCallbackKit is a second trip plus opening hardware', () => {
  const kit = suggestedOwnerCallbackKit();
  assert.equal(kit.hoursCallbackTrip, suggestedExtraKit().hoursTrip);
  assert.ok(kit.hoursWrongOpening > 0);
  assert.ok(kit.wrongOpeningInvoice > 0);
});

test('compareAccess adds expedite freight on discharge week and overtime plus a weekend inspector after hours', () => {
  const kit = suggestedAccessKit();
  assert.equal(kit.expediteFreight, 2450);
  assert.equal(kit.rushInspectionInvoice, 925);
  assert.equal(kit.afterHoursWageMultiplier, 1.5);
  assert.equal(kit.afterHoursExtraTripHours, suggestedExtraKit().hoursTrip);
  assert.ok(kit.occupiedPaceMultiplier > 1);

  const rows = compareAccess(special());
  assert.equal(rows.length, 3);
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const discharge = rows.find((row) => row.access === 'discharge-week');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.ok(weekday);
  assert.ok(discharge);
  assert.ok(afterHours);
  assert.equal(weekday.cheapest, true);
  assert.equal(weekday.expediteFreight, 0);
  assert.equal(weekday.rushInspection, 0);
  assert.equal(discharge.expediteFreight, 2450);
  assert.equal(discharge.rushInspection, 0);
  assert.equal(afterHours.expediteFreight, 2450);
  assert.equal(afterHours.rushInspection, 925);
  assert.ok(discharge.totalHours > weekday.totalHours);
  assert.ok(discharge.hoursUnit > weekday.hoursUnit);
  assert.ok(discharge.hoursHoistway > weekday.hoursHoistway);
  assert.ok(discharge.price > weekday.price);
  assert.ok(afterHours.loadedWage > weekday.loadedWage);
  assert.ok(afterHours.hoursTravel > weekday.hoursTravel);
  assert.ok(afterHours.price > discharge.price);
  assert.ok(afterHours.softCost > discharge.softCost);
});

test('compareAccess does not leak a typed other-cost into the weekday expedite line', () => {
  const baseline = compareAccess(special());
  const overridden = compareAccess({ ...special(), otherCost: 999 });
  const weekday = overridden.find((row) => row.access === 'weekday-scheduled');
  const discharge = overridden.find((row) => row.access === 'discharge-week');
  assert.equal(weekday.expediteFreight, 0);
  assert.equal(discharge.expediteFreight, 2450);
  assert.ok(discharge.softCost - weekday.softCost > 2400);
  assert.ok(overridden.find((row) => row.access === 'weekday-scheduled').price > baseline[0].price);
});

test('compareAccess scores an $18,995 Saturday special against each cost base', () => {
  const rows = compareAccess(special(), { installOnlyPrice: 18995 });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const discharge = rows.find((row) => row.access === 'discharge-week');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, true);
  assert.equal(discharge.installOnly.belowBreakEven, true);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.ok(weekday.breakEvenPrice > 18995);
  const note = accessNote(rows);
  assert.match(note, /\$18,995\.00/);
  assert.match(note, /lose money even on a weekday slot/i);
  assert.match(note, /walk-away after-hours/i);
});

test('compareAccess scores a $28,108 weekday bid that still loses after hours', () => {
  const weekdayBid = compareAccess(special()).find((row) => row.access === 'weekday-scheduled');
  const asked = Math.round(weekdayBid.price);
  const rows = compareAccess(special(), { installOnlyPrice: asked });
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(weekday.installOnly.belowBreakEven, false);
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  const note = accessNote(rows);
  assert.match(note, /weekday set covers/i);
  assert.match(note, /Saturday \/ discharge number loses/i);
});

test('accessNote names the bid lift when no proposed price is set', () => {
  const note = accessNote(compareAccess(special()));
  assert.match(note, /Discharge week while they stay home adds/i);
  assert.match(note, /After-hours \/ Saturday adds/i);
});

test('accessNote names discharge-week loss when Saturday still covers', () => {
  const rows = [
    {
      access: 'weekday-scheduled',
      price: 28000,
      breakEvenPrice: 22000,
      installOnly: { price: 26000, profit: 4000, belowBreakEven: false },
    },
    {
      access: 'discharge-week',
      price: 32000,
      breakEvenPrice: 27000,
      installOnly: { price: 26000, profit: -1000, belowBreakEven: true },
    },
    {
      access: 'after-hours',
      price: 25000,
      breakEvenPrice: 24000,
      installOnly: { price: 26000, profit: 2000, belowBreakEven: false },
    },
  ];
  assert.match(accessNote(rows), /Discharge week while they stay home still loses/i);
  assert.match(accessNote(rows), /\$1,000\.00/);
});

test('accessNote uses proposedPrice when installOnlyPrice is omitted', () => {
  const rows = compareAccess({ ...special(), proposedPrice: 18995 });
  assert.equal(rows[0].installOnlyPrice, 18995);
  assert.match(accessNote(rows), /\$18,995\.00/);
});

test('accessNote rejects a short row list', () => {
  assert.throws(() => accessNote([]), /missing rows/);
  assert.throws(() => accessNote([{ access: 'weekday-scheduled' }]), /missing rows/);
});

test('compareAccess keeps drive and hoistway with the current job', () => {
  const cheap = compareAccess(special()).find((row) => row.access === 'after-hours');
  const hydraulic = compareAccess(losingJob()).find((row) => row.access === 'after-hours');
  assert.ok(cheap);
  assert.ok(hydraulic);
  assert.ok(hydraulic.price > cheap.price);
  assert.ok(hydraulic.totalHours > cheap.totalHours);
});

test('kits reject unknown ids', () => {
  assert.throws(() => suggestedDriveKit('rope'), /Unknown drive/);
  assert.throws(() => suggestedHoistwayKit('attic'), /Unknown hoistway/);
  assert.throws(() => suggestedCabKit('leather'), /Unknown cab/);
});
