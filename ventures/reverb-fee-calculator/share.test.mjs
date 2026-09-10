import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_FIELDS, REVERB_DEFAULTS, calculateReverbSale } from './calc.mjs';
import { encodeInputs, decodeInputs, formValues } from './share.mjs';

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

test('formValues covers every field the form owns, not just the ones a link carried', () => {
  const values = formValues({ price: 800 });
  assert.deepEqual(Object.keys(values).sort(), [...INPUT_FIELDS].sort());
});

test('formValues clears a field a link did not carry, rather than leaving it unwritten', () => {
  // The exact defect this module exists to prevent: a link that omits
  // marketplaceRate must not leave the recipient's own saved draft value in
  // that box -- see check_shared_link_clears.py and the index.html restore.
  const { marketplaceRate, ...withoutRate } = REVERB_DEFAULTS;
  const decoded = decodeInputs(encodeInputs(withoutRate));
  const values = formValues(decoded);
  assert.equal(values.marketplaceRate, '');
  assert.equal(values.price, String(REVERB_DEFAULTS.price));
});

test('formValues on an empty decode clears the whole form', () => {
  const values = formValues({});
  for (const field of INPUT_FIELDS) assert.equal(values[field], '');
});

test('formValues on a missing argument clears the whole form rather than throwing', () => {
  const values = formValues();
  for (const field of INPUT_FIELDS) assert.equal(values[field], '');
});
