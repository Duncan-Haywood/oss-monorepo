import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS, LANDED_COST_DEFAULTS, calculateLandedCost } from './calc.mjs';
import { encodeInputs, decodeInputs, formValues } from './share.mjs';

test('round-trips every known field and drops junk', () => {
  const encoded = encodeInputs({ ...LANDED_COST_DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of INPUT_FIELDS) {
    assert.deepEqual(decoded[field], LANDED_COST_DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a negative numeric field is dropped rather than round-tripped', () => {
  assert.equal(encodeInputs({ ...LANDED_COST_DEFAULTS, itemCost: -4 }).includes('itemCost='), false);
});

test('ignores a crafted non-numeric query value', () => {
  assert.deepEqual(decodeInputs('itemCost=abc&freightCost=800'), { freightCost: 800 });
});

test('ignores a crafted entry type outside the known set', () => {
  assert.deepEqual(decodeInputs('entryType=express'), {});
});

test('the ocean checkbox round-trips both states', () => {
  const on = decodeInputs(encodeInputs({ ...LANDED_COST_DEFAULTS, oceanFreight: true }));
  const off = decodeInputs(encodeInputs({ ...LANDED_COST_DEFAULTS, oceanFreight: false }));
  assert.equal(on.oceanFreight, true);
  assert.equal(off.oceanFreight, false);
});

test('sharing a blank duty or supplemental rate preserves the displayed calculation instead of making the rate zero', () => {
  for (const field of ['dutyRatePct', 'supplementalRatePct', 'brokerFee']) {
    const input = { ...LANDED_COST_DEFAULTS, [field]: '' };
    const restored = decodeInputs(`#${encodeInputs(input)}`);
    assert.equal(restored[field], '');
    assert.deepEqual(calculateLandedCost(restored), calculateLandedCost(input));
    assert.notEqual(
      calculateLandedCost(restored).totalLandedCost,
      calculateLandedCost({ ...input, [field]: 0 }).totalLandedCost,
    );
  }
});

test('shared links distinguish blank, zero and absent fields', () => {
  assert.deepEqual(decodeInputs(encodeInputs({ dutyRatePct: '', brokerFee: 0 })),
    { dutyRatePct: '', brokerFee: 0 });
});

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ itemCost: 5000 });
  assert.deepEqual(Object.keys(values).sort(), [...INPUT_FIELDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  const { freightCost, ...withoutFreight } = LANDED_COST_DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutFreight));
  const values = formValues(decoded);
  assert.equal(values.freightCost, '');
  assert.equal(values.itemCost, String(LANDED_COST_DEFAULTS.itemCost));
});

test('formValues falls back entryType to formal when a link omits it, rather than an empty select', () => {
  const { entryType, ...withoutEntryType } = LANDED_COST_DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutEntryType));
  const values = formValues(decoded);
  assert.equal(values.entryType, 'formal');
});

test('formValues clears the ocean checkbox to false when a link omits it', () => {
  const { oceanFreight, ...withoutOcean } = LANDED_COST_DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutOcean));
  const values = formValues(decoded);
  assert.equal(values.oceanFreight, false);
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const field of INPUT_FIELDS) {
    if (field === 'entryType') assert.equal(values[field], 'formal');
    else if (field === 'oceanFreight') assert.equal(values[field], false);
    else assert.equal(values[field], '');
  }
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const field of INPUT_FIELDS) {
    if (field === 'entryType') assert.equal(values[field], 'formal');
    else if (field === 'oceanFreight') assert.equal(values[field], false);
    else assert.equal(values[field], '');
  }
});
