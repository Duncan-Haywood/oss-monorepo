import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps system, stories, every flag, and every rate field, not just the price fields', () => {
  const input = {
    crackLf: 40,
    delamSf: 80,
    tearoffSf: 180,
    windowFlashes: 4,
    caulkLf: 60,
    hoursPerCrackLf: 0.12,
    hoursPerDelamSf: 0.18,
    hoursPerTearoffSf: 0.32,
    hoursScaffold: 4,
    hoursExtraStory: 3,
    hoursPerWindowFlash: 1.5,
    hoursColorMatch: 2.5,
    hoursMoisture: 3,
    hoursPerCaulkLf: 0.04,
    siteHours: 2,
    stuccoMixPerSf: 2.8,
    mixPerCrackLf: 1.1,
    meshPerSf: 0.65,
    flashKitEach: 45,
    colorTintCost: 85,
    scaffoldRental: 280,
    moistureKit: 40,
    caulkPerLf: 1.2,
    dumpsterCost: 175,
    permitFee: 75,
    hourlyWage: 38,
    burdenRate: 32,
    travelAndEquipment: 95,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 2500,
    colorMatch: true,
    moistureInvestigation: true,
    system: 'eifs',
    stories: '2',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['colorMatch', 'moistureInvestigation']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['stories', 'system']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('crackLf=40&wageSecret=99&system=eifs');
  assert.deepEqual(Object.keys(restored).sort(), ['crackLf', 'system']);
  assert.equal(restored.crackLf, 40);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('system=foam&stories=4&crackLf=40');
  assert.equal('system' in restored, false);
  assert.equal('stories' in restored, false);
  assert.equal(restored.crackLf, 40);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('crackLf=-5&hourlyWage=abc&permitFee=75');
  assert.equal('crackLf' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#crackLf=40').crackLf, 40);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ system: 'hard-coat', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a crack-only job (no hollow, no tear-off, no flashing, no color match) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    crackLf: 40, delamSf: 0, tearoffSf: 0, windowFlashes: 0, caulkLf: 20,
    colorMatch: false, moistureInvestigation: false,
    system: 'hard-coat', stories: '1',
  }));
  assert.equal(restored.crackLf, 40);
  assert.equal(restored.delamSf, 0);
  assert.equal(restored.colorMatch, false);
  assert.equal(restored.moistureInvestigation, false);
  assert.equal(restored.system, 'hard-coat');
  assert.equal(restored.stories, '1');
});
