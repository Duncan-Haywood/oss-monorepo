import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps access, every flag, and every rate field, not just the price fields', () => {
  const input = {
    tankGallons: 1250,
    extraTankGallons: 750,
    extraTankCount: 1,
    hoseFeet: 90,
    riserCount: 2,
    includedGallons: 1000,
    includedHoseFeet: 50,
    hoursBasePump: 1,
    hoursPerExtra100Gal: 0.2,
    hoursBuriedLid: 1.25,
    hoursPerHoseFoot: 0.01,
    hoursPerExtraTank: 0.75,
    hoursBaffles: 0.75,
    hoursPerRiser: 0.6,
    hoursInspection: 0.5,
    hoursAfterHours: 0.5,
    siteHours: 0.75,
    dumpTripFee: 95,
    disposalPerGallon: 0.09,
    baffleKitCost: 85,
    riserCostEach: 145,
    afterHoursFee: 125,
    permitFee: 45,
    hourlyWage: 38,
    burdenRate: 32,
    travelAndEquipment: 55,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 900,
    replaceBaffles: true,
    inspectionReport: false,
    afterHours: true,
    access: 'buried',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['afterHours', 'inspectionReport', 'replaceBaffles']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['access']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('tankGallons=1000&wageSecret=99&access=buried');
  assert.deepEqual(Object.keys(restored).sort(), ['access', 'tankGallons']);
  assert.equal(restored.tankGallons, 1000);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('access=underground&tankGallons=1000');
  assert.equal('access' in restored, false);
  assert.equal(restored.tankGallons, 1000);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('tankGallons=-5&hourlyWage=abc&hoseFeet=40');
  assert.equal('tankGallons' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.hoseFeet, 40);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#tankGallons=1000').tankGallons, 1000);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ access: 'exposed', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the brochure special (zero extras) and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    tankGallons: 1000, extraTankGallons: 0, extraTankCount: 0, hoseFeet: 40, riserCount: 0,
    includedGallons: 1000, includedHoseFeet: 50,
    replaceBaffles: false, inspectionReport: false, afterHours: false,
    access: 'exposed',
  }));
  assert.equal(restored.tankGallons, 1000);
  assert.equal(restored.extraTankGallons, 0);
  assert.equal(restored.replaceBaffles, false);
  assert.equal(restored.inspectionReport, false);
  assert.equal(restored.afterHours, false);
  assert.equal(restored.access, 'exposed');
});
