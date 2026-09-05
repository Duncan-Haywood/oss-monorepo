import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the method, access, void, and extras fields, not just the price fields', () => {
  const input = {
    method: 'poly',
    access: 'yard',
    slabSqFt: 400,
    voidInches: 4,
    extraHoles: 6,
    hoursTrip: 1.2,
    hoursLift: 0.8,
    hoursAccess: 1.6,
    hoursPerCf: 0.09,
    hoursPerExtraHole: 0.35,
    hoursSeal: 1.1,
    hoursInterior: 2.2,
    siteHours: 0.4,
    materialPerCf: 48,
    extraHoleCost: 45,
    sealCost: 180,
    interiorKit: 240,
    mobilizationFee: 175,
    permitFee: 0,
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 95,
    overheadRate: 16,
    targetMargin: 30,
    proposedPrice: 3600,
    addSeal: true,
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
  assert.ok(NUMBER_FIELD_IDS.length >= 22);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addSeal'].sort());
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('slabSqFt=280&wageSecret=99&method=mud');
  assert.deepEqual(Object.keys(restored).sort(), ['method', 'slabSqFt']);
  assert.equal(restored.slabSqFt, 280);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('method=lasers&access=yard');
  assert.equal('method' in restored, false);
  assert.equal(restored.access, 'yard');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('slabSqFt=-5&hourlyWage=abc&extraHoleCost=45');
  assert.equal('slabSqFt' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.extraHoleCost, 45);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#slabSqFt=280').slabSqFt, 280);
  assert.equal(decodeInputs('?extraHoleCost=45').extraHoleCost, 45);
  const encoded = encodeInputs({ method: 'mud', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a zero void depth still travels -- pump hours are the void, not an error', () => {
  const restored = decodeInputs(encodeInputs({ voidInches: 0, slabSqFt: 80 }));
  assert.equal(restored.voidInches, 0);
  assert.equal(restored.slabSqFt, 80);
});
