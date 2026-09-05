import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS, ENUM_FIELDS } from './share.mjs';

test('a round trip keeps slope, surface, layout, every flag, and every rate field, not just the price fields', () => {
  const input = {
    riseInches: 36,
    widthFeet: 4,
    landingSideFeet: 5,
    maxRiseBetweenLandings: 30,
    runPerRise: 12,
    hoursTrip: 0.75,
    hoursPer100Sf: 3.2,
    hoursPerHandrailLf: 0.2,
    hoursPerFooting: 0.6,
    hoursDemo: 1.5,
    hoursSite: 0.5,
    siteHours: 0.5,
    handrailLf: 78,
    footingCount: 12,
    deckingPerSf: 4.5,
    framingPerSf: 6,
    handrailPerLf: 9,
    footingEach: 45,
    demoFee: 150,
    mobilizationFee: 85,
    permitFee: 120,
    hourlyWage: 38,
    burdenRate: 30,
    travelAndEquipment: 75,
    overheadRate: 18,
    targetMargin: 32,
    proposedPrice: 4200,
    demoExistingStairs: true,
    includePermit: true,
    slope: 'ada_1_12',
    surface: 'composite',
    layout: 'switchback',
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
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['demoExistingStairs', 'includePermit']);
  assert.deepEqual(Object.keys(ENUM_FIELDS).sort(), ['layout', 'slope', 'surface']);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('riseInches=36&wageSecret=99&slope=ada_1_12');
  assert.deepEqual(Object.keys(restored).sort(), ['riseInches', 'slope']);
  assert.equal(restored.riseInches, 36);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs('slope=1_to_4&surface=steel&layout=spiral&riseInches=36');
  assert.equal('slope' in restored, false);
  assert.equal('surface' in restored, false);
  assert.equal('layout' in restored, false);
  assert.equal(restored.riseInches, 36);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('riseInches=-5&hourlyWage=abc&permitFee=75');
  assert.equal('riseInches' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 75);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#riseInches=36').riseInches, 36);
  assert.equal(decodeInputs('?siteHours=0').siteHours, 0);
  const encoded = encodeInputs({ slope: 'ada_1_12', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('the $85/lf special (straight run, no demo, no permit) still travels -- it is the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({
    riseInches: 24, widthFeet: 4, handrailLf: 0, footingCount: 8,
    demoExistingStairs: false, includePermit: false,
    slope: 'ada_1_12', surface: 'wood', layout: 'straight',
  }));
  assert.equal(restored.riseInches, 24);
  assert.equal(restored.handrailLf, 0);
  assert.equal(restored.demoExistingStairs, false);
  assert.equal(restored.includePermit, false);
  assert.equal(restored.slope, 'ada_1_12');
  assert.equal(restored.surface, 'wood');
  assert.equal(restored.layout, 'straight');
});
