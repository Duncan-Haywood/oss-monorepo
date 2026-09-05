import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps work, access, line, every flag, and every rate field, not just the price fields', () => {
  const input = {
    lineFeet: 140,
    includedFootage: 50,
    hoseRunFeet: 150,
    includedHoseFeet: 50,
    hoursTrip: 0.5,
    hoursCameraBase: 0.75,
    hoursCableBase: 0,
    hoursJetBase: 1.25,
    hoursPerExtraFoot: 0.03,
    hoursToiletPull: 0.75,
    hoursNewCleanout: 2.5,
    hoursRoofVent: 1.25,
    hoursRootCut: 0.5,
    hoursGreasePass: 0.4,
    hoursSecondLine: 0.6,
    hoursPerExtraHoseFoot: 0.01,
    siteHours: 0.5,
    cameraWear: 35,
    cableWear: 15,
    jetWear: 45,
    waxRing: 12,
    cleanoutFitting: 85,
    rootCutterRental: 60,
    permitFee: 0,
    hourlyWage: 40,
    burdenRate: 30,
    travelAndEquipment: 90,
    overheadRate: 17,
    targetMargin: 32,
    proposedPrice: 850,
    hasRoots: true,
    hasGrease: false,
    extraLine: false,
    work: 'combo',
    access: 'toilet-pull',
    line: 'main',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 25);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['extraLine', 'hasGrease', 'hasRoots']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['access', 'line', 'work']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lineFeet=75&wageSecret=99&work=combo');
  assert.deepEqual(Object.keys(restored).sort(), ['lineFeet', 'work']);
  assert.equal(restored.lineFeet, 75);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('work=vacuum&access=window&line=vent&lineFeet=75');
  assert.equal('work' in restored, false);
  assert.equal('access' in restored, false);
  assert.equal('line' in restored, false);
  assert.equal(restored.lineFeet, 75);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('lineFeet=-5&hourlyWage=abc&permitFee=75');
  assert.equal('lineFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lineFeet=75').lineFeet, 75);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ work: 'camera', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a camera-only job (no cable, no jet, no roots, no grease, one line) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    lineFeet: 50, includedFootage: 50, hoseRunFeet: 40, includedHoseFeet: 50,
    hasRoots: false, hasGrease: false, extraLine: false,
    work: 'camera', access: 'cleanout', line: 'branch',
  }));
  assert.equal(restored.lineFeet, 50);
  assert.equal(restored.hasRoots, false);
  assert.equal(restored.extraLine, false);
  assert.equal(restored.work, 'camera');
  assert.equal(restored.access, 'cleanout');
  assert.equal(restored.line, 'branch');
});
