import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, plan, policyDraft, comparisonNote, netEffectNote } from '../calc.mjs';

const defaults = {
  currency: 'USD',
  price: 150,
  depositPercent: 25,
  bookingsPerWeek: 12,
  bookingRate: 93,
  noticeHours: 48,
  businessName: '',
  serviceName: '',
};

test('deposit and balance preserve the service total', () => {
  const result = plan(defaults);
  assert.equal(result.deposit, 37.5);
  assert.equal(result.balance, 112.5);
});

test('annual secured cash applies the assumed booking rate', () => {
  assert.equal(plan(defaults).annual, 21762);
  assert.equal(plan(defaults).weeklyBookings, 11.16);
});

test('a zero deposit does not change the service balance', () => {
  const result = plan({ ...defaults, price: 80, depositPercent: 0, bookingsPerWeek: 10, bookingRate: 100 });
  assert.deepEqual({ deposit: result.deposit, balance: result.balance, annual: result.annual }, { deposit: 0, balance: 80, annual: 0 });
});

test('rejects empty, non-finite, and out-of-range fields', () => {
  assert.equal(parseInputs({ ...defaults, price: '' }).ok, false);
  assert.equal(parseInputs({ ...defaults, depositPercent: 'not-a-number' }).ok, false);
  assert.equal(parseInputs({ ...defaults, depositPercent: 101 }).ok, false);
  assert.equal(parseInputs({ ...defaults, bookingRate: -1 }).ok, false);
  assert.equal(parseInputs(defaults).ok, true);
});

test('policy draft applies the deposit to the total and asks for a local review', () => {
  const modeled = plan(defaults);
  const money = (n) => `$${n.toFixed(2)}`;
  const draft = policyDraft({ ...defaults, businessName: 'Northside Studio', serviceName: 'balayage' }, modeled, money);
  assert.match(draft, /Northside Studio/);
  assert.match(draft, /\$37\.50 deposit/);
  assert.match(draft, /remaining \$112\.50/);
  assert.match(draft, /48 hours/);
  assert.match(draft, /before publishing/);
  assert.doesNotMatch(draft, /must charge|should require|recommended/i);
});

test('comparison note does not add the deposit on top of the price', () => {
  const note = comparisonNote(defaults, plan(defaults), (n) => `$${n.toFixed(2)}`);
  assert.match(note, /applied to the service total, not added/);
  assert.match(note, /\$21762\.00/);
});

// --- Does the deposit pay for itself? ------------------------------------
//
// `defaults` above deliberately carries no no-show rates, so these first two
// also pin the fallback: every caller that predates these fields keeps working
// and sees the documented 15%/5% model rather than NaN.

test('net revenue compares kept appointments and forfeited deposits against today', () => {
  const result = plan(defaults);
  // 12/wk * 52 = 624 bookings today; 15% no-show => 530.4 paid at $150.
  assert.equal(result.revenueWithoutDeposit, 79560);
  // 93% kept = 580.32 bookings; 5% of those forfeit the $37.50 deposit and
  // 95% pay the full $150.
  assert.equal(result.revenueWithDeposit, 580.32 * (0.95 * 150 + 0.05 * 37.5));
  assert.ok(result.netChange > 0, 'a 15% -> 5% no-show improvement should pay at a 93% booking rate');
});

test('break-even booking rate is the point where the two columns match', () => {
  const result = plan(defaults);
  const atBreakEven = plan({ ...defaults, bookingRate: result.breakEvenBookingRate });
  assert.ok(
    Math.abs(atBreakEven.netChange) < 1e-6,
    `net change at the break-even rate should be zero, got ${atBreakEven.netChange}`,
  );
});

test('with no change in behaviour a deposit still breaks even below full retention', () => {
  // The finding this panel exists to surface: with the same no-show rate on
  // both sides, a deposit is still ahead at 100% retention, because the
  // no-shows that remain forfeit $37.50 instead of paying nothing. So the only
  // thing a deposit costs is bookings, and break-even lands under 100%.
  const result = plan({ ...defaults, noShowWithout: 10, noShowWith: 10 });
  assert.ok(
    result.breakEvenBookingRate < 100,
    `a positive deposit should break even under full retention, got ${result.breakEvenBookingRate}`,
  );
  assert.equal(plan({ ...defaults, bookingRate: 100, noShowWithout: 10, noShowWith: 10 }).netChange > 0, true);
});

test('a deposit expected to worsen no-shows reports a break-even above 100%', () => {
  // The only way the trade cannot be won: the user expects a deposit to make
  // no-shows worse, and the deposit is too small to cover the difference.
  const values = { ...defaults, depositPercent: 1, noShowWithout: 5, noShowWith: 20 };
  const result = plan(values);
  assert.ok(result.breakEvenBookingRate > 100, `expected >100%, got ${result.breakEvenBookingRate}`);
  assert.ok(result.netChange < 0);
  const note = netEffectNote(values, result, (n) => `$${n.toFixed(2)}`);
  assert.match(note, /would not make up/);
  assert.match(note, /above 100%/);
});

test('break-even is null, not NaN, when a kept booking is worth nothing', () => {
  const result = plan({ ...defaults, depositPercent: 0, noShowWith: 100 });
  assert.equal(result.breakEvenBookingRate, null);
  assert.equal(result.revenueWithDeposit, 0);
  const note = netEffectNote({ ...defaults, depositPercent: 0, noShowWith: 100 }, result, (n) => `$${n.toFixed(2)}`);
  assert.match(note, /collects nothing at any booking rate/);
});

test('keeping every booking with no no-show change is exactly a wash', () => {
  const result = plan({ ...defaults, bookingRate: 100, noShowWithout: 12, noShowWith: 12, depositPercent: 0 });
  assert.equal(result.netChange, 0);
  assert.equal(result.breakEvenBookingRate, 100);
});

test('the net-effect note states its assumptions and gives no recommendation', () => {
  const note = netEffectNote(defaults, plan(defaults), (n) => `$${n.toFixed(2)}`);
  assert.match(note, /assumes a missed slot earns nothing and is not refilled/);
  assert.match(note, /Break-even is at a/);
  assert.doesNotMatch(note, /you should|we recommend|is worth it|must charge/i);
});

test('a difference under one appointment price reads as a wash, not a gain', () => {
  // Sit just above break-even, where the year's difference is strictly
  // positive but smaller than a single $150 appointment.
  const values = { ...defaults, bookingRate: plan(defaults).breakEvenBookingRate + 0.01 };
  const result = plan(values);
  assert.ok(result.netChange > 0, 'above break-even should be a gain, however small');
  assert.ok(Math.abs(result.netChange) < values.price, `expected a sub-$150 difference, got ${result.netChange}`);
  assert.match(netEffectNote(values, result, (n) => `$${n.toFixed(2)}`), /about the same as taking no deposit/);
});

test('no-show rates are validated but optional', () => {
  assert.equal(parseInputs({ ...defaults, noShowWithout: 101 }).ok, false);
  assert.equal(parseInputs({ ...defaults, noShowWith: -1 }).ok, false);
  assert.equal(parseInputs({ ...defaults, noShowWith: 'not-a-number' }).ok, false);
  const absent = parseInputs(defaults);
  assert.equal(absent.ok, true);
  assert.equal(absent.values.noShowWithout, 15);
  assert.equal(absent.values.noShowWith, 5);
});
