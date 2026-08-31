import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS, REVERB_DEFAULTS } from './calc.mjs';
import { encodeInputs, decodeInputs } from './share.mjs';

test('round-trips every known field and drops junk', () => {
  const encoded = encodeInputs({ ...REVERB_DEFAULTS, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of INPUT_FIELDS) {
    assert.equal(decoded[field], REVERB_DEFAULTS[field]);
  }
  assert.equal(decoded.unknown, undefined);
  assert.equal(encodeInputs({ ...REVERB_DEFAULTS, price: -4 }).includes('price='), false);
});

test('ignores a crafted non-numeric query value', () => {
  assert.deepEqual(decodeInputs('price=abc&offerPrice=720'), { offerPrice: 720 });
});
