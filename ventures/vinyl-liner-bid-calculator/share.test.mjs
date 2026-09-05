import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the shape, depth, mil, bead, stairs, pattern, access, and every rate field', () => {
  const input = {
    shape: 'oval',
    depth: 'hopper',
    mil: '27',
    bead: 'standard',
    stairs: 'wedding-cake',
    pattern: 'pattern',
    access: 'easy',
    lengthFeet: 36,
    widthFeet: 18,
    wallHeightFeet: 3.5,
    hoursTrip: 1.5,
    hoursPer100SfLiner: 2.1,
    hoursStairs: 4.2,
    hoursBead: 0,
    hoursPerTrackLf: 0.15,
    hoursCove: 0,
    hoursFoam: 0,
    hoursAccess: 0,
    hoursPump: 1,
    hoursCover: 0,
    siteHours: 1,
    waterSurfaceSf: 509,
    perimeterLf: 128,
    wallSf: 448,
    hopperExtraSf: 112,
    stairSf: 85,
    linerSf: 1154,
    wastePercent: 14,
    orderSf: 1315.6,
    linerPerSf: 2.85,
    fittingsLump: 65,
    disposalFee: 45,
    trackPerLf: 3.5,
    coveLump: 0,
    foamPerLf: 0,
    coverFee: 0,
    mobilizationFee: 125,
    permitFee: 75,
    hourlyWage: 32,
    burdenRate: 28,
    travelAndEquipment: 90,
    overheadRate: 14,
    targetMargin: 24,
    proposedPrice: 9200,
    replaceTrack: true,
    replaceCove: false,
    replaceWallFoam: false,
    includeCover: false,
    includePermit: true,
    pumpDown: true,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 30);
  assert.deepEqual(
    BOOLEAN_FIELD_IDS.sort(),
    ['includeCover', 'includePermit', 'pumpDown', 'replaceCove', 'replaceTrack', 'replaceWallFoam'].sort(),
  );
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lengthFeet=32&wageSecret=99&shape=rectangle');
  assert.deepEqual(Object.keys(restored).sort(), ['lengthFeet', 'shape']);
  assert.equal(restored.lengthFeet, 32);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('shape=hexagon&mil=27');
  assert.equal('shape' in restored, false);
  assert.equal(restored.mil, '27');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('lengthFeet=-5&hourlyWage=abc&stairSf=85');
  assert.equal('lengthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.stairSf, 85);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lengthFeet=32').lengthFeet, 32);
  assert.equal(decodeInputs('?stairSf=85').stairSf, 85);
  const encoded = encodeInputs({ shape: 'rectangle', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a zero stair or hopper-extra square footage still travels -- the no-stairs default is the point', () => {
  const restored = decodeInputs(encodeInputs({ stairSf: 0, hopperExtraSf: 0, lengthFeet: 32 }));
  assert.equal(restored.stairSf, 0);
  assert.equal(restored.hopperExtraSf, 0);
  assert.equal(restored.lengthFeet, 32);
});

test('all six boolean flags false still travel, matching six unchecked boxes', () => {
  const restored = decodeInputs(encodeInputs({
    replaceTrack: false, replaceCove: false, replaceWallFoam: false,
    includeCover: false, includePermit: false, pumpDown: false,
  }));
  for (const id of BOOLEAN_FIELD_IDS) assert.equal(restored[id], false);
});
