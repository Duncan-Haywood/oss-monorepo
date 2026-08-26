import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs } from './share.mjs';
import { defaultInputs } from './calc.mjs';

test('a round trip keeps the attic tankless, the 3/4 in upsize, and the recirc, not just the gallons', () => {
  const input = {
    ...defaultInputs(),
    heaterType: 'tankless_gas',
    tanklessGpm: 9,
    location: 'attic',
    venting: 'concentric_condensing',
    ventFeet: 25,
    gasLine: 'upsize_3_4',
    gasLineFeet: 35,
    recirc: 1,
    proposedPrice: 4800,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.heaterType, 'tankless_gas');
  assert.equal(restored.tanklessGpm, 9);
  assert.equal(restored.location, 'attic');
  assert.equal(restored.gasLine, 'upsize_3_4');
  assert.equal(restored.gasLineFeet, 35);
  assert.equal(restored.recirc, 1);
  assert.equal(restored.proposedPrice, 4800);
});

test('unknown query keys are ignored so a stale link cannot inject fields', () => {
  const restored = decodeInputs('heaterType=tank_electric&wageSecret=99&location=garage');
  assert.deepEqual(Object.keys(restored).sort(), ['heaterType', 'location']);
  assert.equal(restored.heaterType, 'tank_electric');
});

test('hash or query prefixes and empty proposed prices do not break the decoder', () => {
  assert.equal(decodeInputs('#capacityGallons=40').capacityGallons, 40);
  assert.equal(decodeInputs('?gasLineFeet=18').gasLineFeet, 18);
  const encoded = encodeInputs({ ...defaultInputs(), proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
