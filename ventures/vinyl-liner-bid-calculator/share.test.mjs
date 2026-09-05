import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps shape, depth, mil, bead, stairs, pattern, access, every flag, and every rate field, not just the price fields', () => {
  const input = {
    lengthFeet: 36,
    widthFeet: 18,
    wallHeightFeet: 3.5,
    hoursTrip: 3.5,
    hoursPer100SfLiner: 2.1,
    hoursStairs: 4.2,
    hoursBead: 2.5,
    hoursPerTrackLf: 0.12,
    hoursCove: 2.4,
    hoursFoam: 3.2,
    hoursAccess: 2.5,
    hoursPump: 2.5,
    hoursCover: 1.4,
    siteHours: 1,
    waterSurfaceSf: 620,
    perimeterLf: 108,
    wallSf: 378,
    hopperExtraSf: 136.4,
    stairSf: 85,
    linerSf: 1219.4,
    wastePercent: 14,
    orderSf: 1390.116,
    linerPerSf: 2.85,
    fittingsLump: 210,
    disposalFee: 110,
    trackPerLf: 8.5,
    coveLump: 320,
    foamPerLf: 4.25,
    coverFee: 480,
    mobilizationFee: 225,
    permitFee: 185,
    hourlyWage: 32,
    burdenRate: 30,
    travelAndEquipment: 150,
    overheadRate: 15,
    targetMargin: 26,
    proposedPrice: 8500,
    replaceTrack: true,
    replaceCove: true,
    replaceWallFoam: true,
    includeCover: true,
    includePermit: true,
    pumpDown: true,
    shape: 'oval',
    depth: 'hopper',
    mil: '27',
    bead: 'standard',
    stairs: 'wedding-cake',
    pattern: 'pattern',
    access: 'easy',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 30);
  assert.deepEqual(
    BOOLEAN_FIELD_IDS.sort(),
    ['includeCover', 'includePermit', 'pumpDown', 'replaceCove', 'replaceTrack', 'replaceWallFoam'],
  );
  assert.deepEqual(
    Object.keys(ENUM_FIELDS).sort(),
    ['access', 'bead', 'depth', 'mil', 'pattern', 'shape', 'stairs'],
  );
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lengthFeet=30&wageSecret=99&shape=rectangle');
  assert.deepEqual(Object.keys(restored).sort(), ['lengthFeet', 'shape']);
  assert.equal(restored.lengthFeet, 30);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs(
    'shape=round&depth=deep&mil=40&bead=glue&stairs=spiral&pattern=marble&access=crane&lengthFeet=30',
  );
  for (const id of Object.keys(ENUM_FIELDS)) {
    assert.equal(id in restored, false, `${id} should have been dropped`);
  }
  assert.equal(restored.lengthFeet, 30);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0" (or min="8" for spans)', () => {
  const restored = decodeInputs('lengthFeet=-5&hourlyWage=abc&permitFee=75');
  assert.equal('lengthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lengthFeet=30').lengthFeet, 30);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ shape: 'rectangle', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the brochure special (no track, cove, foam, cover, or permit replaced) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    lengthFeet: 32, widthFeet: 16, wallHeightFeet: 3.5,
    stairSf: 0, hoursStairs: 0, hoursBead: 0,
    replaceTrack: false, replaceCove: false, replaceWallFoam: false,
    includeCover: false, includePermit: false, pumpDown: true,
    shape: 'rectangle', depth: 'hopper', mil: '20', bead: 'standard', stairs: 'none',
    pattern: 'solid', access: 'easy',
  }));
  assert.equal(restored.lengthFeet, 32);
  assert.equal(restored.stairSf, 0);
  assert.equal(restored.replaceTrack, false);
  assert.equal(restored.pumpDown, true);
  assert.equal(restored.shape, 'rectangle');
  assert.equal(restored.stairs, 'none');
  assert.equal(restored.pattern, 'solid');
});
