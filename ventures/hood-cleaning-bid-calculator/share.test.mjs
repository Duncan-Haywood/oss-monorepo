import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInputs, decodeInputs, NUMBER_FIELD_IDS, ENUM_FIELDS, COMPONENT_NAME_VALUES, ACCESS_VALUES,
} from './share.mjs';

test('a round trip keeps every component, the grease load, and every cost field, not just the price fields', () => {
  const input = {
    components: [
      { name: 'Canopy hood (listed sq ft)', quantity: 40, minutesPerUnit: 4, access: 'kitchen_floor' },
      { name: 'Hood filters (each)', quantity: 6, minutesPerUnit: 4, access: 'kitchen_floor' },
      { name: 'Horizontal duct (linear ft)', quantity: 12, minutesPerUnit: 8, access: 'above_ceiling' },
      { name: 'Vertical duct (linear ft)', quantity: 20, minutesPerUnit: 15, access: 'rooftop_hard' },
      { name: 'Rooftop exhaust fan (each)', quantity: 1, minutesPerUnit: 60, access: 'rooftop_hard' },
    ],
    greaseLoad: 'heavy',
    hourlyWage: 28,
    burdenRate: 32,
    crewSize: 2,
    travelHours: 1,
    travelTechs: 2,
    afterHoursPremium: 25,
    consumablesPerJob: 45,
    consumablesPerHoodSqFt: 0.4,
    disposalFee: 35,
    otherJobCost: 0,
    overheadRate: 15,
    targetMargin: 25,
    cleansPerYear: 4,
    proposedPrice: 1982,
  };
  const restored = decodeInputs(encodeInputs(input));

  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(restored[id], input[id], `${id} did not round-trip`);
  }
  assert.equal(restored.greaseLoad, input.greaseLoad);
  assert.equal(restored.components.length, 5);
  for (const [index, component] of input.components.entries()) {
    assert.deepEqual(restored.components[index], component, `component ${index} did not round-trip`);
  }
});

test('every numeric field the calculator uses is shareable', () => {
  // Guards against a new cost field being added to index.html and silently
  // never making it into a shared link -- the exact bug class share.mjs's own
  // header and CLAUDE.md's rename-drift note both describe.
  assert.deepEqual(NUMBER_FIELD_IDS.sort(), [
    'afterHoursPremium', 'burdenRate', 'cleansPerYear', 'consumablesPerHoodSqFt',
    'consumablesPerJob', 'crewSize', 'disposalFee', 'hourlyWage', 'otherJobCost',
    'overheadRate', 'proposedPrice', 'targetMargin', 'travelHours', 'travelTechs',
  ].sort());
});

test('every component preset and access preset is a shareable enum value', () => {
  assert.ok(COMPONENT_NAME_VALUES.includes('Canopy hood (listed sq ft)'));
  assert.ok(COMPONENT_NAME_VALUES.includes('Rooftop exhaust fan (each)'));
  assert.ok(COMPONENT_NAME_VALUES.length >= 8);
  assert.deepEqual(ACCESS_VALUES, ['kitchen_floor', 'above_ceiling', 'rooftop_easy', 'rooftop_hard']);
  assert.deepEqual(ENUM_FIELDS.greaseLoad, ['light', 'moderate', 'heavy', 'extra_heavy']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('cleansPerYear=6&wageSecret=99&hourlyWage=abc');
  assert.deepEqual(Object.keys(restored).sort(), ['cleansPerYear']);
  assert.equal(restored.cleansPerYear, 6);
});

test('an unknown component-name enum value is dropped from the cell, not accepted', () => {
  const restored = decodeInputs('components=Homemade%20scrubber:3:10:kitchen_floor');
  assert.equal(restored.components.length, 1);
  assert.equal('name' in restored.components[0], false);
  assert.equal(restored.components[0].quantity, 3);
  assert.equal(restored.components[0].minutesPerUnit, 10);
  assert.equal(restored.components[0].access, 'kitchen_floor');
});

test('an unknown access enum value is dropped from the cell, not accepted', () => {
  const restored = decodeInputs('components=Canopy%20hood%20(listed%20sq%20ft):40:4:orbit');
  assert.equal(restored.components.length, 1);
  assert.equal(restored.components[0].name, 'Canopy hood (listed sq ft)');
  assert.equal('access' in restored.components[0], false);
});

test('an unrecognised grease-load id is rejected rather than accepted as-is', () => {
  const restored = decodeInputs('greaseLoad=molten');
  assert.equal('greaseLoad' in restored, false);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('cleansPerYear=-5&hourlyWage=abc&burdenRate=30');
  assert.equal('cleansPerYear' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.burdenRate, 30);
});

test('a component row with nothing usable in it is dropped rather than restored as a blank card', () => {
  assert.equal(decodeInputs('components=::: ').components, undefined);
  assert.equal(decodeInputs('components=:::').components, undefined);
});

test('multiple components are separated correctly, in order', () => {
  const encoded = encodeInputs({
    components: [
      { name: 'Hood filters (each)', quantity: 6, minutesPerUnit: 4, access: 'kitchen_floor' },
      { name: 'Wall exhaust fan (each)', quantity: 1, minutesPerUnit: 35, access: 'above_ceiling' },
    ],
  });
  const restored = decodeInputs(encoded);
  assert.deepEqual(restored.components.map((component) => component.name),
    ['Hood filters (each)', 'Wall exhaust fan (each)']);
  assert.equal(restored.components[1].access, 'above_ceiling');
});

test('hash or query prefixes, an empty proposed price, and no components at all do not break the codec', () => {
  assert.equal(decodeInputs('#cleansPerYear=6').cleansPerYear, 6);
  assert.equal(decodeInputs('?hourlyWage=28').hourlyWage, 28);
  const encoded = encodeInputs({ proposedPrice: '', components: [] });
  assert.equal(encoded, '');
  assert.deepEqual(decodeInputs(''), {});
});

test('a component missing only its access still restores what it has, matching addRow\'s own fallback', () => {
  // `readComponents()`/`addRow()` fall back to 'kitchen_floor' access when none
  // is set, so an access-less row is still worth keeping rather than dropping
  // the whole component for one missing cell.
  const restored = decodeInputs('components=Rooftop%20exhaust%20fan%20(each):1:60:');
  assert.equal(restored.components.length, 1);
  assert.equal(restored.components[0].name, 'Rooftop exhaust fan (each)');
  assert.equal(restored.components[0].quantity, 1);
  assert.equal(restored.components[0].minutesPerUnit, 60);
  assert.equal('access' in restored.components[0], false);
});
