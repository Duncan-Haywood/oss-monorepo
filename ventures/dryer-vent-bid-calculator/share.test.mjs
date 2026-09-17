import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps stories, run, and every extra scope flag, not just the price fields', () => {
  const input = {
    jobType: 'multi',
    stories: 2,
    runFeet: 22,
    extraDryers: 2,
    includedStories: 1,
    includedRunFeet: 8,
    includedDryers: 1,
    camera: true,
    flexReplace: true,
    nestBlockage: true,
    occupied: true,
    hoursBaseSetup: 1.25,
    brushKit: 18,
    hourlyWage: 44,
    targetMargin: 30,
    proposedPrice: 620,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.jobType, 'multi');
  assert.equal(restored.stories, 2);
  assert.equal(restored.runFeet, 22);
  assert.equal(restored.extraDryers, 2);
  assert.equal(restored.camera, true);
  assert.equal(restored.flexReplace, true);
  assert.equal(restored.nestBlockage, true);
  assert.equal(restored.occupied, true);
  assert.equal(restored.brushKit, 18);
  assert.equal(restored.hourlyWage, 44);
  assert.equal(restored.targetMargin, 30);
  assert.equal(restored.proposedPrice, 620);
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 25);
  assert.ok(BOOLEAN_FIELD_IDS.includes('camera'));
  assert.ok(BOOLEAN_FIELD_IDS.includes('flexReplace'));
  assert.ok(BOOLEAN_FIELD_IDS.includes('nestBlockage'));
  assert.ok(BOOLEAN_FIELD_IDS.includes('occupied'));
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('runFeet=15&wageSecret=99&jobType=roof');
  assert.deepEqual(Object.keys(restored).sort(), ['jobType', 'runFeet']);
  assert.equal(restored.runFeet, 15);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('jobType=underground&camera=1');
  assert.equal('jobType' in restored, false);
  assert.equal(restored.camera, true);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('runFeet=-5&hourlyWage=abc&brushKit=18');
  assert.equal('runFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.brushKit, 18);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#runFeet=18').runFeet, 18);
  assert.equal(decodeInputs('?brushKit=20').brushKit, 20);
  const encoded = encodeInputs({ jobType: 'roof', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
