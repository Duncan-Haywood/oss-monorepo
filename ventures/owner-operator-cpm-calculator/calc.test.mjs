import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeek, compareAccessorials, WEEKS_PER_MONTH } from './calc.mjs';

const week = () => ({
  loadedMiles: 1800,
  emptyMiles: 450,
  mpg: 6.2,
  dieselPrice: 4.2,
  truckPayment: 3000,
  insurance: 1800,
  permits: 350,
  otherFixed: 400,
  maintenancePerMile: 0.2,
  tiresPerMile: 0.05,
  otherVariablePerMile: 0.07,
  factoringRate: 3,
  offeredLoadedRate: 2,
});

function close(actual, expected, digits = 9) {
  assert.ok(
    Math.abs(actual - expected) < 10 ** -digits,
    `expected ${expected}, got ${actual}`,
  );
}

test('fuel, reserves, and the weekly share of the note add up to all-in cost', () => {
  const result = calculateWeek(week());
  assert.equal(result.totalMiles, 2250);
  close(result.fuelGallons, 2250 / 6.2);
  close(result.fuelCost, (2250 / 6.2) * 4.2);
  close(result.variablePerMile, 0.32);
  close(result.reservesCost, 2250 * 0.32);
  assert.equal(result.monthlyFixed, 5550);
  close(result.weeklyFixed, 5550 / WEEKS_PER_MONTH);
  close(result.weeklyCost, result.variableCost + result.weeklyFixed);
  close(result.annualCost, result.weeklyCost * 52);
});

test('deadhead miles raise the loaded rate that covers the same all-in cost', () => {
  const withDeadhead = calculateWeek(week());
  const noDeadhead = calculateWeek({ ...week(), emptyMiles: 0, offeredLoadedRate: '' });
  assert.equal(withDeadhead.totalMiles, 2250);
  assert.equal(noDeadhead.totalMiles, 1800);
  close(withDeadhead.deadheadShare, 20);
  close(noDeadhead.deadheadShare, 0);
  // Same loaded miles, more total miles → more fuel and reserves, so the
  // loaded rate that covers the week has to go up.
  assert.ok(withDeadhead.weeklyCost > noDeadhead.weeklyCost);
  assert.ok(withDeadhead.breakEvenLoadedRate > noDeadhead.breakEvenLoadedRate);
  close(withDeadhead.breakEvenLoadedRate, withDeadhead.weeklyCost / 1800);
  close(noDeadhead.breakEvenLoadedRate, noDeadhead.weeklyCost / 1800);
});

test('a $2.00 offer after 3% factoring is underwater on the starting week', () => {
  const result = calculateWeek(week());
  assert.equal(result.offered.grossRevenue, 3600);
  close(result.offered.factoringFee, 108);
  close(result.offered.netRevenue, 3492);
  close(result.offered.effectiveLoadedRate, 1.94);
  assert.equal(result.offered.belowBreakEven, true);
  assert.ok(result.offered.weeklyProfit < 0);
  // The settled rate is what has to clear break-even, not the posted $2.00.
  assert.ok(result.offered.effectiveLoadedRate < result.breakEvenLoadedRate);
});

test('the same week at a high enough loaded rate keeps money', () => {
  const result = calculateWeek({ ...week(), offeredLoadedRate: 2.4 });
  close(result.offered.effectiveLoadedRate, 2.4 * 0.97);
  assert.equal(result.offered.belowBreakEven, false);
  assert.ok(result.offered.weeklyProfit > 0);
  close(result.offered.annualProfit, result.offered.weeklyProfit * 52);
  close(result.offered.profitPerLoadedMile, result.offered.weeklyProfit / 1800);
  close(result.offered.profitPerTotalMile, result.offered.weeklyProfit / 2250);
});

test('factoring can flip a rate that looked fine on the posted number', () => {
  const cost = calculateWeek({ ...week(), offeredLoadedRate: '' });
  // Posted rate sits a few cents above break-even; 3% factoring pulls it under.
  const posted = Number((cost.breakEvenLoadedRate + 0.02).toFixed(4));
  const scored = calculateWeek({ ...week(), offeredLoadedRate: posted });
  assert.ok(posted > cost.breakEvenLoadedRate);
  assert.equal(scored.offered.belowBreakEven, true);
});

test('no offered rate means no comparison, and empty string counts as none', () => {
  assert.equal(calculateWeek({ ...week(), offeredLoadedRate: '' }).offered, null);
  assert.equal(calculateWeek({ ...week(), offeredLoadedRate: null }).offered, null);
  assert.equal(calculateWeek({ ...week(), offeredLoadedRate: undefined }).offered, null);
  // Zero is a real answer ("they want it hauled for free"), not an absent one.
  assert.equal(calculateWeek({ ...week(), offeredLoadedRate: 0 }).offered.offeredLoadedRate, 0);
  assert.equal(calculateWeek({ ...week(), offeredLoadedRate: 0 }).offered.belowBreakEven, true);
});

test('target take-home solves for the loaded rate after factoring', () => {
  const result = calculateWeek({ ...week(), targetWeeklyTakeHome: 800, offeredLoadedRate: '' });
  close(result.rateForTarget, (result.weeklyCost + 800) / 1800 / 0.97);
  const atTarget = calculateWeek({
    ...week(),
    offeredLoadedRate: result.rateForTarget,
    targetWeeklyTakeHome: 800,
  });
  close(atTarget.offered.weeklyProfit, 800);
});

test('zero loaded miles still costs the note but cannot quote a loaded rate', () => {
  const result = calculateWeek({ ...week(), loadedMiles: 0, offeredLoadedRate: '' });
  assert.equal(result.totalMiles, 450);
  assert.equal(result.breakEvenLoadedRate, null);
  assert.ok(result.weeklyCost > result.weeklyFixed);
  assert.ok(result.allInCpm > 0);
  assert.equal(result.rateForTarget, null);
});

test('a parked week (no miles) still carries the note and reports no per-mile ratios', () => {
  const result = calculateWeek({
    ...week(),
    loadedMiles: 0,
    emptyMiles: 0,
    offeredLoadedRate: '',
  });
  assert.equal(result.totalMiles, 0);
  assert.equal(result.fuelCost, 0);
  assert.equal(result.variableCost, 0);
  close(result.weeklyCost, result.weeklyFixed);
  assert.equal(result.allInCpm, null);
  assert.equal(result.variableCpm, null);
  assert.equal(result.fixedCpm, null);
  assert.equal(result.breakEvenLoadedRate, null);
  assert.equal(result.deadheadShare, 0);
});

test('loaded miles to cover the week use the settled rate, not the posted one', () => {
  const result = calculateWeek(week());
  close(result.loadedMilesToBreakEven, result.weeklyCost / result.offered.effectiveLoadedRate);
  assert.ok(result.loadedMilesToBreakEven > result.loadedMiles);
});

test('loaded miles to cover the week are unavailable without a usable offer', () => {
  const noOffer = calculateWeek({ ...week(), offeredLoadedRate: '' });
  assert.equal(noOffer.loadedMilesToBreakEven, null);

  const freeOffer = calculateWeek({ ...week(), offeredLoadedRate: 0 });
  assert.equal(freeOffer.loadedMilesToBreakEven, null);
});

test('inputs that would silently produce a nonsense week are rejected', () => {
  assert.throws(() => calculateWeek({ ...week(), mpg: 0 }), /Miles per gallon must be greater than zero/);
  assert.throws(() => calculateWeek({ ...week(), loadedMiles: -1 }), /Loaded miles must be at least 0/);
  assert.throws(() => calculateWeek({ ...week(), dieselPrice: 'abc' }), /Diesel price must be a number/);
  assert.throws(() => calculateWeek({ ...week(), factoringRate: 100 }), /less than 100/);
  assert.throws(() => calculateWeek({ ...week(), insurance: -1 }), /Insurance must be at least 0/);
});

test('monthly conversion uses averaged weeks, not a flat four', () => {
  assert.ok(Math.abs(WEEKS_PER_MONTH - 52 / 12) < 1e-12);
  assert.ok(WEEKS_PER_MONTH > 4.3);
  const result = calculateWeek(week());
  // A flat 4-week month would understate the note by about 8%.
  assert.ok(result.weeklyFixed < 5550 / 4);
});

test('unreimbursed lumper raises weekly cost; reimbursed lumper does not', () => {
  const unpaid = calculateWeek({ ...week(), lumperPaid: 75, lumperReimbursed: 0 });
  const repaid = calculateWeek({ ...week(), lumperPaid: 75, lumperReimbursed: 75 });
  const base = calculateWeek(week());
  close(unpaid.lumperUnreimbursed, 75);
  close(unpaid.weeklyCost, base.weeklyCost + 75);
  close(repaid.lumperUnreimbursed, 0);
  close(repaid.weeklyCost, base.weeklyCost);
});

test('detention and layover add to settlement after the same factor unless asked not to', () => {
  const factored = calculateWeek({
    ...week(),
    detentionHours: 6,
    detentionPayPerHour: 50,
    layoverPay: 100,
  });
  close(factored.detentionGross, 300);
  close(factored.accessorialGross, 400);
  close(factored.accessorialNet, 400 * 0.97);
  close(factored.offered.netRevenue, 3492 + 400 * 0.97);

  const cash = calculateWeek({
    ...week(),
    detentionHours: 6,
    detentionPayPerHour: 50,
    layoverPay: 100,
    factorAccessorials: false,
  });
  close(cash.accessorialNet, 400);
  close(cash.offered.netRevenue, 3492 + 400);
});

test('default detention hours flip the starting $2.00 week after a $75 lumper', () => {
  const compared = compareAccessorials({
    ...week(),
    detentionHours: 6,
    detentionPayPerHour: 50,
    lumperPaid: 75,
  });
  assert.ok(compared.milesOnly.offered.weeklyProfit < 0);
  assert.ok(compared.withAccessorials.offered.weeklyProfit > 0);
  close(compared.deltaProfit, compared.withAccessorials.offered.weeklyProfit - compared.milesOnly.offered.weeklyProfit);
  close(compared.netPerDetentionHour, 50 * 0.97);
  assert.ok(compared.detentionHoursToCover > 0);
  assert.ok(compared.detentionHoursToCover < 6);
});

test('loaded miles to cover the week never goes negative when accessorials alone cover cost', () => {
  // A long detention week (100 hours at $50/hr, net of factoring) throws off
  // enough cash by itself to cover the whole week, even at a losing-looking
  // $2.00 loaded rate. The truck still keeps money overall, but the "miles
  // needed" figure used to divide (weeklyCost - accessorialNet) — a negative
  // number here — straight through, so the app told a profitable driver they
  // needed "-683 loaded miles" to break even.
  const result = calculateWeek({
    ...week(),
    detentionHours: 100,
    detentionPayPerHour: 50,
  });
  assert.ok(result.accessorialNet > result.weeklyCost);
  assert.ok(result.offered.weeklyProfit > 0);
  assert.equal(result.loadedMilesToBreakEven, 0);
});

test('rate for target take-home never goes negative when accessorials alone clear the target', () => {
  // Same 100-hour detention week as the loadedMilesToBreakEven case above,
  // now with a target take-home on top. accessorialNet clears weeklyCost by
  // itself, so (weeklyCost - accessorialNet + targetWeeklyTakeHome) goes
  // negative — dividing that straight through used to tell a driver who
  // already beat their target that they needed to charge a *negative*
  // $/mile, which reads as "we owe the broker" rather than "you already
  // cleared this."
  const result = calculateWeek({
    ...week(),
    detentionHours: 100,
    detentionPayPerHour: 50,
    targetWeeklyTakeHome: 800,
    offeredLoadedRate: '',
  });
  assert.ok(result.accessorialNet > result.weeklyCost + 800);
  assert.equal(result.rateForTarget, 0);

  // At the floor, an offer of $0/mile should already meet (or beat) the
  // target once accessorials are counted.
  const atFloor = calculateWeek({
    ...week(),
    detentionHours: 100,
    detentionPayPerHour: 50,
    targetWeeklyTakeHome: 800,
    offeredLoadedRate: 0,
  });
  assert.ok(atFloor.offered.weeklyProfit >= 800);
});

test('rate for target take-home still solves the normal case unclamped', () => {
  // Sanity check the fix did not disturb the ordinary (positive numerator)
  // path already covered above — same inputs, restated with a large
  // negative-numerator guard nearby to make sure Math.max(0, ...) is a
  // no-op here.
  const result = calculateWeek({ ...week(), targetWeeklyTakeHome: 800, offeredLoadedRate: '' });
  assert.ok(result.rateForTarget > 0);
  close(result.rateForTarget, (result.weeklyCost + 800) / 1800 / 0.97);
});

test('detention hours to cover are null when the miles-only week already keeps money', () => {
  const compared = compareAccessorials({
    ...week(),
    offeredLoadedRate: 2.4,
    detentionHours: 6,
    detentionPayPerHour: 50,
  });
  assert.ok(compared.milesOnly.offered.weeklyProfit > 0);
  assert.equal(compared.detentionHoursToCover, null);
});
