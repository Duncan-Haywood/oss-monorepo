import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps capacity, equipment, location, every flag, and every rate field, not just the price fields', () => {
  const input = {
    ductFeet: 40,
    includedDuctFeet: 15,
    hoursTrip: 1,
    hoursFurnaceBase: 5.25,
    hoursLocation: 2,
    hoursPerExtraDuctFoot: 0.12,
    hoursCoil: 2.25,
    hoursGas: 1.5,
    hoursHaul: 0.75,
    hoursThermostat: 0.6,
    siteHours: 0.75,
    furnaceCost: 2280,
    furnacePremium: 400,
    coilCost: 920,
    gasCost: 220,
    ductPerFoot: 12,
    haulFee: 125,
    thermostatCost: 260,
    permitFee: 175,
    hourlyWage: 52,
    burdenRate: 34,
    travelAndEquipment: 155,
    overheadRate: 18,
    targetMargin: 35,
    proposedPrice: 11800,
    addCoil: true,
    addGas: true,
    haulAway: true,
    addThermostat: true,
    capacity: '100k',
    equipment: 'condensing',
    location: 'attic',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 24);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addCoil', 'addGas', 'addThermostat', 'haulAway']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['capacity', 'equipment', 'location']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('ductFeet=40&wageSecret=99&capacity=100k');
  assert.deepEqual(Object.keys(restored).sort(), ['capacity', 'ductFeet']);
  assert.equal(restored.ductFeet, 40);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('capacity=200k&equipment=oil&location=roof&ductFeet=8');
  assert.equal('capacity' in restored, false);
  assert.equal('equipment' in restored, false);
  assert.equal('location' in restored, false);
  assert.equal(restored.ductFeet, 8);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('ductFeet=-5&hourlyWage=abc&furnaceCost=2280');
  assert.equal('ductFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.furnaceCost, 2280);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#ductFeet=40').ductFeet, 40);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ capacity: '60k', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a brochure basement swap (zero extra duct) and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    ductFeet: 12, includedDuctFeet: 15, addCoil: false, addGas: false,
    haulAway: false, addThermostat: false, capacity: '60k', equipment: 'eighty',
    location: 'basement',
  }));
  assert.equal(restored.ductFeet, 12);
  assert.equal(restored.includedDuctFeet, 15);
  assert.equal(restored.addCoil, false);
  assert.equal(restored.addGas, false);
  assert.equal(restored.haulAway, false);
  assert.equal(restored.addThermostat, false);
  assert.equal(restored.capacity, '60k');
  assert.equal(restored.equipment, 'eighty');
  assert.equal(restored.location, 'basement');
});
