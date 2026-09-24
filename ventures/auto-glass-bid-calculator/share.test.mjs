import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps position, source, calibration, service, payer, every flag, and every rate field', () => {
  const input = {
    hoursRR: 1.1,
    hoursCalibration: 1.7,
    tripHours: 0.35,
    wiperServiceHours: 0.1,
    siteHours: 0.25,
    glassCost: 650,
    moldingCost: 35,
    urethaneKitCost: 30,
    calibrationCost: 210,
    tripFee: 45,
    wiperServiceCost: 12,
    hourlyWage: 32,
    burdenRate: 24,
    travelAndEquipment: 30,
    overheadRate: 15,
    targetMargin: 35,
    cashDiscountPercent: 15,
    deductible: 100,
    proposedPrice: 1800,
    addWiperService: true,
    position: 'windshield',
    glassSource: 'oem',
    calibration: 'dual',
    service: 'mobile',
    payer: 'insurance',
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric, boolean, and enum field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link.
  assert.ok(NUMBER_FIELD_IDS.length >= 18);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addWiperService']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['calibration', 'glassSource', 'payer', 'position', 'service']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('glassCost=240&wageSecret=99&position=windshield');
  assert.deepEqual(Object.keys(restored).sort(), ['glassCost', 'position']);
  assert.equal(restored.glassCost, 240);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('position=sunroof&glassSource=stolen&calibration=psychic&service=teleport&payer=crypto&glassCost=240');
  assert.equal('position' in restored, false);
  assert.equal('glassSource' in restored, false);
  assert.equal('calibration' in restored, false);
  assert.equal('service' in restored, false);
  assert.equal('payer' in restored, false);
  assert.equal(restored.glassCost, 240);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('glassCost=-5&hourlyWage=abc&moldingCost=35');
  assert.equal('glassCost' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.moldingCost, 35);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#glassCost=240').glassCost, 240);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ position: 'windshield', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the no-ADAS in-shop cash job (zero calibration, zero trip) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    hoursCalibration: 0, tripHours: 0, calibrationCost: 0, tripFee: 0,
    addWiperService: false,
    position: 'windshield', glassSource: 'economy', calibration: 'none', service: 'in-shop', payer: 'cash',
  }));
  assert.equal(restored.hoursCalibration, 0);
  assert.equal(restored.tripFee, 0);
  assert.equal(restored.addWiperService, false);
  assert.equal(restored.position, 'windshield');
  assert.equal(restored.calibration, 'none');
  assert.equal(restored.payer, 'cash');
});
