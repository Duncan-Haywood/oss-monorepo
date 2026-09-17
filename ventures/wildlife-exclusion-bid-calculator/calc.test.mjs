import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateBid,
  flatFeeGap,
  heightTierById,
  speciesById,
  HEIGHT_TIERS,
  SPECIES_PRESETS,
} from './calc.mjs';

// A deliberately round base case, so every assertion below can be checked by
// hand rather than against a number this file produced. Crew of 1 at $60/hr
// makes an hour of labor cost exactly $60.
function baseInput(overrides = {}) {
  return {
    species: 'raccoon',
    heightTier: 'ground',
    scheduledMonth: 10,

    crewSize: 1,
    hourlyWage: 60,
    burdenRate: 0,
    milesOneWay: 10,
    ratePerMile: 1,
    driveMinutesOneWay: 15,

    separateInspection: false,
    inspectionMinutes: 0,
    inspectionBillable: true,

    trapsSet: 0,
    trapSetMinutes: 0,
    trapDays: 0,
    trapChecksPerDay: 0,
    minutesPerTrapCheck: 0,
    consumablesPerTrap: 0,

    exclusionLinearFeet: 0,
    exclusionMinutesPerFoot: 0,
    exclusionMaterialPerFoot: 0,
    oneWayDoors: 0,
    doorMinutesEach: 0,
    doorCostEach: 0,
    doorRemovalVisit: false,
    doorRemovalMinutes: 0,
    liftRentalCost: 0,

    deconSquareFeet: 0,
    deconMinutesPer100SqFt: 0,
    deconMaterialPer100SqFt: 0,
    insulationRemoveSqFt: 0,
    insulationRemoveCostPerSqFt: 0,
    insulationReplaceSqFt: 0,
    insulationReplaceCostPerSqFt: 0,
    disposalFee: 0,
    repairCost: 0,

    warrantyYears: 0,
    warrantyReservePct: 0,
    overheadRate: 0,
    targetMargin: 0,
    proposedPrice: null,
    ...overrides,
  };
}

// --- input validation ------------------------------------------------------

test('rejects an unknown species and an unknown height tier', () => {
  assert.throws(() => calculateBid(baseInput({ species: 'dragon' })), /which animal/);
  assert.throws(() => calculateBid(baseInput({ heightTier: 'balloon' })), /how the exclusion work is reached/);
});

test('rejects a month outside 1-12', () => {
  assert.throws(() => calculateBid(baseInput({ scheduledMonth: 0 })), /at least 1/);
  assert.throws(() => calculateBid(baseInput({ scheduledMonth: 13 })), /between 1 and 12/);
});

test('rejects a crew of zero — somebody has to drive', () => {
  assert.throws(() => calculateBid(baseInput({ crewSize: 0 })), /Crew size must be at least 1/);
});

test('rejects a non-numeric or negative figure', () => {
  assert.throws(() => calculateBid(baseInput({ milesOneWay: 'ten' })), /must be a number/);
  assert.throws(() => calculateBid(baseInput({ exclusionLinearFeet: -4 })), /at least 0/);
});

test('rejects a target margin at or above 100%', () => {
  assert.throws(() => calculateBid(baseInput({ targetMargin: 100 })), /below 100/);
  assert.throws(() => calculateBid(baseInput({ targetMargin: 140 })), /below 100/);
});

// --- the visit count, which is the whole argument --------------------------

test('a job with no trapping and no device removal is one visit', () => {
  const result = calculateBid(baseInput());
  assert.equal(result.totalVisits, 1);
  assert.equal(result.trapCheckVisits, 0);
});

test('trap days times checks per day become return visits', () => {
  const result = calculateBid(baseInput({ trapsSet: 2, trapDays: 5, trapChecksPerDay: 1 }));
  // 1 install visit + 5 daily trap checks.
  assert.equal(result.trapCheckVisits, 5);
  assert.equal(result.totalVisits, 6);
});

test('a separate inspection and a device-removal trip each add a visit', () => {
  const result = calculateBid(baseInput({
    separateInspection: true,
    oneWayDoors: 1,
    doorRemovalVisit: true,
  }));
  // inspection + install + removal.
  assert.equal(result.totalVisits, 3);
});

test('mileage and drive labor scale with the visit count, not the job', () => {
  const one = calculateBid(baseInput());
  const six = calculateBid(baseInput({ trapsSet: 2, trapDays: 5, trapChecksPerDay: 1 }));

  // 1 visit x 2 legs x 10 miles x $1.
  assert.equal(one.totalMiles, 20);
  assert.equal(one.vehicleCost, 20);
  // 6 visits x 2 legs x 10 miles.
  assert.equal(six.totalMiles, 120);
  assert.equal(six.vehicleCost, 120);

  // 1 visit x 2 legs x 15 min = 30 min = half an hour at $60.
  assert.equal(one.driveLaborCost, 30);
  // 6 visits x 2 legs x 15 min = 180 min = 3 hours.
  assert.equal(six.driveLaborCost, 180);
});

test('trap checks are charged to the tech who actually goes, not the whole crew', () => {
  const shared = {
    crewSize: 2, trapsSet: 2, trapDays: 4, trapChecksPerDay: 1, minutesPerTrapCheck: 30,
  };
  const oneTech = calculateBid(baseInput({ ...shared, trapCheckCrewSize: 1 }));
  const wholeCrew = calculateBid(baseInput({ ...shared, trapCheckCrewSize: 2 }));

  // 4 checks x 30 min = 2 h on site, plus 4 round trips x 30 min = 2 h driving.
  // One tech pays for 4 crew-hours of that; two techs pay for 8.
  assert.equal(wholeCrew.trapLaborCost - oneTech.trapLaborCost, 2 * 60);
  assert.equal(wholeCrew.driveLaborCost - oneTech.driveLaborCost, 2 * 60);

  // The seal itself is unaffected — that is still a two-person job either way.
  assert.equal(oneTech.exclusionLaborCost, wholeCrew.exclusionLaborCost);
});

test('trap check crew defaults to the full crew when it is not given', () => {
  const input = baseInput({ crewSize: 2, trapsSet: 1, trapDays: 3, trapChecksPerDay: 1, minutesPerTrapCheck: 20 });
  delete input.trapCheckCrewSize;
  const defaulted = calculateBid(input);
  const explicit = calculateBid({ ...input, trapCheckCrewSize: 2 });
  assert.equal(defaulted.trapLaborCost, explicit.trapLaborCost);
  assert.equal(defaulted.crewHours, explicit.crewHours);
});

test('rejects a trap check crew of zero', () => {
  assert.throws(
    () => calculateBid(baseInput({ trapCheckCrewSize: 0 })),
    /Trap check crew size must be at least 1/,
  );
});

test('the five extra trap-check visits cost more than the traps do', () => {
  const withChecks = calculateBid(baseInput({
    trapsSet: 2, trapDays: 5, trapChecksPerDay: 1, minutesPerTrapCheck: 20, consumablesPerTrap: 6,
  }));
  // 5 checks x 20 min = 100 min on site; plus 5 extra round trips of 30 min
  // drive = 150 min. That labor dwarfs $12 of bait, which is the point.
  assert.equal(withChecks.trapConsumablesCost, 12);
  assert.ok(withChecks.trapLaborCost + 150 < withChecks.directCost);
  assert.ok(withChecks.directCost > 12 * 10);
});

// --- height as a labor multiplier ------------------------------------------

test('the height tier multiplies exclusion labor and nothing else', () => {
  const args = {
    exclusionLinearFeet: 60,
    exclusionMinutesPerFoot: 1,
    exclusionMaterialPerFoot: 2,
    deconSquareFeet: 100,
    deconMinutesPer100SqFt: 60,
    trapsSet: 1, trapDays: 2, trapChecksPerDay: 1, minutesPerTrapCheck: 30,
  };
  const ground = calculateBid(baseInput({ ...args, heightTier: 'ground' }));
  const two = calculateBid(baseInput({ ...args, heightTier: 'two' }));

  // 60 ft x 1 min = 60 min = 1 hour at $60.
  assert.equal(ground.exclusionLaborCost, 60);
  // Same footage at the two-story tier: 1.7x.
  assert.equal(two.exclusionLaborCost, 102);
  assert.equal(two.reachMultiplier, 1.7);

  // Material is footage, not reach — unchanged.
  assert.equal(ground.exclusionMaterialCost, 120);
  assert.equal(two.exclusionMaterialCost, 120);
  // Decon happens in the attic and trap checks happen in the yard.
  assert.equal(ground.deconLaborCost, two.deconLaborCost);
  assert.equal(ground.trapLaborCost, two.trapLaborCost);
});

test('a lift is charged only on the tier that needs one', () => {
  const withLift = calculateBid(baseInput({ heightTier: 'lift', liftRentalCost: 350 }));
  const withoutLift = calculateBid(baseInput({ heightTier: 'two', liftRentalCost: 350 }));
  assert.equal(withLift.liftCost, 350);
  assert.equal(withoutLift.liftCost, 0);
});

test('every height tier has a multiplier of at least 1 and they increase', () => {
  const multipliers = HEIGHT_TIERS.map((tier) => tier.laborMultiplier);
  assert.deepEqual(multipliers, [...multipliers].sort((a, b) => a - b));
  assert.equal(multipliers[0], 1);
  assert.equal(HEIGHT_TIERS.filter((tier) => tier.needsLift).length, 1);
});

// --- decontamination and insulation ----------------------------------------

test('decontamination is priced per 100 square feet, labor and material', () => {
  const result = calculateBid(baseInput({
    deconSquareFeet: 250,
    deconMinutesPer100SqFt: 40,
    deconMaterialPer100SqFt: 30,
  }));
  // 2.5 hundreds x 40 min = 100 min at $60/hr.
  assert.equal(result.deconLaborCost, 100);
  assert.equal(result.deconMaterialCost, 75);
});

test('insulation removal and replacement are separate square-foot lines', () => {
  const result = calculateBid(baseInput({
    insulationRemoveSqFt: 400, insulationRemoveCostPerSqFt: 1.5,
    insulationReplaceSqFt: 400, insulationReplaceCostPerSqFt: 2,
  }));
  assert.equal(result.insulationCost, 600 + 800);
});

// --- the warranty reserve ---------------------------------------------------

test('the reserve is taken against the warranted work, not the whole job', () => {
  const result = calculateBid(baseInput({
    exclusionLinearFeet: 60, exclusionMinutesPerFoot: 1, exclusionMaterialPerFoot: 2,
    oneWayDoors: 2, doorCostEach: 25,
    // Decontamination is deliberately large and deliberately not warranted.
    deconSquareFeet: 500, deconMinutesPer100SqFt: 60, deconMaterialPer100SqFt: 40,
    warrantyYears: 3, warrantyReservePct: 10,
  }));
  // Warranted: exclusion labor $60 + exclusion material $120 + doors $50 = $230.
  assert.equal(result.warrantyReserve, 23);
});

test('no warranty reserve means no reserve line', () => {
  const result = calculateBid(baseInput({
    exclusionLinearFeet: 60, exclusionMinutesPerFoot: 1, warrantyYears: 3, warrantyReservePct: 0,
  }));
  assert.equal(result.warrantyReserve, 0);
  assert.equal(result.warrantyWithoutReserve, true);
});

// --- price, margin and overhead --------------------------------------------

test('overhead is a percentage of direct cost and sits below the margin', () => {
  const result = calculateBid(baseInput({ overheadRate: 10, targetMargin: 0 }));
  // Direct cost is $30 drive labor + $20 mileage = $50; 10% overhead = $5.
  assert.equal(result.directCost, 50);
  assert.equal(result.overhead, 5);
  assert.equal(result.breakEvenPrice, 55);
  assert.equal(result.price, 55);
});

test('target margin is a share of the final price, not a markup on cost', () => {
  const result = calculateBid(baseInput({ targetMargin: 25 }));
  // Break-even $50 at a 25% net margin: 50 / 0.75 = 66.67.
  assert.equal(result.breakEvenPrice, 50);
  assert.equal(result.price, 66.67);
  // And the margin really is 25% of the price it produced.
  assert.ok(Math.abs((result.profit / result.price) * 100 - 25) < 0.05);
});

test('price per crew hour is reported so the truck can be sanity-checked', () => {
  const result = calculateBid(baseInput({ targetMargin: 0 }));
  // Half an hour of drive time, one crew member.
  assert.equal(result.crewHours, 0.5);
  assert.equal(result.pricePerCrewHour, 100);
});

test('a proposed price below break-even is reported as a loss', () => {
  const result = calculateBid(baseInput({ overheadRate: 10, proposedPrice: 40 }));
  assert.equal(result.proposed.belowBreakEven, true);
  assert.equal(result.proposed.profit, -15);
});

test('a proposed price above break-even reports its real margin', () => {
  const result = calculateBid(baseInput({ proposedPrice: 100 }));
  assert.equal(result.proposed.belowBreakEven, false);
  assert.equal(result.proposed.profit, 50);
  assert.equal(result.proposed.margin, 50);
});

// --- the flags --------------------------------------------------------------

test('traps set for days with no checks budgeted is flagged', () => {
  const flagged = calculateBid(baseInput({ trapsSet: 3, trapDays: 4, trapChecksPerDay: 0 }));
  assert.equal(flagged.trapsWithoutChecks, true);

  const fine = calculateBid(baseInput({ trapsSet: 3, trapDays: 4, trapChecksPerDay: 1 }));
  assert.equal(fine.trapsWithoutChecks, false);
});

test('no traps at all is not a missing-checks flag', () => {
  const result = calculateBid(baseInput({ trapsSet: 0, trapDays: 0, trapChecksPerDay: 0 }));
  assert.equal(result.trapsWithoutChecks, false);
});

test('a bat job scheduled inside the maternity window is flagged, outside it is not', () => {
  const june = calculateBid(baseInput({ species: 'bat', scheduledMonth: 6 }));
  const october = calculateBid(baseInput({ species: 'bat', scheduledMonth: 10 }));
  assert.equal(june.maternitySeasonRisk, true);
  assert.equal(october.maternitySeasonRisk, false);
});

test('a species with no maternity risk is never flagged for it', () => {
  for (let month = 1; month <= 12; month += 1) {
    const result = calculateBid(baseInput({ species: 'groundhog', scheduledMonth: month }));
    assert.equal(result.maternitySeasonRisk, false, `month ${month}`);
  }
});

test('one-way doors with no trip back to pull them is flagged', () => {
  const flagged = calculateBid(baseInput({ oneWayDoors: 2, doorRemovalVisit: false }));
  assert.equal(flagged.doorsWithoutRemoval, true);

  const fine = calculateBid(baseInput({ oneWayDoors: 2, doorRemovalVisit: true, doorRemovalMinutes: 30 }));
  assert.equal(fine.doorsWithoutRemoval, false);
});

test('traps quoted on a species nobody traps is flagged', () => {
  // Bats are excluded live through one-way devices, never trapped. A bat job
  // carrying trap lines is a rate sheet applied to the wrong animal.
  const bats = calculateBid(baseInput({ species: 'bat', trapsSet: 4 }));
  assert.equal(bats.trapsOnUntrappedSpecies, true);

  const raccoons = calculateBid(baseInput({ species: 'raccoon', trapsSet: 4 }));
  assert.equal(raccoons.trapsOnUntrappedSpecies, false);
});

// --- the flat-fee comparison ------------------------------------------------

test('flatFeeGap reports the shortfall against the walk-away price', () => {
  const result = calculateBid(baseInput({ overheadRate: 10 }));
  const gap = flatFeeGap(300, result);
  assert.equal(gap.breakEvenPrice, 55);
  assert.equal(gap.coversBreakEven, true);
  assert.equal(gap.shortfall, -245);
});

test('flatFeeGap reports a fee that does not cover the job', () => {
  const result = calculateBid(baseInput({
    trapsSet: 3, trapDays: 5, trapChecksPerDay: 1, minutesPerTrapCheck: 20,
    exclusionLinearFeet: 60, exclusionMinutesPerFoot: 1.5, exclusionMaterialPerFoot: 3,
    heightTier: 'two', overheadRate: 12,
  }));
  const gap = flatFeeGap(300, result);
  assert.equal(gap.coversBreakEven, false);
  assert.ok(gap.shortfall > 0);
});

// --- the presets themselves -------------------------------------------------

test('every species preset is internally consistent', () => {
  for (const preset of SPECIES_PRESETS) {
    assert.equal(typeof preset.label, 'string');
    assert.equal(typeof preset.trapped, 'boolean');
    assert.ok(Array.isArray(preset.maternityMonths));
    for (const month of preset.maternityMonths) {
      assert.ok(month >= 1 && month <= 12, `${preset.id} month ${month}`);
    }
    // A species with no maternity risk must carry no months, and one with a
    // risk must carry some — otherwise the flag can never fire and the row is
    // a decoration.
    assert.equal(preset.maternitySeasonRisk, preset.maternityMonths.length > 0, preset.id);
  }
});

test('bats and birds are not trapped species', () => {
  assert.equal(speciesById('bat').trapped, false);
  assert.equal(speciesById('bird').trapped, false);
  assert.equal(speciesById('raccoon').trapped, true);
});

test('lookups return null rather than throwing on an unknown id', () => {
  assert.equal(speciesById('unicorn'), null);
  assert.equal(heightTierById('orbit'), null);
});

test('the presets are frozen so a page cannot mutate the shared defaults', () => {
  assert.ok(Object.isFrozen(SPECIES_PRESETS));
  assert.ok(Object.isFrozen(HEIGHT_TIERS));
});

// --- a full worked job ------------------------------------------------------

test('a realistic raccoon job prices well above a headline removal fee', () => {
  const result = calculateBid({
    species: 'raccoon',
    heightTier: 'two',
    scheduledMonth: 10,
    crewSize: 2,
    trapCheckCrewSize: 1,
    hourlyWage: 25,
    burdenRate: 52,
    milesOneWay: 14,
    ratePerMile: 0.85,
    driveMinutesOneWay: 22,
    separateInspection: true,
    inspectionMinutes: 45,
    inspectionBillable: false,
    trapsSet: 3,
    trapSetMinutes: 12,
    trapDays: 5,
    trapChecksPerDay: 1,
    minutesPerTrapCheck: 25,
    consumablesPerTrap: 7,
    exclusionLinearFeet: 45,
    exclusionMinutesPerFoot: 1.4,
    exclusionMaterialPerFoot: 3.2,
    oneWayDoors: 1,
    doorMinutesEach: 35,
    doorCostEach: 45,
    doorRemovalVisit: true,
    doorRemovalMinutes: 25,
    liftRentalCost: 0,
    deconSquareFeet: 250,
    deconMinutesPer100SqFt: 45,
    deconMaterialPer100SqFt: 55,
    insulationRemoveSqFt: 250,
    insulationRemoveCostPerSqFt: 1.4,
    insulationReplaceSqFt: 250,
    insulationReplaceCostPerSqFt: 1.9,
    disposalFee: 90,
    repairCost: 160,
    warrantyYears: 3,
    warrantyReservePct: 8,
    overheadRate: 14,
    targetMargin: 22,
    proposedPrice: null,
  });

  // 1 inspection + 1 install + 5 trap checks + 1 device removal.
  assert.equal(result.totalVisits, 8);
  assert.equal(result.totalMiles, 224);
  // The whole claim of the venture: the job costs multiples of the ad price.
  assert.ok(result.breakEvenPrice > 1500, `break-even was ${result.breakEvenPrice}`);
  assert.ok(result.price > result.breakEvenPrice);
  assert.equal(result.maternitySeasonRisk, false);
  assert.equal(result.trapsWithoutChecks, false);
  assert.equal(result.doorsWithoutRemoval, false);
  assert.equal(result.warrantyWithoutReserve, false);

  const gap = flatFeeGap(395, result);
  assert.equal(gap.coversBreakEven, false);
  assert.ok(gap.shortfall > 1000);
});
