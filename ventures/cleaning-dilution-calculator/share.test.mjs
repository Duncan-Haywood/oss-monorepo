import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS } from './share.mjs';

const sample = {
  concentrateOz: 4,
  waterGallons: 1,
  containerCost: 32,
  containerOz: 128,
  batchGallons: 5,
  wasteRate: 5,
  laborMinutes: 3,
  laborRate: 22,
};

test('round-trips every field this calculator has', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('matches the ids the page actually reads', () => {
  assert.deepEqual([...NUMBER_FIELD_IDS].sort(), Object.keys(sample).sort());
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', wasteRate: -1 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('wasteRate' in decoded, false);
  assert.equal(decoded.concentrateOz, 4);
});

test('accepts a bare string, a leading "?", or a leading "#"', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(query), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
});

test('a link with nothing usable decodes to an empty object', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs('foo=bar'), {});
});
