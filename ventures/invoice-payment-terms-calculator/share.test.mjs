import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, ENUM_FIELDS, DATE_FIELD_IDS } from './share.mjs';

const sample = {
  amount: 1200,
  invoiceDate: '2026-08-24',
  termsDays: 30,
  annualLateRate: 18,
  graceDays: 10,
  monthlyBurn: 3000,
  outstanding: 3,
  earlyPayDays: 10,
  earlyPayDiscountPct: 2,
  annualCarryRate: 24,
  takeRatePct: 100,
  factorFeePct: 3,
  advancePct: 90,
  reserveDays: 35,
  payRun: 'monthly',
  payRunDay: 1,
  payRunWeekday: 5,
  projectValue: 6000,
  projectDays: 30,
  avgDaysLate: 12,
  depositCollectionDays: 5,
  depositPct: 30,
  exposureCeiling: 2000,
};

test('every field the form reads has a share slot', () => {
  const all = [...NUMBER_FIELD_IDS, ...Object.keys(ENUM_FIELDS), ...DATE_FIELD_IDS];
  assert.deepEqual(all.sort(), Object.keys(sample).sort());
});

test('round-trips every field', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('omits a blank field rather than sending a default value', () => {
  const { invoiceDate, payRun, ...required } = sample;
  const encoded = encodeInputs(required);
  const params = new URLSearchParams(encoded);
  assert.equal(params.has('invoiceDate'), false);
  assert.equal(params.has('payRun'), false);
  assert.deepEqual(decodeInputs(encoded), required);
});

test('rejects an enum value the form never offers', () => {
  const encoded = encodeInputs({ ...sample, payRun: 'DROP TABLE' });
  const decoded = decodeInputs(encoded);
  assert.equal('payRun' in decoded, false);
});

test('rejects a fragment that is not date-shaped', () => {
  const encoded = encodeInputs({ ...sample, invoiceDate: 'not-a-date' });
  assert.equal(decodeInputs(encoded).invoiceDate, undefined);
});

test('a date-shaped but calendar-invalid string still passes through, for calc.mjs to reject', () => {
  // Documented, deliberate: the encoder only checks YYYY-MM-DD shape, not
  // that the date exists, so this is the one case where decodeInputs is not
  // the last word — calc.mjs rejects an impossible date the same way it
  // rejects one typed by hand.
  assert.equal(decodeInputs('invoiceDate=2026-13-99').invoiceDate, '2026-13-99');
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', amount: -1, extra: 12 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('extra' in decoded, false);
  assert.equal('amount' in decoded, false);
  assert.equal(decoded.termsDays, 30);
});

test('accepts hash or query prefixes', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
});

test('ignores non-numeric, empty, and missing input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('amount=not-a-number'), {});
  assert.deepEqual(decodeInputs(), {});
});
