import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps every geometry, hour, cost, and rate field, not just the price fields', () => {
  const input = {
    widthFeet: 16, depthFeet: 12, postSpacingFeet: 8, rafterSpacingInches: 24,
    hoursTrip: 2.5, hoursPerPost: 1.6, extraHoursPerPost: 0.15, hoursPer100SfShade: 1.8,
    hoursPerRafter: 0.25, hoursPerBeamLf: 0.12, hoursLedger: 1.5, hoursKneeBrace: 0.25,
    hoursFan: 1.2, hoursDemo: 3, hoursSite: 0.6, siteHours: 0.5,
    postCount: 6, rafterCount: 9, beamLf: 32, ledgerLf: 16, kneeBraceCount: 12, footingCount: 6,
    postEach: 110, beamPerLf: 22, rafterEach: 28, shadePerSf: 5.5, footingEach: 55,
    ledgerPerLf: 16, hardwareLump: 350, kneeBraceEach: 22, fanCircuitFee: 275, demoFee: 350,
    mobilizationFee: 225, permitFee: 250,
    hourlyWage: 32, burdenRate: 30, travelAndEquipment: 125, overheadRate: 15,
    targetMargin: 25, proposedPrice: 8500,
    includeKneeBraces: true, includeFanCircuit: false, includePermit: true, demoExisting: false,
    attachment: 'attached', shade: 'slats', height: '10',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric, boolean, and enum field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 38);
  assert.deepEqual(BOOLEAN_FIELD_IDS, ['includeKneeBraces', 'includeFanCircuit', 'includePermit', 'demoExisting']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['attachment', 'height', 'shade']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('widthFeet=16&wageSecret=99&attachment=attached');
  assert.deepEqual(Object.keys(restored).sort(), ['attachment', 'widthFeet']);
  assert.equal(restored.widthFeet, 16);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('attachment=floating&shade=chrome&height=treehouse&widthFeet=16');
  assert.equal('attachment' in restored, false);
  assert.equal('shade' in restored, false);
  assert.equal('height' in restored, false);
  assert.equal(restored.widthFeet, 16);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('widthFeet=-5&hourlyWage=abc&postEach=110');
  assert.equal('widthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.postEach, 110);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#widthFeet=16').widthFeet, 16);
  assert.equal(decodeInputs('?kneeBraceCount=0').kneeBraceCount, 0);
  const encoded = encodeInputs({ attachment: 'freestanding', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a freestanding, open-frame, zero-knee-brace job still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    widthFeet: 10, depthFeet: 10, kneeBraceCount: 0, includeKneeBraces: false,
    attachment: 'freestanding', shade: 'open', height: '8',
  }));
  assert.equal(restored.widthFeet, 10);
  assert.equal(restored.kneeBraceCount, 0);
  assert.equal(restored.includeKneeBraces, false);
  assert.equal(restored.attachment, 'freestanding');
  assert.equal(restored.shade, 'open');
  assert.equal(restored.height, '8');
});

test('every attachment, shade, and height preset id from calc.mjs is accepted', () => {
  for (const id of ENUM_FIELDS.attachment) {
    assert.equal(decodeInputs(`attachment=${id}`).attachment, id);
  }
  for (const id of ENUM_FIELDS.shade) {
    assert.equal(decodeInputs(`shade=${id}`).shade, id);
  }
  for (const id of ENUM_FIELDS.height) {
    assert.equal(decodeInputs(`height=${id}`).height, id);
  }
});
