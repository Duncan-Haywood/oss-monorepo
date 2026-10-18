import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_IDS, TOGGLE_IDS, SELECT_IDS } from './calc.mjs';
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from './share.mjs';

const SAMPLE = Object.fromEntries(INPUT_IDS.map((id, i) => [id, i + 1.5]));

test('FIELD_IDS matches calc.mjs INPUT_IDS exactly', () => {
  assert.deepEqual([...FIELD_IDS].sort(), [...INPUT_IDS].sort());
});

test('round-trips every numeric field, toggle and select', () => {
  const sent = { ...SAMPLE, schedule: 'pro', unknown: 9 };
  const got = decodeInputs(`#${encodeInputs(sent)}`);
  for (const id of INPUT_IDS) assert.equal(got[id], SAMPLE[id]);
  assert.equal(got.schedule, 'pro');
  assert.equal(got.unknown, undefined);
});

test('crafted values are ignored, not guessed at', () => {
  assert.deepEqual(decodeInputs('itemPrice=abc&itemCost=-3'), {});
  assert.deepEqual(decodeInputs('schedule=bogus'), {});
  assert.deepEqual(decodeInputs(null), {});
});

test('a zero survives rather than being dropped as falsy', () => {
  assert.equal(decodeInputs(encodeInputs({ buyerShipping: 0 })).buyerShipping, 0);
});

test('formValues writes every field and clears what the link omitted', () => {
  const v = formValues(decodeInputs('itemPrice=50'));
  for (const id of [...INPUT_IDS, ...TOGGLE_IDS, ...SELECT_IDS]) assert.ok(id in v, id);
  assert.equal(v.itemPrice, '50');
  assert.equal(v.itemCost, '');
  assert.equal(v.schedule, 'standard');
});
