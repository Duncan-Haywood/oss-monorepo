import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default visit field and reproduces the same price', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of FIELD_IDS) {
    assert.equal(decoded[field], DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(calculate(decoded).finalPrice, calculate(DEFAULTS).finalPrice);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?visitMinutes=45'), { visitMinutes: 45 });
  assert.deepEqual(decodeInputs('#visitMinutes=45'), { visitMinutes: 45 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('visitMinutes=abc&mileage=4'), { mileage: 4 });
  assert.equal(encodeInputs({ visitMinutes: -5 }).includes('visitMinutes='), false);
});

test('an overnight visit (zero on-site minutes) still round-trips a legitimate zero', () => {
  const overnight = { ...DEFAULTS, visitMinutes: 0, overnightNights: 2 };
  const decoded = decodeInputs(encodeInputs(overnight));
  assert.equal(decoded.visitMinutes, 0);
  assert.equal(decoded.overnightNights, 2);
});

test('the route-wide settings (weeks per month, target monthly income) round-trip too, not just the visit fields', () => {
  // Regression: these two shaped the "Your route this month" summary but
  // were missing from calc.mjs's DEFAULTS, so a shared link silently
  // dropped them and the recipient saw a different income gap than the
  // sender did -- the same class of bug share.mjs's own header warns about.
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.weeksPerMonth, DEFAULTS.weeksPerMonth);
  assert.equal(decoded.targetMonthlyIncome, DEFAULTS.targetMonthlyIncome);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ visitMinutes: '', driveMinutes: undefined, mileage: 4 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.visitMinutes, undefined);
  assert.equal(decoded.driveMinutes, undefined);
  assert.equal(decoded.mileage, 4);
});
