import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS, REVERB_DEFAULTS, calculateReverbSale } from './calc.mjs';
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

test('sharing blank fee inputs preserves the displayed sale instead of making fees zero', () => {
  for (const field of ['marketplaceRate', 'paymentRate', 'paymentFixed']) {
    const input = { ...REVERB_DEFAULTS, [field]: '' };
    const restored = decodeInputs(`#${encodeInputs(input)}`);
    assert.equal(restored[field], '');
    assert.deepEqual(calculateReverbSale(restored), calculateReverbSale(input));
    assert.notEqual(calculateReverbSale(restored).profit,
      calculateReverbSale({ ...input, [field]: 0 }).profit);
  }
});

test('shared links distinguish blank, zero and absent fields', () => {
  assert.deepEqual(decodeInputs(encodeInputs({ paymentRate: '', paymentFixed: 0 })),
    { paymentRate: '', paymentFixed: 0 });
});
