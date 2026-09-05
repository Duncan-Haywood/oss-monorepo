import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

test('encodeShare then decodeShare round-trips the compared fields', () => {
  const input = { firstName: 'Northstar 3PL', secondName: 'Harbor Fulfillment', first: '4200', second: '3950', target: '4000' };
  const decoded = decodeShare(encodeShare(input));
  assert.deepEqual(decoded, input);
});

test('encodeShare drops blank fields instead of carrying them as empty strings', () => {
  const encoded = encodeShare({ first: '100', second: '90', target: '' });
  const decoded = decodeShare(encoded);
  assert.deepEqual(decoded, { first: '100', second: '90' });
  assert.equal('target' in decoded, false);
});

test('encodeShare returns an empty string for no shareable input', () => {
  assert.equal(encodeShare({}), '');
  assert.equal(encodeShare(null), '');
});

test('decodeShare ignores keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({ first: '10', second: '20', evil: 'ignored', __proto__: { polluted: true } }));
  const decoded = decodeShare(crafted);
  assert.deepEqual(decoded, { first: '10', second: '20' });
  assert.equal(decoded.evil, undefined);
});

test('decodeShare rejects malformed or empty fragments', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify({ evil: 'only' }))), null);
});

test('decodeShare accepts a leading "#" or "?" the same as a bare fragment', () => {
  const raw = JSON.stringify({ first: '10', second: '20' });
  assert.deepEqual(decodeShare(`#${encodeURIComponent(raw)}`), { first: '10', second: '20' });
  assert.deepEqual(decodeShare(`?${encodeURIComponent(raw)}`), { first: '10', second: '20' });
});

test('SHARE_FIELDS lists exactly the compare form fields', () => {
  assert.deepEqual([...SHARE_FIELDS], ['firstName', 'secondName', 'first', 'second', 'target']);
});
