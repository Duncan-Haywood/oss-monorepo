import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps the service path, panel style, location, amps, feeder, circuits, AFCI, and every rate field, not just the price fields', () => {
  const input = {
    existingAmps: 100,
    newAmps: 200,
    feederFeet: 40,
    circuitCount: 20,
    afciCount: 20,
    hoursPanelSwap: 4,
    hoursServiceChange: 6,
    hoursUnderground: 5,
    hoursFinishedAccess: 3,
    hoursPerFeederFoot: 0.15,
    hoursPerCircuit: 0.35,
    hoursPerAfci: 0.2,
    hoursMeterSocket: 3,
    hoursGrounding: 2.5,
    hoursTemporaryPower: 2,
    hoursUtilityCoordination: 1.5,
    siteHours: 2,
    panelCost: 520,
    breakerCostEach: 12,
    afciCostEach: 48,
    seCablePerFoot: 14,
    mastKitCost: 0,
    meterSocketCost: 320,
    groundRodKit: 95,
    tempPowerCost: 175,
    permitFee: 185,
    utilityFee: 250,
    hourlyWage: 52,
    burdenRate: 34,
    travelAndEquipment: 165,
    overheadRate: 18,
    targetMargin: 30,
    proposedPrice: 4500,
    replaceMeterSocket: true,
    newGrounding: true,
    temporaryPower: true,
    service: 'underground',
    panelStyle: 'meter-main',
    location: 'finished',
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
    ['replaceMeterSocket', 'newGrounding', 'temporaryPower'].sort(),
  );
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['location', 'panelStyle', 'service']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('feederFeet=40&wageSecret=99&service=underground');
  assert.deepEqual(Object.keys(restored).sort(), ['feederFeet', 'service']);
  assert.equal(restored.feederFeet, 40);
});

test('an unknown enum value is dropped rather than accepted, for each of the three selects', () => {
  const restored = decodeInputs('service=solar&panelStyle=fuse-box&location=roof&circuitCount=8');
  assert.equal('service' in restored, false);
  assert.equal('panelStyle' in restored, false);
  assert.equal('location' in restored, false);
  assert.equal(restored.circuitCount, 8);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('feederFeet=-5&hourlyWage=abc&panelCost=280');
  assert.equal('feederFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.panelCost, 280);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#feederFeet=40').feederFeet, 40);
  assert.equal(decodeInputs('?panelCost=280').panelCost, 280);
  const encoded = encodeInputs({ service: 'overhead', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('an AFCI count of zero and temporaryPower false still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({ afciCount: 0, temporaryPower: false, circuitCount: 10 }));
  assert.equal(restored.afciCount, 0);
  assert.equal(restored.temporaryPower, false);
  assert.equal(restored.circuitCount, 10);
});
