import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS } from './share.mjs';

const sample = {
  estimatedHours: 16,
  actualHours: 20,
  estimatedMaterials: 420,
  actualMaterials: 465,
  estimatedOther: 80,
  actualOther: 95,
  hourlyRate: 55,
  bidPrice: 2000,
};

test('round-trips every field', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('omits blank optional fields rather than sending zero', () => {
  const { hourlyRate, bidPrice, ...required } = sample;
  const encoded = encodeInputs(required);
  assert.equal(encoded.includes('hourlyRate'), false);
  assert.equal(encoded.includes('bidPrice'), false);
  assert.deepEqual(decodeInputs(encoded), required);
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', actualHours: -1, extra: 12 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('extra' in decoded, false);
  assert.equal('actualHours' in decoded, false);
  assert.equal(decoded.estimatedHours, 16);
});

test('accepts hash or query prefixes', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
});

test('ignores non-numeric, empty, and missing input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('estimatedHours=not-a-number'), {});
  assert.deepEqual(decodeInputs(), {});
});

test('exports the fields the page shares, in calc.mjs order', () => {
  assert.equal(NUMBER_FIELD_IDS.length, 8);
  assert.ok(NUMBER_FIELD_IDS.includes('hourlyRate'));
  assert.ok(NUMBER_FIELD_IDS.includes('bidPrice'));
});
