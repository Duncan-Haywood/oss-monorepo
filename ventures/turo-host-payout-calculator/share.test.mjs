import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTripPayout, EARNINGS_PLANS, BOOKING_WINDOWS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

const TRIP = { tripPrice: 350, days: 3, plan: 'more_earnings', bookingWindow: '28_plus', extraMileageFee: 20, lateReturnFee: 0, additionalUsageFee: 5, tripsPerMonth: 6 };

test('round-trips every field and reproduces the same payout', () => {
  const decoded = decodeInputs(`#${encodeInputs({ ...TRIP, unknown: 99 })}`);
  assert.deepEqual(decoded, TRIP);
  assert.equal(computeTripPayout(decoded).hostPayout, computeTripPayout(TRIP).hostPayout);
});

test('every plan and booking window survives the link', () => {
  for (const plan of EARNINGS_PLANS) for (const bookingWindow of BOOKING_WINDOWS) {
    const decoded = decodeInputs(encodeInputs({ ...TRIP, plan, bookingWindow }));
    assert.equal(decoded.plan, plan);
    assert.equal(decoded.bookingWindow, bookingWindow);
  }
});

test('a crafted plan, window, or numeric value is dropped', () => {
  assert.deepEqual(decodeInputs('plan=<script>&bookingWindow=never&tripPrice=abc&days=-2&tripsPerMonth=4'), { tripsPerMonth: 4 });
});

test('non-string sources decode to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a legitimate zero fee round-trips', () => {
  assert.equal(decodeInputs(encodeInputs({ lateReturnFee: 0 })).lateReturnFee, 0);
});

test('formValues writes every field, clearing ones the link omitted', () => {
  const { tripsPerMonth, ...without } = TRIP;
  const values = formValues(decodeInputs(encodeInputs(without)));
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
  assert.equal(values.tripsPerMonth, '');
  assert.equal(values.tripPrice, '350');
});

test('formValues on nothing clears the whole form', () => {
  for (const v of Object.values(formValues())) assert.equal(v, '');
});
