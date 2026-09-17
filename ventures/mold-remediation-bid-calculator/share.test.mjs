import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps job type, every flag, and every rate field, not just the price fields', () => {
  const input = {
    affectedSqFt: 320,
    containmentZones: 2,
    demoSqFt: 60,
    hepaDays: 3,
    dehumidifierDays: 2,
    includedAffectedSqFt: 80,
    includedContainmentZones: 1,
    hoursBaseSetup: 5,
    hoursPerExtra100SqFt: 1.5,
    hoursPerExtraZone: 2.5,
    hoursPer100DemoSqFt: 3,
    hoursPerDryoutDay: 0.75,
    hoursClearance: 1.5,
    hoursHvac: 3.5,
    hoursDumpster: 1.5,
    hoursOccupied: 2,
    siteHours: 1.5,
    hepaDaily: 125,
    dehumidifierDaily: 65,
    containmentKit: 185,
    extraZoneKit: 95,
    demoDisposalPerSqFt: 2.4,
    antimicrobialPerSqFt: 0.85,
    encapsulantPerSqFt: 0.65,
    clearanceFee: 425,
    hvacCleanCost: 550,
    dumpsterFee: 525,
    hourlyWage: 45,
    burdenRate: 36,
    travelAndEquipment: 145,
    overheadRate: 18,
    targetMargin: 30,
    proposedPrice: 4200,
    clearanceTest: true,
    hvacClean: false,
    dumpster: true,
    occupied: true,
    jobType: 'basement',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['clearanceTest', 'dumpster', 'hvacClean', 'occupied']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['jobType']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('affectedSqFt=140&wageSecret=99&jobType=bedroom');
  assert.deepEqual(Object.keys(restored).sort(), ['affectedSqFt', 'jobType']);
  assert.equal(restored.affectedSqFt, 140);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('jobType=mansion&affectedSqFt=140');
  assert.equal('jobType' in restored, false);
  assert.equal(restored.affectedSqFt, 140);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('affectedSqFt=-5&hourlyWage=abc&demoSqFt=40');
  assert.equal('affectedSqFt' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.demoSqFt, 40);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#affectedSqFt=140').affectedSqFt, 140);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ jobType: 'closet', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the $999 closet special (zero extras) and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    affectedSqFt: 80, containmentZones: 1, demoSqFt: 0, hepaDays: 1, dehumidifierDays: 1,
    includedAffectedSqFt: 80, includedContainmentZones: 1,
    clearanceTest: false, hvacClean: false, dumpster: false, occupied: false,
    jobType: 'closet',
  }));
  assert.equal(restored.affectedSqFt, 80);
  assert.equal(restored.demoSqFt, 0);
  assert.equal(restored.clearanceTest, false);
  assert.equal(restored.hvacClean, false);
  assert.equal(restored.dumpster, false);
  assert.equal(restored.occupied, false);
  assert.equal(restored.jobType, 'closet');
});
