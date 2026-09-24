import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, calculate, PLAN_KEYS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

test('FIELD_IDS is exactly calc.mjs DEFAULTS, not a restated copy', () => {
  assert.deepEqual(FIELD_IDS, Object.keys(DEFAULTS));
});

test('round-trips every default field, including plan, and reproduces the same take-home', () => {
  const encoded = encodeInputs({ ...DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of FIELD_IDS) {
    assert.equal(decoded[field], DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(calculate(decoded).takeHome, calculate(DEFAULTS).takeHome);
});

test('round-trips every plan key, not just the default', () => {
  for (const plan of PLAN_KEYS) {
    const decoded = decodeInputs(encodeInputs({ ...DEFAULTS, plan }));
    assert.equal(decoded.plan, plan);
  }
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

test('ignores a crafted plan value that is not one of the four known plans', () => {
  assert.deepEqual(decodeInputs('plan=gold&tier1Patrons=5'), { tier1Patrons: 5 });
  assert.equal(encodeInputs({ plan: 'gold' }).includes('plan='), false);
});

test('a month with zero patrons in a tier still round-trips a legitimate zero', () => {
  const noTier3 = { ...DEFAULTS, tier3Patrons: 0 };
  const decoded = decodeInputs(encodeInputs(noTier3));
  assert.equal(decoded.tier3Patrons, 0);
});

test('other monthly income round-trips too, not just the patron tiers', () => {
  const decoded = decodeInputs(encodeInputs({ ...DEFAULTS, otherMonthlyIncome: 40 }));
  assert.equal(decoded.otherMonthlyIncome, 40);
});

test('blank or missing fields are simply absent from the encoded query', () => {
  const encoded = encodeInputs({ tier1Patrons: '', tier2Patrons: undefined, tier3Patrons: 8 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.tier1Patrons, undefined);
  assert.equal(decoded.tier2Patrons, undefined);
  assert.equal(decoded.tier3Patrons, 8);
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ tier3Patrons: 8 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // plan must not leave the recipient's own saved draft value in that
  // box -- see check_shared_link_clears.py and the index.html restore.
  const { plan, ...withoutPlan } = DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutPlan));
  const values = formValues(decoded);
  assert.equal(values.plan, '');
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
