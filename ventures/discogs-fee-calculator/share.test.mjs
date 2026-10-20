import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_IDS, TOGGLE_IDS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

const SAMPLE = {
  itemPrice: 50, buyerShipping: 6, labelCost: 1.5, itemCost: 15, otherCost: 0.5, targetProfit: 20,
  processingRate: 3.5, processingFixed: 0.49,
};

test('FIELD_IDS matches calc.mjs INPUT_IDS exactly', () => {
  assert.deepEqual([...FIELD_IDS].sort(), [...INPUT_IDS].sort());
});

test('round-trips every known numeric field', () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], SAMPLE[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?itemPrice=50'), { itemPrice: 50 });
  assert.deepEqual(decodeInputs('#itemPrice=50'), { itemPrice: 50 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('itemPrice=abc&itemCost=15'), { itemCost: 15 });
  assert.equal(encodeInputs({ itemPrice: -5 }).includes('itemPrice='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, buyerShipping: 0 });
  assert.equal(decodeInputs(encoded).buyerShipping, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('formValues writes every field, clearing what the link omitted', () => {
  const sender = { itemPrice: 50 };
  const applied = formValues(decodeInputs(encodeInputs(sender)));
  for (const id of FIELD_IDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(applied, id), `#${id} must be written, not skipped`);
  }
  assert.equal(applied.itemPrice, '50');
  assert.equal(applied.itemCost, '');
  for (const id of TOGGLE_IDS) assert.equal(applied[id], false, `#${id} must default off when the link is silent`);
});

test('formValues round-trips a full sale, processing overrides included', () => {
  const applied = formValues(decodeInputs(encodeInputs(SAMPLE)));
  for (const id of FIELD_IDS) assert.equal(Number(applied[id]), SAMPLE[id]);
});

test('a blank processing box in a link stays blank so the default applies', () => {
  const applied = formValues(decodeInputs(encodeInputs({ itemPrice: 20 })));
  assert.equal(applied.processingRate, '');
  assert.equal(applied.processingFixed, '');
});
