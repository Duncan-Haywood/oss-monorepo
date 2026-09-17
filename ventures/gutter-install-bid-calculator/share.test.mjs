import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps profile, stories, every flag, and every rate field, not just the price fields', () => {
  const input = {
    gutterFeet: 220,
    insideMiters: 2,
    outsideMiters: 6,
    downspouts: 4,
    downspoutFeet: 48,
    includedDownspouts: 2,
    includedDownspoutFeetPerDrop: 10,
    fasciaFeet: 40,
    hoursTrip: 1.25,
    hoursPerGutterFoot: 0.04,
    hoursPerStoryFoot: 0.018,
    hoursInsideMiter: 0.5,
    hoursOutsideMiter: 0.3,
    hoursPerExtraDownspout: 0.65,
    hoursPerExtraDownspoutFoot: 0.08,
    hoursPerFasciaFoot: 0.22,
    hoursPerTearOffFoot: 0.018,
    hoursPerSteepFoot: 0.012,
    siteHours: 0.75,
    gutterPerFoot: 4.6,
    profilePremiumPerFoot: 1.2,
    downspoutOutletCost: 38,
    downspoutPerFoot: 4.2,
    insideMiterCost: 18,
    outsideMiterCost: 12,
    fasciaPerFoot: 8.5,
    tearOffDumpPerFoot: 0.85,
    hangerPerFoot: 1.1,
    permitFee: 75,
    hourlyWage: 38,
    burdenRate: 32,
    travelAndEquipment: 95,
    overheadRate: 16,
    targetMargin: 32,
    proposedPrice: 9800,
    tearOff: true,
    steepAccess: false,
    addHiddenHangers: true,
    profile: 'six-alum',
    stories: 'two',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['addHiddenHangers', 'steepAccess', 'tearOff']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['profile', 'stories']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('gutterFeet=140&wageSecret=99&profile=five-alum');
  assert.deepEqual(Object.keys(restored).sort(), ['gutterFeet', 'profile']);
  assert.equal(restored.gutterFeet, 140);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('profile=titanium&stories=four&gutterFeet=140');
  assert.equal('profile' in restored, false);
  assert.equal('stories' in restored, false);
  assert.equal(restored.gutterFeet, 140);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('gutterFeet=-5&hourlyWage=abc&fasciaFeet=40');
  assert.equal('gutterFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.fasciaFeet, 40);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#gutterFeet=140').gutterFeet, 140);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ profile: 'five-alum', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the $4.50/ft special (zero extras) and every flag false still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    gutterFeet: 140, insideMiters: 0, outsideMiters: 4, downspouts: 2, downspoutFeet: 20,
    includedDownspouts: 2, includedDownspoutFeetPerDrop: 10, fasciaFeet: 0,
    tearOff: false, steepAccess: false, addHiddenHangers: false,
    profile: 'five-alum', stories: 'one',
  }));
  assert.equal(restored.gutterFeet, 140);
  assert.equal(restored.insideMiters, 0);
  assert.equal(restored.fasciaFeet, 0);
  assert.equal(restored.tearOff, false);
  assert.equal(restored.steepAccess, false);
  assert.equal(restored.addHiddenHangers, false);
  assert.equal(restored.profile, 'five-alum');
  assert.equal(restored.stories, 'one');
});
