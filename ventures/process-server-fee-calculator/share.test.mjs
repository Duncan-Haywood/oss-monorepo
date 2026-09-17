import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default job field and reproduces the same profit', () => {
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
  assert.deepEqual(decodeInputs('?milesRoundTrip=30'), { milesRoundTrip: 30 });
  assert.deepEqual(decodeInputs('#milesRoundTrip=30'), { milesRoundTrip: 30 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('milesRoundTrip=abc&baseFee=70'), { baseFee: 70 });
  assert.equal(encodeInputs({ milesRoundTrip: -5 }).includes('milesRoundTrip='), false);
});

test('a job with zero rush flag still round-trips a legitimate zero', () => {
  const noRush = { ...DEFAULTS, rushJob: 0 };
  const decoded = decodeInputs(encodeInputs(noRush));
  assert.equal(decoded.rushJob, 0);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ baseFee: '', extraAttemptFee: undefined, milesRoundTrip: 20 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.baseFee, undefined);
  assert.equal(decoded.extraAttemptFee, undefined);
  assert.equal(decoded.milesRoundTrip, 20);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ milesRoundTrip: 20 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // rushSurchargeFee must not leave the recipient's own saved draft value in
  // that box -- see check_shared_link_clears.py and the index.html restore.
  const { rushSurchargeFee, ...withoutRushSurcharge } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutRushSurcharge));
  const values = formValues(decoded);
  assert.equal(values.rushSurchargeFee, '');
  assert.equal(values.baseFee, String(DEFAULTS.baseFee));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
