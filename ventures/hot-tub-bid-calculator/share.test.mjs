import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps every hour, cost, and rate field, not just the price fields', () => {
  const input = {
    circuitFeet: 40,
    hoursTrip: 1, hoursSet: 2, hoursAccess: 1.5, hoursPower: 2,
    hoursPerCircuitFoot: 0.08, hoursPad: 3, hoursHaul: 1.5, hoursCoverLift: 0.5,
    hoursSteps: 1, hoursGas: 2, siteHours: 0.5,
    unitCost: 6500, unitCostMultiplier: 1.3, craneFee: 950, circuitKit: 350, circuitPerFoot: 9,
    padCost: 450, haulFee: 150, coverLiftCost: 120, stepsCost: 200, gasCost: 300, permitFee: 150,
    hourlyWage: 34, burdenRate: 28, travelAndEquipment: 100, overheadRate: 15, targetMargin: 25,
    proposedPrice: 9800,
    addPad: true, addHaul: false, addCoverLift: true, addSteps: false, addGas: false,
    size: 'large', access: 'crane', power: 'run60',
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
  assert.ok(NUMBER_FIELD_IDS.length >= 27);
  assert.deepEqual(BOOLEAN_FIELD_IDS, ['addPad', 'addHaul', 'addCoverLift', 'addSteps', 'addGas']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['access', 'power', 'size']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('circuitFeet=40&wageSecret=99&size=large');
  assert.deepEqual(Object.keys(restored).sort(), ['circuitFeet', 'size']);
  assert.equal(restored.circuitFeet, 40);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('size=jumbo&access=teleport&power=solar&circuitFeet=40');
  assert.equal('size' in restored, false);
  assert.equal('access' in restored, false);
  assert.equal('power' in restored, false);
  assert.equal(restored.circuitFeet, 40);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('circuitFeet=-5&hourlyWage=abc&unitCost=6500');
  assert.equal('circuitFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.unitCost, 6500);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#circuitFeet=40').circuitFeet, 40);
  assert.equal(decodeInputs('?craneFee=0').craneFee, 0);
  const encoded = encodeInputs({ size: 'compact', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a compact driveway-drop job with no add-ons still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    circuitFeet: 0, craneFee: 0, addPad: false, addHaul: false, addCoverLift: false,
    addSteps: false, addGas: false, size: 'compact', access: 'drive', power: 'existing',
  }));
  assert.equal(restored.circuitFeet, 0);
  assert.equal(restored.craneFee, 0);
  assert.equal(restored.addPad, false);
  assert.equal(restored.size, 'compact');
  assert.equal(restored.access, 'drive');
  assert.equal(restored.power, 'existing');
});

test('every size, access, and power preset id from calc.mjs is accepted', () => {
  for (const id of ENUM_FIELDS.size) {
    assert.equal(decodeInputs(`size=${id}`).size, id);
  }
  for (const id of ENUM_FIELDS.access) {
    assert.equal(decodeInputs(`access=${id}`).access, id);
  }
  for (const id of ENUM_FIELDS.power) {
    assert.equal(decodeInputs(`power=${id}`).power, id);
  }
});
