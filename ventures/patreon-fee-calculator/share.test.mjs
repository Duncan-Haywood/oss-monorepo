import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default field and reproduces the same net payout', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of FIELD_IDS) {
    assert.equal(decoded[field], DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(calculate(decoded).netPayout, calculate(DEFAULTS).netPayout);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?tier1Patrons=200'), { tier1Patrons: 200 });
  assert.deepEqual(decodeInputs('#tier1Patrons=200'), { tier1Patrons: 200 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('tier1Patrons=abc&tier2Patrons=8'), { tier2Patrons: 8 });
  assert.equal(encodeInputs({ tier1Patrons: -5 }).includes('tier1Patrons='), false);
});

test('a crafted planTier or billingFrequency outside the calculator\'s own presets is dropped, not passed through', () => {
  assert.deepEqual(decodeInputs('planTier=ultra&billingFrequency=weekly'), {});
  assert.equal(encodeInputs({ planTier: 'ultra' }).includes('planTier='), false);
  assert.equal(encodeInputs({ billingFrequency: 'weekly' }).includes('billingFrequency='), false);
});

test('a legitimate planTier and billingFrequency round-trip', () => {
  const decoded = decodeInputs(encodeInputs({ planTier: 'legacy-lite', billingFrequency: 'per-creation' }));
  assert.equal(decoded.planTier, 'legacy-lite');
  assert.equal(decoded.billingFrequency, 'per-creation');
});

test('a month with zero patrons on a tier still round-trips a legitimate zero', () => {
  const noTier3 = { ...DEFAULTS, tier3Patrons: 0 };
  const decoded = decodeInputs(encodeInputs(noTier3));
  assert.equal(decoded.tier3Patrons, 0);
});

test('the target monthly payout round-trips too, not just the arithmetic fields', () => {
  // Regression class: a field that shapes the payout-gap summary but is
  // missing from calc.mjs's DEFAULTS would silently drop out of a shared
  // link, and the recipient would see a different gap than the sender did.
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  assert.equal(decoded.targetMonthlyPayout, DEFAULTS.targetMonthlyPayout);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ tier1Patrons: '', tier2Patrons: undefined, tier3Patrons: 8 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.tier1Patrons, undefined);
  assert.equal(decoded.tier2Patrons, undefined);
  assert.equal(decoded.tier3Patrons, 8);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ tier1Patrons: 8 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent -- see
  // check_shared_link_clears.py and twitch-payout-calculator/share.test.mjs's
  // identical test.
  const { billingFrequency, ...withoutBilling } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutBilling));
  const values = formValues(decoded);
  assert.equal(values.billingFrequency, '');
  assert.equal(values.tier1Patrons, String(DEFAULTS.tier1Patrons));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], '');
});
