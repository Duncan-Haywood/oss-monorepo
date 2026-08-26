import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs } from './share.mjs';
import { defaultInputs } from './calc.mjs';

test('a round trip keeps trench feet, fuel, and the 400 A ATS, not just the kW', () => {
  const input = {
    ...defaultInputs(),
    generatorKw: 26,
    fuel: 'propane',
    location: 'far_yard',
    transferSwitch: 'automatic',
    atsAmps: 400,
    serviceAmps: 400,
    trenchFeet: 60,
    proposedPrice: 18500,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.generatorKw, 26);
  assert.equal(restored.fuel, 'propane');
  assert.equal(restored.location, 'far_yard');
  assert.equal(restored.atsAmps, 400);
  assert.equal(restored.trenchFeet, 60);
  assert.equal(restored.proposedPrice, 18500);
});

test('unknown query keys are ignored so a stale link cannot inject fields', () => {
  const restored = decodeInputs('generatorKw=18&wageSecret=99&fuel=natural_gas');
  assert.deepEqual(Object.keys(restored).sort(), ['fuel', 'generatorKw']);
  assert.equal(restored.generatorKw, 18);
});

test('hash or query prefixes and empty proposed prices do not break the decoder', () => {
  assert.equal(decodeInputs('#generatorKw=14').generatorKw, 14);
  assert.equal(decodeInputs('?feederFeet=35').feederFeet, 35);
  const encoded = encodeInputs({ ...defaultInputs(), proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
