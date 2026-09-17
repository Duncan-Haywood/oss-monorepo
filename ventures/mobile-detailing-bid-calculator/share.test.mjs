import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';
import { defaults } from './calc.mjs';

test('every field the calculator reads is shareable, taken from calc.mjs\'s own defaults', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.deepEqual(NUMBER_FIELD_IDS, Object.keys(defaults));
  assert.equal(BOOLEAN_FIELD_IDS.length, 0, 'this form has no checkboxes to carry as flags');
  assert.deepEqual(ENUM_FIELDS, {}, 'this form has no <select> presets to validate against');
});

test('a round trip keeps every hour, mile, rate, and percentage field, not just the target price', () => {
  const input = {
    targetPrice: 220,
    laborHours: 3.5,
    travelHours: 0.5,
    setupHours: 0.25,
    cleanupHours: 0.25,
    travelMiles: 18,
    vehicleRate: 0.7,
    wage: 28,
    burdenPercent: 25,
    supplies: 22,
    overhead: 15,
    paymentRate: 2.9,
    targetMargin: 30,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('laborHours=3&wageSecret=99&targetPrice=200');
  assert.deepEqual(Object.keys(restored).sort(), ['laborHours', 'targetPrice']);
  assert.equal(restored.laborHours, 3);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('laborHours=-2&wage=abc&travelMiles=18');
  assert.equal('laborHours' in restored, false);
  assert.equal('wage' in restored, false);
  assert.equal(restored.travelMiles, 18);
});

test('hash or query prefixes and an empty value do not break the codec', () => {
  assert.equal(decodeInputs('#laborHours=3').laborHours, 3);
  assert.equal(decodeInputs('?wage=0').wage, 0);
  const encoded = encodeInputs({ laborHours: 3, targetPrice: '' });
  assert.equal(encoded.includes('targetPrice'), false);
});

test('the owner-operator default (wage at zero) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs(defaults));
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(restored[key], value, `${key} did not round-trip from calc.mjs's own defaults`);
  }
  assert.equal(restored.wage, 0);
});
