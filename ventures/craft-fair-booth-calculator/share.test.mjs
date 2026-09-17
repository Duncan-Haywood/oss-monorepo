import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, hasSharedInputs, formValues, FIELD_IDS } from './share.mjs';
import { calculateEvent, DEFAULTS } from './calc.mjs';

test('the shareable field list is calc.mjs own input list, not a copy of it', () => {
  assert.deepEqual([...FIELD_IDS], Object.keys(DEFAULTS));
});

test('a round trip through a link returns every field unchanged', () => {
  const decoded = decodeInputs(encodeInputs(DEFAULTS));
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], DEFAULTS[id], `${id} did not survive the round trip`);
  }
});

// The defect this module exists to prevent: a link that silently drops a
// field so the recipient computes a different answer than the sender saw.
test('a shared link reproduces the sender arithmetic exactly', () => {
  const sent = { ...DEFAULTS, boothFee: 425, expectedRevenue: 1875, averageOrderValue: 52 };
  const received = calculateEvent(decodeInputs(`#${encodeInputs(sent)}`));
  const original = calculateEvent(sent);
  assert.deepEqual(received, original);
});

test('a fragment and a query string decode identically', () => {
  const query = encodeInputs(DEFAULTS);
  assert.deepEqual(decodeInputs(`#${query}`), decodeInputs(`?${query}`));
});

test('formValues writes every field the form owns, clearing what the link omitted', () => {
  const partial = decodeInputs('boothFee=300');
  const values = formValues(partial);
  assert.deepEqual(Object.keys(values), [...FIELD_IDS]);
  assert.equal(values.boothFee, '300');
  for (const id of FIELD_IDS) {
    if (id === 'boothFee') continue;
    assert.equal(values[id], '', `${id} was left holding the recipient's own value`);
  }
});

test('hasSharedInputs distinguishes a link that carried numbers from one that did not', () => {
  assert.equal(hasSharedInputs(decodeInputs('')), false);
  assert.equal(hasSharedInputs(decodeInputs('#')), false);
  assert.equal(hasSharedInputs(decodeInputs('#boothFee=300')), true);
});

test('junk, negative, and blank values are dropped rather than decoded', () => {
  const decoded = decodeInputs('boothFee=abc&applicationFee=-5&lodgingCost=&sellingHours=6');
  assert.deepEqual(decoded, { sellingHours: 6 });
});

test('unknown parameters in a link are ignored', () => {
  assert.deepEqual(decodeInputs('boothFee=100&utm_source=newsletter&tracking=1'), { boothFee: 100 });
});

test('encoding skips fields with no usable value instead of writing zero', () => {
  const encoded = encodeInputs({ ...DEFAULTS, lodgingCost: '', boothFee: 'abc' });
  const params = new URLSearchParams(encoded);
  assert.equal(params.has('lodgingCost'), false);
  assert.equal(params.has('boothFee'), false);
  assert.equal(params.get('sellingHours'), '12');
});

test('a zero is carried, because zero lodging is a fact and not an absence', () => {
  const params = new URLSearchParams(encodeInputs({ ...DEFAULTS, lodgingCost: 0 }));
  assert.equal(params.get('lodgingCost'), '0');
});

test('encodeInputs tolerates being handed nothing at all', () => {
  assert.equal(encodeInputs(undefined), '');
  assert.equal(encodeInputs(null), '');
});
