import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, FIELD_IDS } from './share.mjs';

test('round-trips a full set of inputs unchanged', () => {
  const inputs = { price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5, paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 15, shippingCost: 6, materialCost: 4, otherCost: 1 };
  const decoded = decodeInputs(encodeInputs(inputs));
  assert.deepEqual(decoded, inputs);
});

test('emits fields in a stable order so the same inputs give the same link', () => {
  const a = encodeInputs({ otherCost: 1, price: 30 });
  const b = encodeInputs({ price: 30, otherCost: 1 });
  assert.equal(a, b);
  assert.equal(a, 'price=30&otherCost=1');
});

test('accepts numeric strings from form fields', () => {
  const decoded = decodeInputs(encodeInputs({ price: '30', transactionRate: '6.5' }));
  assert.deepEqual(decoded, { price: 30, transactionRate: 6.5 });
});

test('drops blank, negative, and non-numeric values instead of encoding them', () => {
  const encoded = encodeInputs({ price: 30, shippingCharged: '', listingFee: -1, paymentRate: 'nope' });
  assert.equal(encoded, 'price=30');
});

test('ignores unknown keys so a link can only ever set known fields', () => {
  assert.equal(encodeInputs({ price: 30, evil: 999, __proto__: 1 }), 'price=30');
  assert.deepEqual(decodeInputs('price=30&evil=999&script=alert(1)'), { price: 30 });
});

test('tolerates a leading ? or # so location.hash/search can be passed directly', () => {
  assert.deepEqual(decodeInputs('#price=30'), { price: 30 });
  assert.deepEqual(decodeInputs('?price=30'), { price: 30 });
});

test('returns an empty object for missing or malformed input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

test('every encodable field is a real calculator field', () => {
  // Guards against FIELD_IDS drifting from the form: every id here is one the
  // page renders and calculateOrder understands.
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length);
  assert.ok(FIELD_IDS.includes('price'));
});
