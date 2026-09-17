import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInputs, decodeInputs, NUMBER_FIELD_IDS, QUOTE_FIELD_IDS, REPLACE_FIELD_IDS,
  BOOLEAN_FIELD_IDS, ENUM_FIELDS,
} from './share.mjs';

const WORKED_EXAMPLE = {
  diagnosticHours: 0.5,
  repairHours: 1.5,
  travelHours: 0.5,
  laborRate: 80,
  tripCost: 35,
  partsCost: 120,
  partsMarkup: 25,
  callbackReserve: 5,
  overheadRate: 10,
  targetMargin: 30,
  replacementPrice: 799,
  remainingRepairYears: 3,
  remainingReplaceYears: 10,
  diagnosticCollected: 75,
  yourReplaceProfit: 0,
};

test('the shareable field list is exactly the quote fields plus the replace fields, in the order the form declares them', () => {
  assert.deepEqual(NUMBER_FIELD_IDS, [...QUOTE_FIELD_IDS, ...REPLACE_FIELD_IDS]);
  assert.deepEqual(NUMBER_FIELD_IDS, Object.keys(WORKED_EXAMPLE));
  assert.equal(BOOLEAN_FIELD_IDS.length, 0, 'this form has no checkboxes to carry as flags');
  assert.deepEqual(ENUM_FIELDS, {}, 'this form has no <select> presets to validate against');
});

test('a round trip keeps every hour, rate, and comparison field, not just the target price', () => {
  const restored = decodeInputs(encodeInputs(WORKED_EXAMPLE));
  for (const [key, value] of Object.entries(WORKED_EXAMPLE)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('repairHours=1.5&laborRateSecret=999&targetMargin=30');
  assert.deepEqual(Object.keys(restored).sort(), ['repairHours', 'targetMargin']);
  assert.equal(restored.repairHours, 1.5);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('repairHours=-2&laborRate=abc&tripCost=35');
  assert.equal('repairHours' in restored, false);
  assert.equal('laborRate' in restored, false);
  assert.equal(restored.tripCost, 35);
});

test('hash or query prefixes and an empty value do not break the codec', () => {
  assert.equal(decodeInputs('#repairHours=1.5').repairHours, 1.5);
  assert.equal(decodeInputs('?laborRate=0').laborRate, 0);
  const encoded = encodeInputs({ repairHours: 1.5, targetMargin: '' });
  assert.equal(encoded.includes('targetMargin'), false);
});

test('a zero-value field (e.g. an owner-operator with no separate replace profit) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs(WORKED_EXAMPLE));
  assert.equal(restored.yourReplaceProfit, 0);
});
