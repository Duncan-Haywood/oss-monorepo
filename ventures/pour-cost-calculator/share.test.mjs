import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_INPUT_IDS } from './calc.mjs';
import { encodeInputs, decodeInputs } from './share.mjs';

const SAMPLE = {
  primaryBottleCost: 24, primaryBottleSizeOz: 33.8, primaryOzUsed: 1.5,
  modifierBottleCost: 20, modifierBottleSizeOz: 25.4, modifierOzUsed: 0.75,
  mixerBottleCost: 6, mixerBottleSizeOz: 32, mixerOzUsed: 1,
  menuPrice: 12, targetPourCostPercent: 20, drinksPerWeek: 200, overPourOzPerDrink: 0.25,
};

test('SAMPLE covers every field the arithmetic reads', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), [...ALL_INPUT_IDS].sort());
});

test('round-trips every known field', () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of ALL_INPUT_IDS) {
    assert.equal(decoded[id], SAMPLE[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test('a blank optional ingredient stays blank, so "skip it" survives the link', () => {
  const { modifierBottleCost, modifierBottleSizeOz, modifierOzUsed, ...withoutModifier } = SAMPLE;
  const encoded = encodeInputs(withoutModifier);
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.modifierBottleCost, undefined);
  assert.equal(decoded.modifierBottleSizeOz, undefined);
  assert.equal(decoded.modifierOzUsed, undefined);
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeInputs('?menuPrice=12'), { menuPrice: 12 });
  assert.deepEqual(decodeInputs('#menuPrice=12'), { menuPrice: 12 });
});

test('ignores a crafted non-numeric or negative query value', () => {
  assert.deepEqual(decodeInputs('menuPrice=abc&drinksPerWeek=200'), { drinksPerWeek: 200 });
  assert.equal(encodeInputs({ menuPrice: -5 }).includes('menuPrice='), false);
});

test('a zero value round-trips rather than being dropped as falsy', () => {
  const encoded = encodeInputs({ ...SAMPLE, overPourOzPerDrink: 0 });
  assert.equal(decodeInputs(encoded).overPourOzPerDrink, 0);
});

test('a non-string source decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});
