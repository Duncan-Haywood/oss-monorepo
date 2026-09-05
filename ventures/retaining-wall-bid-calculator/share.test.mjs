import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps every length, height, drainage, geogrid, corner, and rate field, not just the price fields', () => {
  const input = {
    lengthFeet: 62,
    exposedHeightFeet: 5,
    embedmentFeet: 0.75,
    blockCostPerSf: 15,
    capCostPerFoot: 9,
    stoneCostPerCuYd: 60,
    stoneDepthFeet: 1.25,
    drainPipeCostPerFoot: 4.5,
    geogridLayers: 2,
    geogridDepthFeet: 7,
    geogridCostPerSqYd: 4.5,
    wallTypeFactor: 1.3,
    heightFactor: 1.25,
    hoursPerFaceSqFt: 0.11,
    corners: 2,
    hoursPerCorner: 1.75,
    excavationHours: 10,
    drainHours: 3,
    hourlyWage: 40,
    burdenRate: 32,
    engineerAndPermitFee: 1800,
    travelAndEquipment: 175,
    overheadRate: 16,
    targetMargin: 24,
    proposedPrice: 15200,
    wallTypePreset: 'boulder',
    heightPreset: 'mid',
    engineerPreset: 'engineer',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric and enum field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 24);
  assert.deepEqual(BOOLEAN_FIELD_IDS, []);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['engineerPreset', 'heightPreset', 'wallTypePreset']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lengthFeet=60&wageSecret=99&wallTypePreset=timber');
  assert.deepEqual(Object.keys(restored).sort(), ['lengthFeet', 'wallTypePreset']);
  assert.equal(restored.lengthFeet, 60);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('wallTypePreset=titanium&heightPreset=skyscraper&engineerPreset=bribe&lengthFeet=60');
  assert.equal('wallTypePreset' in restored, false);
  assert.equal('heightPreset' in restored, false);
  assert.equal('engineerPreset' in restored, false);
  assert.equal(restored.lengthFeet, 60);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('lengthFeet=-5&hourlyWage=abc&capCostPerFoot=9');
  assert.equal('lengthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.capCostPerFoot, 9);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lengthFeet=60').lengthFeet, 60);
  assert.equal(decodeInputs('?corners=0').corners, 0);
  const encoded = encodeInputs({ wallTypePreset: 'segmental', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a zero-corner, zero-geogrid garden wall still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    lengthFeet: 40, exposedHeightFeet: 3, embedmentFeet: 0.67, corners: 0, geogridLayers: 0,
    excavationHours: 4, wallTypePreset: 'segmental', heightPreset: 'garden', engineerPreset: 'none',
  }));
  assert.equal(restored.lengthFeet, 40);
  assert.equal(restored.corners, 0);
  assert.equal(restored.geogridLayers, 0);
  assert.equal(restored.wallTypePreset, 'segmental');
  assert.equal(restored.heightPreset, 'garden');
  assert.equal(restored.engineerPreset, 'none');
});

test('every wall-type, height, and engineer preset id from calc.mjs is accepted', () => {
  for (const id of ENUM_FIELDS.wallTypePreset) {
    assert.equal(decodeInputs(`wallTypePreset=${id}`).wallTypePreset, id);
  }
  for (const id of ENUM_FIELDS.heightPreset) {
    assert.equal(decodeInputs(`heightPreset=${id}`).heightPreset, id);
  }
  for (const id of ENUM_FIELDS.engineerPreset) {
    assert.equal(decodeInputs(`engineerPreset=${id}`).engineerPreset, id);
  }
});
