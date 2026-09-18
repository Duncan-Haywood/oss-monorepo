import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a full round trip preserves every field the calculator reads', () => {
  const inputs = { length: 16, width: 12, height: 10, weight: 4, divisor: 166, packages: 3, roundDimensions: false };
  assert.deepEqual(decodeInputs(`#${encodeInputs(inputs)}`), inputs);
});

test('accepts a fragment, a query string, or a bare string', () => {
  const encoded = encodeInputs({ length: 9 });
  assert.deepEqual(decodeInputs(`#${encoded}`), { length: 9 });
  assert.deepEqual(decodeInputs(`?${encoded}`), { length: 9 });
  assert.deepEqual(decodeInputs(encoded), { length: 9 });
});

test('unknown and malformed keys are dropped rather than passed through', () => {
  const decoded = decodeInputs('#length=10&sneaky=1&weight=notanumber&width=-3');
  assert.deepEqual(decoded, { length: 10 });
});

test('a boolean survives only as an explicit 1 or 0', () => {
  assert.deepEqual(decodeInputs('#roundDimensions=1'), { roundDimensions: true });
  assert.deepEqual(decodeInputs('#roundDimensions=0'), { roundDimensions: false });
  // The trap a truthy-string rule falls into: "false" is a non-empty string.
  assert.deepEqual(decodeInputs('#roundDimensions=false'), {});
});

test('an absent boolean means "leave the page default alone", not "off"', () => {
  assert.equal('roundDimensions' in decodeInputs('#length=10'), false);
});

test('non-string input yields an empty object rather than throwing', () => {
  for (const bad of [null, undefined, 42, {}, []]) assert.deepEqual(decodeInputs(bad), {});
});

test('the exported field lists are what encode actually carries', () => {
  const encoded = encodeInputs(Object.fromEntries([
    ...NUMBER_FIELD_IDS.map(id => [id, 1]),
    ...BOOLEAN_FIELD_IDS.map(id => [id, true]),
  ]));
  const params = new URLSearchParams(encoded);
  for (const id of [...NUMBER_FIELD_IDS, ...BOOLEAN_FIELD_IDS]) assert.ok(params.has(id), `${id} must round-trip`);
});
