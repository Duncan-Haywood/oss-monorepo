import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCompensation, weeklyRent, WEEKS_PER_MONTH } from './calc.mjs';

const midBook = () => ({
  averageTicket: 85,
  clientsPerWeek: 14,
  retailPerWeek: 80,
  weeksWorkedPerYear: 50,
  commissionPercent: 50,
  retailCommissionPercent: 10,
  boothRentAmount: 275,
  boothRentCadence: 'weekly',
  cardFeePercent: 2.9,
  backbarPercent: 10,
  retailCostPercent: 50,
  otherWeeklyCost: 20,
  averageServiceMinutes: 75,
  unpaidHoursCommission: 2,
  unpaidHoursBooth: 7,
});

test('monthly conversion uses averaged weeks, not a flat four', () => {
  assert.ok(Math.abs(WEEKS_PER_MONTH - 52 / 12) < 1e-12);
  assert.ok(Math.abs(weeklyRent(1300, 'monthly') - 1300 / WEEKS_PER_MONTH) < 1e-9);
  assert.equal(weeklyRent(275, 'weekly'), 275);
});

test('commission take-home is the split, with the salon absorbing rent and backbar', () => {
  const result = compareCompensation(midBook());
  assert.equal(result.serviceGross, 85 * 14);
  assert.equal(result.retailGross, 80);
  assert.ok(Math.abs(result.commission.serviceTakeHome - 1190 * 0.5) < 1e-9);
  assert.ok(Math.abs(result.commission.retailTakeHome - 8) < 1e-9);
  assert.ok(Math.abs(result.commission.weeklyTakeHome - 603) < 1e-9);
  assert.equal(result.commission.rent, 0);
  assert.equal(result.commission.cardFees, 0);
  assert.equal(result.commission.backbar, 0);
});

test('booth take-home subtracts rent, card fees, backbar, and retail cost', () => {
  const result = compareCompensation(midBook());
  const card = 1270 * 0.029;
  const backbar = 1190 * 0.1;
  const expected = 1270 - card - backbar - 40 - 275 - 20;
  assert.ok(Math.abs(result.booth.cardFees - card) < 1e-9);
  assert.ok(Math.abs(result.booth.backbar - backbar) < 1e-9);
  assert.ok(Math.abs(result.booth.retailCost - 40) < 1e-9);
  assert.ok(Math.abs(result.booth.weeklyTakeHome - expected) < 1e-9);
  assert.ok(result.booth.weeklyTakeHome > result.commission.weeklyTakeHome);
  assert.equal(result.dollarWinner, 'booth');
});

test('annual figures use working weeks, not a fictional 52-week year', () => {
  const result = compareCompensation(midBook());
  assert.ok(Math.abs(result.commission.annualTakeHome - result.commission.weeklyTakeHome * 50) < 1e-9);
  assert.ok(Math.abs(result.booth.annualTakeHome - result.booth.weeklyTakeHome * 50) < 1e-9);
  assert.ok(Math.abs(result.commission.monthlyTakeHome - result.commission.weeklyTakeHome * (50 / 12)) < 1e-9);
  assert.ok(Math.abs(result.annualDifference - result.weeklyDifference * 50) < 1e-9);
});

test('effective hourly counts unpaid booth hours the salon used to cover', () => {
  const result = compareCompensation(midBook());
  // 14 clients * 75 minutes = 17.5 chair hours.
  assert.ok(Math.abs(result.chairHours - 17.5) < 1e-9);
  assert.ok(Math.abs(result.commission.weeklyHours - 19.5) < 1e-9);
  assert.ok(Math.abs(result.booth.weeklyHours - 24.5) < 1e-9);
  assert.ok(Math.abs(result.commission.effectiveHourly - (603 / 19.5)) < 1e-9);
  assert.ok(result.booth.effectiveHourly > 0);
});

test('a thin book can win on the check and lose on the hour', () => {
  const result = compareCompensation({ ...midBook(), clientsPerWeek: 10 });
  assert.equal(result.dollarWinner, 'booth');
  assert.equal(result.hourlyWinner, 'commission');
  assert.ok(result.hourlyDifference < 0);
});

test('break-even clients hold retail constant and solve the weekly gap', () => {
  const result = compareCompensation(midBook());
  assert.ok(result.breakEvenClients !== null);
  assert.ok(result.breakEvenClients < 14);
  assert.equal(result.extraClientsNeeded, 0);

  const atBreakEven = compareCompensation({
    ...midBook(),
    clientsPerWeek: result.breakEvenClients,
  });
  assert.ok(Math.abs(atBreakEven.weeklyDifference) < 0.02);
  assert.equal(atBreakEven.dollarWinner, 'tie');
});

test('max rent that matches commission is the walk-away number on a lease', () => {
  const result = compareCompensation(midBook());
  assert.ok(result.maxWeeklyRentToMatch > 275);
  const atCeiling = compareCompensation({
    ...midBook(),
    boothRentAmount: result.maxWeeklyRentToMatch,
  });
  assert.ok(Math.abs(atCeiling.weeklyDifference) < 0.02);
});

test('an offered rent is scored against the same book, and empty is absent', () => {
  assert.equal(compareCompensation(midBook()).offered, null);
  assert.equal(compareCompensation({ ...midBook(), offeredRentAmount: '' }).offered, null);

  const high = compareCompensation({
    ...midBook(),
    offeredRentAmount: 500,
    offeredRentCadence: 'weekly',
  });
  assert.equal(high.offered.weeklyRent, 500);
  assert.equal(high.offered.beatsCommission, false);
  assert.ok(high.offered.vsEnteredRent > 0);

  const low = compareCompensation({
    ...midBook(),
    offeredRentAmount: 200,
    offeredRentCadence: 'weekly',
  });
  assert.equal(low.offered.beatsCommission, true);
});

test('monthly rent quotes convert before they are compared', () => {
  const weekly = compareCompensation(midBook());
  const monthly = compareCompensation({
    ...midBook(),
    boothRentAmount: 275 * WEEKS_PER_MONTH,
    boothRentCadence: 'monthly',
  });
  assert.ok(Math.abs(monthly.rentWeekly - weekly.rentWeekly) < 1e-9);
  assert.ok(Math.abs(monthly.booth.weeklyTakeHome - weekly.booth.weeklyTakeHome) < 1e-9);
});

test('zero clients still reports commission retail and booth costs, not a divide-by-zero hourly', () => {
  const result = compareCompensation({ ...midBook(), clientsPerWeek: 0, averageTicket: 85 });
  assert.equal(result.serviceGross, 0);
  assert.equal(result.chairHours, 0);
  assert.ok(result.commission.weeklyTakeHome > 0);
  assert.ok(result.booth.weeklyTakeHome < result.commission.weeklyTakeHome);
  assert.equal(result.dollarWinner, 'commission');
  assert.ok(result.commission.effectiveHourly !== null);
});

test('a 100% commission with no unpaid hours is still a valid (if unusual) book', () => {
  const result = compareCompensation({
    ...midBook(),
    commissionPercent: 100,
    unpaidHoursCommission: 0,
    unpaidHoursBooth: 0,
  });
  assert.ok(result.commission.weeklyTakeHome > result.booth.weeklyTakeHome);
  assert.equal(result.dollarWinner, 'commission');
});

test('when booth keeps less of each ticket than commission, volume cannot close the gap', () => {
  const result = compareCompensation({
    ...midBook(),
    commissionPercent: 90,
    cardFeePercent: 8,
    backbarPercent: 15,
  });
  assert.equal(result.breakEvenClients, null);
  assert.equal(result.boothNeverBeatsOnVolume, true);
  assert.equal(result.dollarWinner, 'commission');
});

test('a $0 average ticket cannot be closed by volume, even with a positive keepAdvantage', () => {
  // Retail alone keeps booth ahead here, so extra clients (worth $0 each on
  // the ticket) genuinely cannot be the reason — and previously this input
  // fell between the two branches of the break-even check and reported
  // neither a break-even count nor boothNeverBeatsOnVolume.
  const losing = compareCompensation({
    ...midBook(),
    averageTicket: 0,
    retailPerWeek: 10,
  });
  assert.equal(losing.breakEvenClients, null);
  assert.equal(losing.extraClientsNeeded, null);
  assert.equal(losing.boothNeverBeatsOnVolume, true);
  assert.equal(losing.dollarWinner, 'commission');

  // Same $0 ticket, but retail alone already puts booth ahead — no volume
  // message is needed because there is nothing left to close.
  const winning = compareCompensation({
    ...midBook(),
    averageTicket: 0,
    clientsPerWeek: 0,
    retailPerWeek: 10000,
  });
  assert.equal(winning.breakEvenClients, null);
  assert.equal(winning.boothNeverBeatsOnVolume, false);
  assert.equal(winning.dollarWinner, 'booth');
});

test('inputs that would silently produce a nonsense comparison are rejected', () => {
  assert.throws(() => compareCompensation({ ...midBook(), averageTicket: 'abc' }), /Average ticket must be a number/);
  assert.throws(() => compareCompensation({ ...midBook(), clientsPerWeek: -1 }), /Clients per week must be at least 0/);
  assert.throws(() => compareCompensation({ ...midBook(), commissionPercent: 101 }), /Service commission must be at most 100/);
  assert.throws(() => compareCompensation({ ...midBook(), weeksWorkedPerYear: 0 }), /Weeks worked per year must be greater than zero/);
  assert.throws(() => compareCompensation({ ...midBook(), weeksWorkedPerYear: 53 }), /Weeks worked per year must be at most 52/);
  assert.throws(() => compareCompensation({ ...midBook(), averageServiceMinutes: 0 }), /Average service minutes must be greater than zero/);
  assert.throws(() => compareCompensation({ ...midBook(), boothRentCadence: 'yearly' }), /weekly or monthly/);
});
