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

test('a round trip keeps every mile, minute, rate, and fee field, not just the headline quote', () => {
  const input = {
    travelMiles: 45,
    mileageRate: 0.7,
    travelMinutes: 60,
    hourlyRate: 60,
    appointmentMinutes: 60,
    minimumFee: 50,
    stateFees: 15,
    witnessFee: 25,
    witnesses: 0,
    afterHoursFee: 0,
    waitingMinutes: 0,
    waitingRate: 30,
    pagesPerSet: 138,
    printSets: 2,
    printChargePerPage: 0.2,
    printCostPerPage: 0.04,
    printMinutes: 30,
    vehicleCostPerMile: 0.3,
    offeredFee: 85,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('travelMiles=20&hourlyRateSecret=999&offeredFee=85');
  assert.deepEqual(Object.keys(restored).sort(), ['offeredFee', 'travelMiles']);
  assert.equal(restored.travelMiles, 20);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('travelMiles=-2&hourlyRate=abc&witnesses=1');
  assert.equal('travelMiles' in restored, false);
  assert.equal('hourlyRate' in restored, false);
  assert.equal(restored.witnesses, 1);
});

test('hash or query prefixes and an empty value do not break the codec', () => {
  assert.equal(decodeInputs('#travelMiles=20').travelMiles, 20);
  assert.equal(decodeInputs('?waitingMinutes=0').waitingMinutes, 0);
  const encoded = encodeInputs({ travelMiles: 20, offeredFee: '' });
  assert.equal(encoded.includes('offeredFee'), false);
});

test('the venture\'s own defaults still travel, including the fields that ship at zero', () => {
  const restored = decodeInputs(encodeInputs(defaults));
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(restored[key], value, `${key} did not round-trip from calc.mjs's own defaults`);
  }
  assert.equal(restored.offeredFee, 0);
  assert.equal(restored.afterHoursFee, 0);
});
