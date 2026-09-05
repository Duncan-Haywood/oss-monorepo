import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps pump, pit, backup, every flag, and every rate field, not just the price fields', () => {
  const input = {
    dischargeFeet: 40,
    includedDischargeFeet: 15,
    hoursTrip: 0.85,
    hoursSwap: 1.25,
    hoursNewPit: 2.8,
    hoursSlabCut: 2.4,
    hoursPerExtraDischargeFoot: 0.12,
    hoursBattery: 1.1,
    hoursWaterBackup: 0,
    hoursAlarm: 0.35,
    hoursFreeze: 0.45,
    siteHours: 0.5,
    pumpCost: 265,
    basinCost: 95,
    slabCutCost: 285,
    dischargePerFoot: 6.5,
    checkValveCost: 38,
    batteryCost: 420,
    waterBackupCost: 0,
    alarmCost: 45,
    freezeCost: 65,
    permitFee: 75,
    hourlyWage: 42,
    burdenRate: 34,
    travelAndEquipment: 85,
    overheadRate: 16,
    targetMargin: 30,
    proposedPrice: 1800,
    addAlarm: true,
    addCheckValve: true,
    freezeProtect: true,
    pump: 'half-hp',
    pit: 'new-slab',
    backup: 'battery',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addAlarm', 'addCheckValve', 'freezeProtect']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['backup', 'pit', 'pump']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('dischargeFeet=30&wageSecret=99&pump=half-hp');
  assert.deepEqual(Object.keys(restored).sort(), ['dischargeFeet', 'pump']);
  assert.equal(restored.dischargeFeet, 30);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('pump=turbo-hp&pit=basement&backup=solar&dischargeFeet=30');
  assert.equal('pump' in restored, false);
  assert.equal('pit' in restored, false);
  assert.equal('backup' in restored, false);
  assert.equal(restored.dischargeFeet, 30);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('dischargeFeet=-5&hourlyWage=abc&permitFee=75');
  assert.equal('dischargeFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#dischargeFeet=30').dischargeFeet, 30);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ pump: 'third-hp', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the $450 swap special (zero extras, no backup) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    dischargeFeet: 15, includedDischargeFeet: 15, hoursNewPit: 0, hoursSlabCut: 0,
    hoursBattery: 0, hoursWaterBackup: 0,
    addAlarm: false, addCheckValve: true, freezeProtect: false,
    pump: 'third-hp', pit: 'existing', backup: 'none',
  }));
  assert.equal(restored.dischargeFeet, 15);
  assert.equal(restored.hoursNewPit, 0);
  assert.equal(restored.addAlarm, false);
  assert.equal(restored.addCheckValve, true);
  assert.equal(restored.freezeProtect, false);
  assert.equal(restored.pump, 'third-hp');
  assert.equal(restored.pit, 'existing');
  assert.equal(restored.backup, 'none');
});
