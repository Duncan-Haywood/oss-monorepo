import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs } from './share.mjs';
import { INPUT_FIELDS } from './calc.mjs';

function sampleInput() {
  return {
    cameraCount: 12,
    resolution: '8mp',
    codec: 'h265plus',
    recordingMode: 'motion',
    motionPercent: 35,
    recordHoursPerDay: 24,
    retentionDays: 45,
    driveSizeTb: 12,
    driveCount: 2,
    switchPoeBudgetWatts: 190,
    cameraWatts: 13,
    construction: 'masonry',
    avgCableFeet: 140,
    longestRunFeet: 260,
    liftRequired: 'yes',
    cameraHardware: 210,
    nvrHardware: 900,
    switchHardware: 420,
    drivePricePerTb: 21,
    cablePricePerFoot: 0.25,
    otherMaterials: 175,
    hoursPerDrop: 3.5,
    commissioningHours: 6,
    otherHours: 1,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 14,
    targetMargin: 38,
    permitFee: 150,
    proposedPrice: 9800,
  };
}

test('every INPUT_FIELDS entry has an allowlist rule so a new field cannot be silently dropped', () => {
  const encoded = encodeInputs(sampleInput());
  const restored = decodeInputs(encoded);
  for (const field of INPUT_FIELDS) {
    assert.ok(field in restored, `share link dropped ${field}`);
  }
});

test('a round trip keeps the masonry construction, the lift, and the 12 TB drive size, not just the camera count', () => {
  const input = sampleInput();
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.construction, 'masonry');
  assert.equal(restored.liftRequired, 'yes');
  assert.equal(restored.driveSizeTb, 12);
  assert.equal(restored.recordingMode, 'motion');
  assert.equal(restored.longestRunFeet, 260);
  assert.equal(restored.proposedPrice, 9800);
});

test('unknown query keys are ignored so a stale or tampered link cannot inject fields', () => {
  const restored = decodeInputs('cameraCount=6&wageSecret=999&resolution=4mp');
  assert.deepEqual(Object.keys(restored).sort(), ['cameraCount', 'resolution']);
  assert.equal(restored.cameraCount, 6);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#cameraCount=8').cameraCount, 8);
  assert.equal(decodeInputs('?retentionDays=30').retentionDays, 30);
  const encoded = encodeInputs({ ...sampleInput(), proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a negative or non-numeric value for a numeric field is dropped rather than carried as garbage', () => {
  const restored = decodeInputs('cameraCount=-3&retentionDays=abc&driveCount=4');
  assert.equal('cameraCount' in restored, false);
  assert.equal('retentionDays' in restored, false);
  assert.equal(restored.driveCount, 4);
});

test('a blank hoursPerDrop is not encoded as the number zero', () => {
  // `Number('')` is 0 in JavaScript. `hoursPerDrop` left blank means "use the
  // construction-type preset"; an explicit 0 means "this drop takes no
  // labour at all". Confusing the two would let a shared link silently
  // recompute a much smaller labour cost than the sender saw.
  const withBlankOverride = { ...sampleInput(), hoursPerDrop: '' };
  const encoded = encodeInputs(withBlankOverride);
  assert.equal(encoded.includes('hoursPerDrop='), false, encoded);
  assert.equal(decodeInputs(encoded).hoursPerDrop, undefined);
});
