import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, TEXT_FIELD_IDS } from './share.mjs';

const sample = {
  currency: 'USD',
  new_words: 1800,
  fuzzy_words: 1200,
  fuzzy_rate: 50,
  words_per_hour: 400,
  hourly_rate: 45,
  qa_hours: 2,
  dtp_cost: 75,
  rush_fee: 0,
  minimum_price: 250,
  target_margin: 25,
};

test('round-trips every field this calculator has', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('matches the ids the page actually reads', () => {
  const ids = [...NUMBER_FIELD_IDS, ...TEXT_FIELD_IDS];
  assert.deepEqual([...ids].sort(), Object.keys(sample).sort());
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', rush_fee: -1 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('rush_fee' in decoded, false);
  assert.equal(decoded.new_words, 1800);
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

test('a currency label is trimmed and truncated to the input maxlength', () => {
  const encoded = encodeInputs({ ...sample, currency: '  us dollars over twelve  ' });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.currency.length <= 12, true);
  assert.equal(decoded.currency, 'us dollars o'.slice(0, 12));
});

test('a blank or whitespace-only currency label is dropped', () => {
  const encoded = encodeInputs({ ...sample, currency: '   ' });
  assert.equal('currency' in decodeInputs(encoded), false);
});
