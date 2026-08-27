import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs } from './share.mjs';
import { defaultInputs } from './calc.mjs';

test('a round trip keeps trench feet and panel work, not just the charger amps', () => {
  const input = {
    ...defaultInputs(),
    runFeet: 70,
    trenchFeet: 60,
    location: 'detached_garage',
    panelWork: 'service_upgrade',
    proposedPrice: 4800,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.chargerAmps, 48);
  assert.equal(restored.runFeet, 70);
  assert.equal(restored.trenchFeet, 60);
  assert.equal(restored.location, 'detached_garage');
  assert.equal(restored.panelWork, 'service_upgrade');
  assert.equal(restored.proposedPrice, 4800);
});

test('unknown query keys are ignored so a stale link cannot inject fields', () => {
  const restored = decodeInputs('chargerAmps=40&wageSecret=99&location=indoor_garage');
  assert.deepEqual(Object.keys(restored).sort(), ['chargerAmps', 'location']);
  assert.equal(restored.chargerAmps, 40);
});

test('hash or query prefixes and empty proposed prices do not break the decoder', () => {
  assert.equal(decodeInputs('#chargerAmps=32').chargerAmps, 32);
  assert.equal(decodeInputs('?runFeet=15').runFeet, 15);
  const encoded = encodeInputs({ ...defaultInputs(), proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
