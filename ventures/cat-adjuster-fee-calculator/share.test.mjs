import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default deployment field and reproduces the same profit', () => {
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
  assert.deepEqual(decodeInputs('?deploymentDays=30'), { deploymentDays: 30 });
  assert.deepEqual(decodeInputs('#deploymentDays=30'), { deploymentDays: 30 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('deploymentDays=abc&mileagePerDay=40'), { mileagePerDay: 40 });
  assert.equal(encodeInputs({ deploymentDays: -5 }).includes('deploymentDays='), false);
});

test('a deployment with zero large-loss percentage still round-trips a legitimate zero', () => {
  const noLargeLoss = { ...DEFAULTS, largeLossPct: 0 };
  const decoded = decodeInputs(encodeInputs(noLargeLoss));
  assert.equal(decoded.largeLossPct, 0);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ deploymentDays: '', feePerClaim: undefined, mileagePerDay: 80 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.deploymentDays, undefined);
  assert.equal(decoded.feePerClaim, undefined);
  assert.equal(decoded.mileagePerDay, 80);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ mileagePerDay: 80 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // largeLossPct must not leave the recipient's own saved draft value in that
  // box -- see check_shared_link_clears.py and the index.html restore.
  const { largeLossPct, ...withoutLargeLoss } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutLargeLoss));
  const values = formValues(decoded);
  assert.equal(values.largeLossPct, '');
  assert.equal(values.deploymentDays, String(DEFAULTS.deploymentDays));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
