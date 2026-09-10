import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_IDS, OFFER_INPUT_IDS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs } from './share.mjs';

const SAMPLE = {
  salePrice: 50, itemCost: 15, otherCost: 0.5, targetProfit: 20,
  listedPrice: 20, offerPrice: 14,
};

test('FIELD_IDS is the union of INPUT_IDS and OFFER_INPUT_IDS, deduplicated', () => {
  assert.deepEqual([...FIELD_IDS].sort(), [...new Set([...INPUT_IDS, ...OFFER_INPUT_IDS])].sort());
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length, 'no duplicate ids (itemCost/otherCost are shared)');
});

test('round-trips every known field', () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], SAMPLE[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?salePrice=50'), { salePrice: 50 });
  assert.deepEqual(decodeInputs('#salePrice=50'), { salePrice: 50 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('salePrice=abc&itemCost=15'), { itemCost: 15 });
  assert.equal(encodeInputs({ salePrice: -5 }).includes('salePrice='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, otherCost: 0 });
  assert.equal(decodeInputs(encoded).otherCost, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});
