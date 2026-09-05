import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps the slab, coating system, prep, crack/pit repair, moisture barrier, and every rate field, not just the price fields', () => {
  const input = {
    width: 24,
    length: 22,
    crackLinearFeet: 40,
    pitSquareFeet: 6,
    coatingPerSqFt: 2.85,
    flakeLbPerSqFt: 0.2,
    flakePricePerLb: 4.5,
    moisturePerSqFt: 1.1,
    crackFillPerLf: 1.25,
    pitFillPerSf: 4,
    prepSqFtPerHour: 80,
    coatSqFtPerHour: 220,
    hourlyWage: 45,
    burdenRate: 22,
    otherJobCost: 40,
    roundTripMiles: 30,
    travelMph: 35,
    vehiclePerMile: 0.85,
    overheadRate: 15,
    targetMargin: 35,
    proposedPrice: 2600,
    moistureBarrier: true,
    garageId: '2.5-car',
    systemId: 'full-flake',
    prepId: 'full-grind',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 20);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['moistureBarrier']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['garageId', 'prepId', 'systemId']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('width=24&wageSecret=99&systemId=metallic');
  assert.deepEqual(Object.keys(restored).sort(), ['systemId', 'width']);
  assert.equal(restored.width, 24);
});

test('an unknown enum value is dropped rather than accepted, for each of the three selects', () => {
  const restored = decodeInputs('garageId=4-car&systemId=urethane&prepId=sandblast&width=20');
  assert.equal('garageId' in restored, false);
  assert.equal('systemId' in restored, false);
  assert.equal('prepId' in restored, false);
  assert.equal(restored.width, 20);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('crackLinearFeet=-5&hourlyWage=abc&pitSquareFeet=6');
  assert.equal('crackLinearFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.pitSquareFeet, 6);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#crackLinearFeet=40').crackLinearFeet, 40);
  assert.equal(decodeInputs('?pitSquareFeet=6').pitSquareFeet, 6);
  const encoded = encodeInputs({ garageId: '2-car', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('pit square feet of zero and moistureBarrier false still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({ pitSquareFeet: 0, moistureBarrier: false, crackLinearFeet: 0 }));
  assert.equal(restored.pitSquareFeet, 0);
  assert.equal(restored.moistureBarrier, false);
  assert.equal(restored.crackLinearFeet, 0);
});
