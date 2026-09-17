import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps the pier count, depth, straps, every flag, and every rate field, not just the price fields', () => {
  const input = {
    pierCount: 6,
    averageDepthFt: 14,
    depthIncludedFt: 10,
    carbonFiberStraps: 4,
    steelIBeams: 2,
    gradeBeamLf: 20,
    slabJackingSqFt: 150,
    hoursPerPier: 2.4,
    hoursPerDepthFt: 0.08,
    hoursInteriorPerPier: 1.6,
    hoursPoorAccess: 3.5,
    hoursPerStrap: 2.8,
    hoursPerIBeam: 4.2,
    hoursPerGradeBeamLf: 0.45,
    hoursPer100Slab: 1.8,
    hoursEngineering: 2.5,
    hoursPlumbingReroute: 3.5,
    siteHours: 3,
    pierCostEach: 420,
    extraDepthCostPerFt: 18,
    interiorBracketCost: 95,
    strapCostEach: 185,
    iBeamCostEach: 420,
    gradeBeamCostPerLf: 28,
    slabJackCostPerSqFt: 8,
    engineeringFee: 850,
    permitFee: 275,
    plumbingAllowance: 650,
    hourlyWage: 42,
    burdenRate: 34,
    travelAndEquipment: 285,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 11800,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    plumbingReroute: true,
    methodId: 'helical',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 34);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['engineeringStamp', 'interiorAccess', 'plumbingReroute', 'poorAccess']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['methodId']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('pierCount=6&wageSecret=99&methodId=push');
  assert.deepEqual(Object.keys(restored).sort(), ['methodId', 'pierCount']);
  assert.equal(restored.pierCount, 6);
});

test('an unknown method value is dropped rather than accepted', () => {
  const restored = decodeInputs('methodId=magic-piers&pierCount=8');
  assert.equal('methodId' in restored, false);
  assert.equal(restored.pierCount, 8);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('pierCount=-5&hourlyWage=abc&steelIBeams=4');
  assert.equal('pierCount' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.steelIBeams, 4);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#pierCount=8').pierCount, 8);
  assert.equal(decodeInputs('?steelIBeams=0').steelIBeams, 0);
  const encoded = encodeInputs({ methodId: 'wall_stabilize', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a wall-only job (zero piers) and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    pierCount: 0, carbonFiberStraps: 8, interiorAccess: false, poorAccess: false,
    engineeringStamp: false, plumbingReroute: false, gradeBeamLf: 0,
  }));
  assert.equal(restored.pierCount, 0);
  assert.equal(restored.carbonFiberStraps, 8);
  assert.equal(restored.interiorAccess, false);
  assert.equal(restored.poorAccess, false);
  assert.equal(restored.engineeringStamp, false);
  assert.equal(restored.plumbingReroute, false);
  assert.equal(restored.gradeBeamLf, 0);
});
