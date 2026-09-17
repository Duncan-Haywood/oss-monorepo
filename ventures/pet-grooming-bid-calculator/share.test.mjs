import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';
import { ADD_ON_IDS, defaults } from './calc.mjs';

test('every boolean the calculator reads, including every add-on, is shareable', () => {
  for (const id of ADD_ON_IDS) {
    assert.ok(BOOLEAN_FIELD_IDS.includes(id), `add-on ${id} is not in BOOLEAN_FIELD_IDS`);
  }
  assert.ok(BOOLEAN_FIELD_IDS.includes('severeMattingAck'));
  assert.ok(BOOLEAN_FIELD_IDS.includes('mobile'));
});

test('size, coat, and matting are enums checked against calc.mjs\'s own tables', () => {
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['coat', 'matting', 'size'].sort());
  assert.ok(ENUM_FIELDS.size.includes('giant'));
  assert.ok(ENUM_FIELDS.coat.includes('curly'));
  assert.ok(ENUM_FIELDS.matting.includes('severe'));
});

test('a round trip keeps every number, boolean, and enum field', () => {
  const input = {
    targetPrice: 120,
    size: 'large',
    coat: 'curly',
    matting: 'moderate',
    severeMattingAck: false,
    nailTrim: true,
    nailGrinding: false,
    teethBrushing: true,
    earCleaning: false,
    deshedding: true,
    fleaTick: false,
    analGland: true,
    mobile: true,
    travelMiles: 18,
    vehicleRate: 0.7,
    travelSetupMinutes: 20,
    wage: 22,
    burdenPercent: 25,
    supplies: 9,
    overhead: 6,
    paymentRate: 2.9,
    targetMargin: 30,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('the owner-operator default (wage at zero, nothing mobile or matted) still travels', () => {
  const restored = decodeInputs(encodeInputs(defaults));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(restored[id], defaults[id], `${id} did not round-trip from calc.mjs's own defaults`);
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    assert.equal(restored[id], defaults[id], `${id} did not round-trip from calc.mjs's own defaults`);
  }
  assert.equal(restored.size, defaults.size);
  assert.equal(restored.coat, defaults.coat);
  assert.equal(restored.matting, defaults.matting);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('targetPrice=100&wageSecret=99&mobile=1');
  assert.deepEqual(Object.keys(restored).sort(), ['mobile', 'targetPrice'].sort());
  assert.equal(restored.targetPrice, 100);
});

test('a crafted size, coat, or matting outside the known set is dropped, not passed through', () => {
  const restored = decodeInputs('size=werewolf&coat=curly&matting=extreme&targetPrice=90');
  assert.equal('size' in restored, false);
  assert.equal(restored.coat, 'curly');
  assert.equal('matting' in restored, false);
  assert.equal(restored.targetPrice, 90);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('travelMiles=-2&wage=abc&supplies=9');
  assert.equal('travelMiles' in restored, false);
  assert.equal('wage' in restored, false);
  assert.equal(restored.supplies, 9);
});

test('hash or query prefixes and an empty value do not break the codec', () => {
  assert.equal(decodeInputs('#targetPrice=100').targetPrice, 100);
  assert.equal(decodeInputs('?wage=0').wage, 0);
  const encoded = encodeInputs({ wage: 3, targetPrice: '' });
  assert.equal(encoded.includes('targetPrice'), false);
});

test('a false boolean still round-trips as false, not as absent', () => {
  const restored = decodeInputs(encodeInputs({ mobile: false, nailTrim: false }));
  assert.equal(restored.mobile, false);
  assert.equal(restored.nailTrim, false);
});
