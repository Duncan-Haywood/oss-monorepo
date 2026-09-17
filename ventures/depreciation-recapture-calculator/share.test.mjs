import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, analyzeSale } from './calc.mjs';
import { FIELD_IDS, NUMERIC_FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('the field list is derived from DEFAULTS, not restated', () => {
  assert.deepEqual([...FIELD_IDS].sort(), Object.keys(DEFAULTS).sort());
});

test('round-trips every numeric field, including a zero', () => {
  const scenario = { ...DEFAULTS, mortgagePayoff: 0, exchangeBoot: 0, ordinaryRateCap: 0.12 };
  const encoded = encodeInputs({ ...scenario, unknownField: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of NUMERIC_FIELD_IDS) {
    assert.equal(decoded[id], scenario[id]);
  }
  assert.equal(decoded.unknownField, undefined);
});

test('a link built with an empty ordinaryRateCap leaves it out entirely, not encoded as zero', () => {
  const encoded = encodeInputs({ ...DEFAULTS, ordinaryRateCap: '' });
  assert.ok(!new URLSearchParams(encoded).has('ordinaryRateCap'));
  const decoded = decodeInputs(encoded);
  assert.ok(!('ordinaryRateCap' in decoded));
});

test('the includeNiit checkbox round-trips as a real boolean, not a stale default', () => {
  const checked = encodeInputs({ ...DEFAULTS, includeNiit: true });
  assert.equal(decodeInputs(checked).includeNiit, true);

  const uncheckedLink = encodeInputs({ ...DEFAULTS, includeNiit: false });
  assert.ok(!new URLSearchParams(uncheckedLink).has('includeNiit'));
  assert.equal(decodeInputs(uncheckedLink).includeNiit, undefined);
});

test('a shared link reproduces the identical analysis on the recipient side', () => {
  for (const scenario of [DEFAULTS, { ...DEFAULTS, includeNiit: true, exchangeBoot: 50000 }]) {
    const sender = analyzeSale(scenario);
    const recipient = analyzeSale(decodeInputs(encodeInputs(scenario)));
    assert.deepEqual(recipient, sender);
  }
});

test('formValues fills every field as a string or boolean the form controls can bind to', () => {
  const decoded = decodeInputs(encodeInputs({ ...DEFAULTS, includeNiit: true }));
  const values = formValues(decoded);
  for (const id of NUMERIC_FIELD_IDS) {
    assert.equal(typeof values[id], 'string');
  }
  assert.equal(values.includeNiit, true);
});

test('formValues clears fields a link did not carry rather than leaving them stale', () => {
  const values = formValues({});
  for (const id of NUMERIC_FIELD_IDS) assert.equal(values[id], '');
  assert.equal(values.includeNiit, false);
});
