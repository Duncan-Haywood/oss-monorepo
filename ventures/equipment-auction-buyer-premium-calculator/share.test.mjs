import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, analyzeAuction } from './calc.mjs';
import { FIELD_IDS, NUMERIC_FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('the field list is derived from DEFAULTS, not restated', () => {
  assert.deepEqual([...FIELD_IDS].sort(), Object.keys(DEFAULTS).sort());
});

test('round-trips every numeric field, including a zero', () => {
  const scenario = { ...DEFAULTS, buyerPremiumCap: 0, maxBudget: 0 };
  const encoded = encodeInputs({ ...scenario, unknownField: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of NUMERIC_FIELD_IDS) {
    assert.equal(decoded[id], scenario[id]);
  }
  assert.equal(decoded.unknownField, undefined);
});

test('a link built with a blank numeric field leaves it out entirely, not encoded as zero', () => {
  const encoded = encodeInputs({ ...DEFAULTS, maxBudget: '' });
  assert.ok(!new URLSearchParams(encoded).has('maxBudget'));
  const decoded = decodeInputs(encoded);
  assert.ok(!('maxBudget' in decoded));
});

test('boolean checkboxes round-trip as real booleans, not a stale default', () => {
  for (const id of ['biddingOnline', 'payingByCard', 'taxExempt']) {
    const checked = encodeInputs({ ...DEFAULTS, [id]: true });
    assert.equal(decodeInputs(checked)[id], true);

    const uncheckedLink = encodeInputs({ ...DEFAULTS, [id]: false });
    assert.ok(!new URLSearchParams(uncheckedLink).has(id));
    assert.equal(decodeInputs(uncheckedLink)[id], undefined);
  }
});

test('a shared link reproduces the identical analysis on the recipient side', () => {
  for (const scenario of [
    DEFAULTS,
    { ...DEFAULTS, biddingOnline: true, payingByCard: true, maxBudget: 60000 },
    { ...DEFAULTS, taxExempt: true, buyerPremiumCap: 0 },
  ]) {
    const sender = analyzeAuction(scenario);
    const recipient = analyzeAuction(decodeInputs(encodeInputs(scenario)));
    assert.deepEqual(recipient, sender);
  }
});

test('formValues fills every field as a string or boolean the form controls can bind to', () => {
  const decoded = decodeInputs(encodeInputs({ ...DEFAULTS, biddingOnline: true }));
  const values = formValues(decoded);
  for (const id of NUMERIC_FIELD_IDS) {
    assert.equal(typeof values[id], 'string');
  }
  assert.equal(values.biddingOnline, true);
});

test('formValues clears fields a link did not carry rather than leaving them stale', () => {
  const values = formValues({});
  for (const id of NUMERIC_FIELD_IDS) assert.equal(values[id], '');
  assert.equal(values.biddingOnline, false);
  assert.equal(values.payingByCard, false);
  assert.equal(values.taxExempt, false);
});
