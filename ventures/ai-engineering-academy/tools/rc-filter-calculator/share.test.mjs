import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('the field list matches this page\'s own numeric ids and select/radio options', () => {
  assert.deepEqual(NUMBER_FIELD_IDS, ['r', 'c', 'l', 'target', 'dr', 'dc', 'dl']);
  assert.equal(BOOLEAN_FIELD_IDS.length, 0, 'this page has no checkboxes to carry as flags');
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), [
    'c-unit', 'dc-unit', 'dl-unit', 'dr-unit', 'l-unit', 'mode', 'r-unit', 'solve-for', 'target-unit', 'type',
  ].sort());
});

test('a full cutoff-mode reading round-trips: type, mode, and every component with its unit', () => {
  const input = {
    type: 'rc-lowpass', mode: 'cutoff',
    r: 10, 'r-unit': '1e3', c: 100, 'c-unit': '1e-9',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('a full design-mode reading round-trips: target, solve-for, and both known components', () => {
  const input = {
    type: 'rl-highpass', mode: 'design',
    target: 1, 'target-unit': '1e3', 'solve-for': 'resistance',
    dl: 10, 'dl-unit': '1e-3',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('an enum value the page does not offer is dropped, not passed through', () => {
  const restored = decodeInputs('type=bandpass&mode=cutoff&r-unit=1e9');
  assert.equal('type' in restored, false);
  assert.equal('r-unit' in restored, false);
  assert.equal(restored.mode, 'cutoff');
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('r=10&rSecret=999&type=rc-lowpass');
  assert.deepEqual(Object.keys(restored).sort(), ['r', 'type']);
});

test('a negative or non-numeric component value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('r=-5&c=abc&l=10');
  assert.equal('r' in restored, false);
  assert.equal('c' in restored, false);
  assert.equal(restored.l, 10);
});

test('hash or query prefixes and an empty value do not break the codec', () => {
  assert.equal(decodeInputs('#r=10').r, 10);
  assert.equal(decodeInputs('?c=0').c, 0);
  const encoded = encodeInputs({ r: 10, target: '' });
  assert.equal(encoded.includes('target'), false);
});

test('a zero-value component still travels -- some designs legitimately solve to it', () => {
  const restored = decodeInputs(encodeInputs({ r: 0, type: 'rc-lowpass' }));
  assert.equal(restored.r, 0);
});
