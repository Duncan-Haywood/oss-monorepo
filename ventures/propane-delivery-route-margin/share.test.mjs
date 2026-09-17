import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default field and reproduces the same profit', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of FIELD_IDS) {
    assert.equal(decoded[field], DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(calculate(decoded).netProfit, calculate(DEFAULTS).netProfit);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?annualGallons=900'), { annualGallons: 900 });
  assert.deepEqual(decodeInputs('#annualGallons=900'), { annualGallons: 900 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('annualGallons=abc&milesPerDelivery=8'), { milesPerDelivery: 8 });
  assert.equal(encodeInputs({ annualGallons: -5 }).includes('annualGallons='), false);
});

test('a customer with zero tank rental still round-trips a legitimate zero', () => {
  const noRental = { ...DEFAULTS, tankRentalMonthlyCost: 0 };
  const decoded = decodeInputs(encodeInputs(noRental));
  assert.equal(decoded.tankRentalMonthlyCost, 0);
});

test('the route-wide target monthly income round-trips too, not just the per-customer fields', () => {
  // Regression class: a field that shapes the "Your route this month"
  // summary but is missing from calc.mjs's DEFAULTS would silently drop out
  // of a shared link, and the recipient would see a different income gap
  // than the sender did -- the same class of bug share.mjs's own header
  // warns about.
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.targetMonthlyIncome, DEFAULTS.targetMonthlyIncome);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ annualGallons: '', retailPricePerGallon: undefined, milesPerDelivery: 8 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.annualGallons, undefined);
  assert.equal(decoded.retailPricePerGallon, undefined);
  assert.equal(decoded.milesPerDelivery, 8);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ milesPerDelivery: 8 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // avgGallonsPerFill must not leave the recipient's own saved draft value
  // in that box -- see check_shared_link_clears.py and the index.html
  // restore.
  const { avgGallonsPerFill, ...withoutFill } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutFill));
  const values = formValues(decoded);
  assert.equal(values.avgGallonsPerFill, '');
  assert.equal(values.annualGallons, String(DEFAULTS.annualGallons));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
