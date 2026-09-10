import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default visit field and reproduces the same profit', () => {
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
  assert.deepEqual(decodeInputs('?unitsSold=60'), { unitsSold: 60 });
  assert.deepEqual(decodeInputs('#unitsSold=60'), { unitsSold: 60 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('unitsSold=abc&mileage=8'), { mileage: 8 });
  assert.equal(encodeInputs({ unitsSold: -5 }).includes('unitsSold='), false);
});

test('a location with zero commission still round-trips a legitimate zero', () => {
  const noCommission = { ...DEFAULTS, commissionPct: 0 };
  const decoded = decodeInputs(encodeInputs(noCommission));
  assert.equal(decoded.commissionPct, 0);
});

test('the route-wide target monthly income round-trips too, not just the per-visit fields', () => {
  // Regression: this shaped the "Your route this month" summary but was
  // missing from calc.mjs's DEFAULTS, so a shared link silently dropped it
  // and the recipient saw a different income gap than the sender did -- the
  // same class of bug share.mjs's own header warns about.
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.targetMonthlyIncome, DEFAULTS.targetMonthlyIncome);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ unitsSold: '', pricePerUnit: undefined, mileage: 8 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.unitsSold, undefined);
  assert.equal(decoded.pricePerUnit, undefined);
  assert.equal(decoded.mileage, 8);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ mileage: 8 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // commissionPct must not leave the recipient's own saved draft value in
  // that box -- see check_shared_link_clears.py and the index.html restore.
  const { commissionPct, ...withoutCommission } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutCommission));
  const values = formValues(decoded);
  assert.equal(values.commissionPct, '');
  assert.equal(values.unitsSold, String(DEFAULTS.unitsSold));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
