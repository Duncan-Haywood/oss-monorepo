import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps shape, finish, chip-out, every flag, and every rate field, not just the price fields', () => {
  const input = {
    lengthFt: 36,
    widthFt: 18,
    shallowFt: 3.5,
    deepFt: 8.5,
    waterSurfaceSf: 620,
    freeformMultiplier: 1.85,
    chipoutSf: 220,
    spaSf: 80,
    stepBenches: 4,
    waterlineTileLf: 90,
    copingLf: 90,
    stepSfEach: 12,
    hoursPerPlasterSf: 0.075,
    hoursPerChipoutSf: 0.14,
    hoursPerSpa: 6,
    hoursPerStep: 1.5,
    hoursPerTileLf: 0.18,
    hoursPerCopingLf: 0.22,
    hoursDrainRefill: 3.5,
    hoursAcidWash: 2.5,
    siteHours: 2,
    finishPerSf: 6.2,
    tilePerLf: 18,
    copingPerLf: 22,
    dumpsterCost: 650,
    waterPerGallon: 0.012,
    acidWashChem: 85,
    permitFee: 125,
    hourlyWage: 36,
    burdenRate: 30,
    travelAndEquipment: 180,
    overheadRate: 15,
    targetMargin: 26,
    proposedPrice: 8500,
    drainRefill: true,
    acidWash: true,
    shape: 'freeform',
    finish: 'pebble',
    chipout: 'full',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['acidWash', 'drainRefill']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['chipout', 'finish', 'shape']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lengthFt=30&wageSecret=99&shape=rectangle');
  assert.deepEqual(Object.keys(restored).sort(), ['lengthFt', 'shape']);
  assert.equal(restored.lengthFt, 30);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('shape=oval&finish=gunite&chipout=laser&lengthFt=30');
  assert.equal('shape' in restored, false);
  assert.equal('finish' in restored, false);
  assert.equal('chipout' in restored, false);
  assert.equal(restored.lengthFt, 30);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('lengthFt=-5&hourlyWage=abc&permitFee=75');
  assert.equal('lengthFt' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lengthFt=30').lengthFt, 30);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ shape: 'rectangle', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the brochure special (no chip-out, no spa, no steps, no tile, no coping) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    lengthFt: 32, widthFt: 16, shallowFt: 3.5, deepFt: 8,
    chipoutSf: 0, spaSf: 0, stepBenches: 0, waterlineTileLf: 0, copingLf: 0,
    hoursPerChipoutSf: 0, dumpsterCost: 0,
    drainRefill: true, acidWash: false,
    shape: 'rectangle', finish: 'white-plaster', chipout: 'none',
  }));
  assert.equal(restored.lengthFt, 32);
  assert.equal(restored.chipoutSf, 0);
  assert.equal(restored.drainRefill, true);
  assert.equal(restored.acidWash, false);
  assert.equal(restored.shape, 'rectangle');
  assert.equal(restored.finish, 'white-plaster');
  assert.equal(restored.chipout, 'none');
});
