import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, WEEKS_PER_MONTH } from './calc.mjs';
import { compareSecondSite, secondSiteNote } from './second-site.mjs';

const secondOffice = () => ({
  areas: [
    { name: 'Open office', squareFeet: 2000, productionRate: 4000, cleaningsPerWeek: 3 },
    { name: 'Restrooms', squareFeet: 200, productionRate: 1200, cleaningsPerWeek: 3 },
  ],
  hourlyWage: 17,
  burdenRate: 28,
  suppliesPerSqFtMonth: 0.005,
  equipmentMonthly: 0,
  otherMonthly: 0,
  overheadRate: 15,
  targetMargin: 20,
});

test('a zero-drive second site prices the same as the standalone bid', () => {
  const standalone = calculateBid(secondOffice());
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 0,
    tripsPerWeek: 3,
    extraVehicleMonthly: 0,
  });
  assert.ok(Math.abs(compared.priceToHoldMargin - standalone.monthlyPrice) < 1e-9);
  assert.ok(Math.abs(compared.incrementalCost - standalone.monthlyCost) < 1e-9);
  assert.equal(compared.monthlyDriveHours, 0);
  assert.equal(compared.driveGap, 0);
});

test('drive time is loaded labor, converted with the same weeks-per-month as the bid', () => {
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 30,
    tripsPerWeek: 3,
    extraVehicleMonthly: 0,
  });
  // 30 min each way × 3 nights = 3 hours/week.
  assert.ok(Math.abs(compared.monthlyDriveHours - 3 * WEEKS_PER_MONTH) < 1e-9);
  assert.ok(Math.abs(compared.monthlyDriveLabor - compared.monthlyDriveHours * compared.building.loadedWage) < 1e-9);
  assert.ok(compared.priceToHoldMargin > compared.ignoredDrivePrice);
  assert.ok(compared.driveGap > 0);
});

test('extra fuel takes the same overhead markup as other direct cost', () => {
  const none = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 0,
    tripsPerWeek: 0,
    extraVehicleMonthly: 0,
  });
  const withFuel = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 0,
    tripsPerWeek: 0,
    extraVehicleMonthly: 80,
  });
  const addedDirect = 80;
  const addedOverhead = addedDirect * 0.15;
  assert.ok(Math.abs(withFuel.incrementalCost - (none.incrementalCost + addedDirect + addedOverhead)) < 1e-9);
});

test('an offer below walk-away is flagged as a losing second site', () => {
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 25,
    tripsPerWeek: 3,
    extraVehicleMonthly: 80,
    offeredMonthly: 50,
  });
  assert.equal(compared.offered.belowWalkAway, true);
  assert.ok(compared.offered.profit < 0);
  assert.match(secondSiteNote(compared, { targetMargin: 20 }), /loses/);
});

test('an offer that covers cost but misses the target is not a walk-away miss', () => {
  const priced = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 25,
    tripsPerWeek: 3,
    extraVehicleMonthly: 80,
  });
  const mid = (priced.walkAwayMonthly + priced.priceToHoldMargin) / 2;
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 25,
    tripsPerWeek: 3,
    extraVehicleMonthly: 80,
    offeredMonthly: mid,
  });
  assert.equal(compared.offered.belowWalkAway, false);
  assert.equal(compared.offered.missesTarget, true);
  assert.match(secondSiteNote(compared, { targetMargin: 20 }), /covers cost/);
});

test('combined book adds the first site\'s profit to the second site\'s result', () => {
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 0,
    tripsPerWeek: 3,
    extraVehicleMonthly: 0,
    offeredMonthly: 400,
    existingMonthlyProfit: 300,
  });
  assert.ok(Math.abs(compared.combinedProfitAtOffer - (300 + compared.offered.profit)) < 1e-9);
  assert.ok(Math.abs(compared.combinedProfitAtTarget - (300 + compared.incrementalProfitAtTarget)) < 1e-9);
});

test('quoting the first-building method underprices the second by the drive gap', () => {
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 40,
    tripsPerWeek: 3,
    extraVehicleMonthly: 60,
  });
  assert.ok(compared.driveShare > 15, `drive should be a visible share, got ${compared.driveShare}`);
  assert.ok(Math.abs(compared.ignoredDrivePrice - compared.building.monthlyPrice) < 1e-9);
  const note = secondSiteNote(compared, { targetMargin: 20 });
  assert.match(note, /if the van were free/);
  assert.match(note, /on the road/);
});

test('rejects a target margin of 100% the same way the first-building bid does', () => {
  assert.throws(
    () => compareSecondSite({
      candidate: { ...secondOffice(), targetMargin: 100 },
      driveMinutesOneWay: 10,
      tripsPerWeek: 2,
      extraVehicleMonthly: 0,
    }),
    /less than 100/,
  );
});

test('empty offered price is no comparison, and empty string counts as none', () => {
  const compared = compareSecondSite({
    candidate: secondOffice(),
    driveMinutesOneWay: 10,
    tripsPerWeek: 2,
    extraVehicleMonthly: 0,
    offeredMonthly: '',
    existingMonthlyProfit: '',
  });
  assert.equal(compared.offered, null);
  assert.equal(compared.existingMonthlyProfit, null);
  assert.equal(compared.combinedProfitAtOffer, null);
});
