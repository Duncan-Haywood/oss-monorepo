import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, buildShareUrl, FIELD_IDS } from './share.mjs';
import { DEFAULTS } from './calc.mjs';

test('encodes every default field into the query string', () => {
  const encoded = encodeInputs(DEFAULTS);
  const decoded = decodeInputs(encoded);
  assert.deepEqual(decoded, DEFAULTS);
});

test('round-trips through a leading ? or # exactly the same', () => {
  const encoded = encodeInputs(DEFAULTS);
  assert.deepEqual(decodeInputs(`?${encoded}`), decodeInputs(encoded));
  assert.deepEqual(decodeInputs(`#${encoded}`), decodeInputs(encoded));
});

test('a partial link only sets the fields it names, leaving the rest for the caller default', () => {
  const decoded = decodeInputs('accounts=25&laborRate=32');
  assert.deepEqual(decoded, { accounts: 25, laborRate: 32 });
  assert.equal(Object.keys(decoded).length, 2);
});

test('drops a negative, non-numeric, or unknown field rather than guessing', () => {
  const decoded = decodeInputs('accounts=-5&visits=abc&targetMargin=30&notAField=99');
  assert.deepEqual(decoded, { targetMargin: 30 });
});

test('a non-string source decodes to an empty object instead of throwing', () => {
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(42), {});
});

test('every default field is covered by the field list, plus the optional current price', () => {
  const defaultIds = new Set(Object.keys(DEFAULTS));
  for (const id of defaultIds) assert.ok(FIELD_IDS.includes(id));
  assert.ok(FIELD_IDS.includes('currentPrice'));
  assert.equal(FIELD_IDS.length, defaultIds.size + 1);
});

test('current price rides the share link only when the sender set one', () => {
  const withCurrent = encodeInputs({ ...DEFAULTS, currentPrice: 65 });
  assert.deepEqual(decodeInputs(withCurrent), { ...DEFAULTS, currentPrice: 65 });

  const withoutCurrent = encodeInputs(DEFAULTS);
  assert.equal(decodeInputs(withoutCurrent).currentPrice, undefined);
});

test('buildShareUrl strips any existing query or hash before attaching the route', () => {
  const url = buildShareUrl('https://example.com/pool-route-pricing/?old=1#stale', { accounts: 10, laborRate: 30 });
  assert.equal(url, 'https://example.com/pool-route-pricing/#accounts=10&laborRate=30');
});

test('buildShareUrl with no usable fields returns the bare base url', () => {
  const url = buildShareUrl('https://example.com/pool-route-pricing/', {});
  assert.equal(url, 'https://example.com/pool-route-pricing/');
});
