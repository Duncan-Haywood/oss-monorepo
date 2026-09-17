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
  assert.deepEqual(decodeInputs('?extinguisherCount=24'), { extinguisherCount: 24 });
  assert.deepEqual(decodeInputs('#extinguisherCount=24'), { extinguisherCount: 24 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('extinguisherCount=abc&mileage=12'), { mileage: 12 });
  assert.equal(encodeInputs({ extinguisherCount: -5 }).includes('extinguisherCount='), false);
});

test('a site with zero recharge percentage still round-trips a legitimate zero', () => {
  const noRecharge = { ...DEFAULTS, rechargePct: 0 };
  const decoded = decodeInputs(encodeInputs(noRecharge));
  assert.equal(decoded.rechargePct, 0);
});

test('the route-wide target monthly income round-trips too, not just the per-visit fields', () => {
  // Regression this guards against, first found on vending-machine-route-margin:
  // the field shaped the "Your route this month" summary but was missing from
  // calc.mjs's DEFAULTS, so a shared link silently dropped it and the
  // recipient saw a different income gap than the sender did -- the same
  // class of bug share.mjs's own header warns about.
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.targetMonthlyIncome, DEFAULTS.targetMonthlyIncome);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ extinguisherCount: '', inspectionFeePerUnit: undefined, mileage: 9 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.extinguisherCount, undefined);
  assert.equal(decoded.inspectionFeePerUnit, undefined);
  assert.equal(decoded.mileage, 9);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ mileage: 9 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // rechargePct must not leave the recipient's own saved draft value in that
  // box -- see check_shared_link_clears.py and the index.html restore.
  const { rechargePct, ...withoutRecharge } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutRecharge));
  const values = formValues(decoded);
  assert.equal(values.rechargePct, '');
  assert.equal(values.extinguisherCount, String(DEFAULTS.extinguisherCount));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
