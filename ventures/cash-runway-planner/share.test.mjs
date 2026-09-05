import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, TEXT_FIELD_IDS, KIND_FIELD_IDS } from './share.mjs';
import { MAX_ITEMS } from './app.mjs';

const sample = {
  cash: 5000,
  weeklyIncome: 1800,
  collectionWeeks: 2,
  weeklyCosts: 1400,
  weeks: 12,
  item1Name: 'Quarterly tax',
  item1Amount: 6000,
  item1Week: 3,
  item1Kind: 'out',
  item2Name: 'Deposit from Mrs Reid',
  item2Amount: 900,
  item2Week: 5,
  item2Kind: 'in',
  item1Repeat: 13,
};

test('round-trips the forecast inputs and one-off rows', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('field lists cover every item row app.mjs reads, and no more', () => {
  // A row missing here is a payment that silently falls off a shared link;
  // a row past MAX_ITEMS is a field the form can never actually carry.
  for (let index = 1; index <= MAX_ITEMS; index += 1) {
    assert.ok(NUMBER_FIELD_IDS.includes(`item${index}Amount`), `item${index}Amount missing`);
    assert.ok(NUMBER_FIELD_IDS.includes(`item${index}Week`), `item${index}Week missing`);
    assert.ok(NUMBER_FIELD_IDS.includes(`item${index}Repeat`), `item${index}Repeat missing`);
    assert.ok(TEXT_FIELD_IDS.includes(`item${index}Name`), `item${index}Name missing`);
    assert.ok(KIND_FIELD_IDS.includes(`item${index}Kind`), `item${index}Kind missing`);
  }
  assert.equal(NUMBER_FIELD_IDS.filter((id) => /^item\d+Amount$/.test(id)).length, MAX_ITEMS);
  assert.equal(NUMBER_FIELD_IDS.filter((id) => /^item\d+Repeat$/.test(id)).length, MAX_ITEMS);
  assert.equal(KIND_FIELD_IDS.filter((id) => /^item\d+Kind$/.test(id)).length, MAX_ITEMS);
  assert.doesNotMatch(NUMBER_FIELD_IDS.join(','), new RegExp(`item${MAX_ITEMS + 1}`));
});

test('a repeat interval survives a share link round trip', () => {
  const decoded = decodeInputs(encodeInputs({ item1Repeat: 13 }));
  assert.equal(decoded.item1Repeat, 13);
});

test('drops unknown fields, negative numbers, and an invalid kind rather than guessing', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', cash: -1, item1Kind: 'sideways' });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('cash' in decoded, false);
  // item1Kind is dropped instead of defaulting to 'out' -- restoring it
  // silently as the wrong direction would misstate the shared forecast, the
  // same drift class as a select field missing from a share allowlist.
  assert.equal('item1Kind' in decoded, false);
  assert.equal(decoded.item1Amount, 6000);
});

test('accepts hash or query prefixes and collapses control characters', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
  const dirty = decodeInputs('item1Name=Tax%0Abill%07here&item1Amount=100&item1Week=1&item1Kind=out');
  assert.equal(dirty.item1Name, 'Tax bill here');
});

test('caps a shared item name at the form field’s own maxlength', () => {
  const decoded = decodeInputs(encodeInputs({ item1Name: 'x'.repeat(200) }));
  assert.equal(decoded.item1Name.length, 60);
});

test('an empty payload decodes to an empty object rather than defaults', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('#'), {});
});
