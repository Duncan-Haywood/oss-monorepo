import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_IDS, CATEGORY_PRESETS, calculateSale } from './calc.mjs';
import { encodeInputs, decodeInputs, formValues } from './share.mjs';

const SAMPLE = {
  salePrice: 50, shippingCharged: 5, taxCharged: 0, shippingCost: 4,
  itemCost: 22, otherCost: 0, commissionRate: 8, commissionCap: 1500,
  paymentRate: 2.9, paymentFixed: 0.3, lotsPerShow: 24, targetLeftover: 10,
  giveaway: false, categoryPreset: 'tcg',
};

test('round-trips every known numeric field, the giveaway flag, and the category preset', () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of INPUT_IDS) {
    assert.equal(decoded[field], SAMPLE[field]);
  }
  assert.equal(decoded.giveaway, false);
  assert.equal(decoded.categoryPreset, 'tcg');
  assert.equal(decoded.unknown, undefined);
});

test('a false giveaway survives instead of being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, giveaway: false });
  assert.equal(decodeInputs(encoded).giveaway, false);
  assert.equal(decodeInputs(encodeInputs({ ...SAMPLE, giveaway: true })).giveaway, true);
});

test('a blank commission cap round-trips as blank, not zero', () => {
  const input = { ...SAMPLE, commissionCap: '' };
  const restored = decodeInputs(`#${encodeInputs(input)}`);
  assert.equal(restored.commissionCap, '');
  assert.deepEqual(calculateSale(restored), calculateSale(input));
  assert.notEqual(
    calculateSale(restored).commission,
    calculateSale({ ...input, commissionCap: 0 }).commission,
  );
});

test('a crafted link cannot select a category preset the page does not offer', () => {
  assert.deepEqual(decodeInputs('categoryPreset=platinum'), {});
  assert.equal(decodeInputs(`categoryPreset=${Object.keys(CATEGORY_PRESETS)[0]}`).categoryPreset,
    Object.keys(CATEGORY_PRESETS)[0]);
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('salePrice=abc&itemCost=22'), { itemCost: 22 });
  assert.equal(encodeInputs({ salePrice: -5 }).includes('salePrice='), false);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?salePrice=50'), { salePrice: 50 });
  assert.deepEqual(decodeInputs('#salePrice=50'), { salePrice: 50 });
});

test('formValues covers every numeric field the form owns, not just the ones a link carried', () => {
  const values = formValues({ salePrice: 50 });
  assert.deepEqual(Object.keys(values).sort(), [...INPUT_IDS].sort());
});

test('formValues clears a numeric field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // itemCost must not leave the recipient's own saved draft value in that
  // box -- see check_shared_link_clears.py and the index.html restore.
  const { itemCost, ...withoutItemCost } = SAMPLE;
  const decoded = decodeInputs(encodeInputs(withoutItemCost));
  const values = formValues(decoded);
  assert.equal(values.itemCost, '');
  assert.equal(values.salePrice, String(SAMPLE.salePrice));
});

test('formValues on an empty decode clears every numeric field', () => {
  const values = formValues({});
  for (const id of INPUT_IDS) assert.equal(values[id], '');
});

test('formValues on a missing argument clears every numeric field rather than throwing', () => {
  const values = formValues();
  for (const id of INPUT_IDS) assert.equal(values[id], '');
});
