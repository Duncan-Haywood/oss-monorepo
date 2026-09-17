import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps capacity, system, work, pipe, every flag, and every rate field, not just the price fields', () => {
  const input = {
    pipeFeet: 35,
    includedPipeFeet: 10,
    drainFeet: 12,
    includedDrainFeet: 15,
    hoursTrip: 0.5,
    hoursSoftenerBase: 1.75,
    hoursPerExtraPipeFoot: 0.16,
    hoursDrainBase: 0.25,
    hoursPerExtraDrainFoot: 0.04,
    hoursIron: 1.5,
    hoursRo: 1.25,
    hoursHaulAway: 0.5,
    hoursElectrical: 0.75,
    siteHours: 0.4,
    softenerCost: 580,
    ironCost: 620,
    roCost: 340,
    bypassCost: 65,
    pipePerFoot: 8.5,
    drainFittingCost: 35,
    drainPerFoot: 1.4,
    haulFee: 45,
    electricalCost: 95,
    permitFee: 0,
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 85,
    overheadRate: 18,
    targetMargin: 35,
    proposedPrice: 1300,
    haulAway: true,
    addElectrical: true,
    capacity: '48k',
    system: 'salt',
    work: 'softener-iron',
    pipe: 'copper',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addElectrical', 'haulAway']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['capacity', 'pipe', 'system', 'work']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('pipeFeet=30&wageSecret=99&capacity=48k');
  assert.deepEqual(Object.keys(restored).sort(), ['capacity', 'pipeFeet']);
  assert.equal(restored.pipeFeet, 30);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('capacity=128k&system=uv&work=softener-uv&pipe=lead&pipeFeet=30');
  assert.equal('capacity' in restored, false);
  assert.equal('system' in restored, false);
  assert.equal('work' in restored, false);
  assert.equal('pipe' in restored, false);
  assert.equal(restored.pipeFeet, 30);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('pipeFeet=-5&hourlyWage=abc&permitFee=75');
  assert.equal('pipeFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#pipeFeet=30').pipeFeet, 30);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ capacity: '32k', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the salt-free job (no drain, no iron, no RO, no haul-away) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    pipeFeet: 40, includedPipeFeet: 10, drainFeet: 0, includedDrainFeet: 15,
    hoursDrainBase: 0, hoursIron: 0, hoursRo: 0, hoursHaulAway: 0,
    haulAway: false, addElectrical: false,
    capacity: '32k', system: 'salt-free', work: 'softener', pipe: 'copper',
  }));
  assert.equal(restored.pipeFeet, 40);
  assert.equal(restored.drainFeet, 0);
  assert.equal(restored.haulAway, false);
  assert.equal(restored.addElectrical, false);
  assert.equal(restored.capacity, '32k');
  assert.equal(restored.system, 'salt-free');
  assert.equal(restored.work, 'softener');
  assert.equal(restored.pipe, 'copper');
});
