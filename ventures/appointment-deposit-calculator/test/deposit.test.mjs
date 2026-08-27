import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, plan, policyDraft, comparisonNote } from '../calc.mjs';

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
