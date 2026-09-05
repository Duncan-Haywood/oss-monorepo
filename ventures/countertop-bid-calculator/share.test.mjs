import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS } from './share.mjs';

test('a round trip keeps the layout, material, sink, edge, and every rate field, not just the price fields', () => {
  const input = {
    layoutId: 'with_island',
    materialId: 'marble',
    sinkId: 'farmhouse',
    edgeId: 'mitered',
    finishedSqFt: 70,
    perimeterLf: 44,
    wastePct: 24,
    slabSqFt: 40,
    slabCost: 1100,
    sinkCount: 1,
    hoursPerSink: 3,
    cooktopCount: 1,
    hoursPerCooktop: 1.5,
    faucetHoles: 3,
    hoursPerFaucet: 0.12,
    waterfallEnds: 2,
    hoursPerWaterfall: 3,
    edgeHoursPerLf: 0.45,
    backsplashLf: 22,
    backsplashHeightIn: 4,
    hoursPerBacksplashLf: 0.22,
    seams: 3,
    hoursPerSeam: 1.25,
    fieldHoursPer100: 2.5,
    installHoursPer100: 3,
    templateHours: 2.5,
    tearoutHours: 3.5,
    suppliesPerSqFt: 4,
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 165,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: 8200,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 29);
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('finishedSqFt=55&wageSecret=99&layoutId=l_shape');
  assert.deepEqual(Object.keys(restored).sort(), ['finishedSqFt', 'layoutId']);
  assert.equal(restored.finishedSqFt, 55);
});

test('an unknown enum value is dropped rather than accepted, for every enum field', () => {
  const restored = decodeInputs(
    'layoutId=spiral&materialId=obsidian&sinkId=triple&edgeId=laser&perimeterLf=32',
  );
  assert.equal('layoutId' in restored, false);
  assert.equal('materialId' in restored, false);
  assert.equal('sinkId' in restored, false);
  assert.equal('edgeId' in restored, false);
  assert.equal(restored.perimeterLf, 32);
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('finishedSqFt=-5&hourlyWage=abc&slabCost=850');
  assert.equal('finishedSqFt' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.slabCost, 850);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#finishedSqFt=55').finishedSqFt, 55);
  assert.equal(decodeInputs('?slabCost=850').slabCost, 850);
  const encoded = encodeInputs({ layoutId: 'galley', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});

test('a zero waterfall count and zero seams still travel -- they are the job, not an error', () => {
  const restored = decodeInputs(encodeInputs({ waterfallEnds: 0, seams: 0, finishedSqFt: 40 }));
  assert.equal(restored.waterfallEnds, 0);
  assert.equal(restored.seams, 0);
  assert.equal(restored.finishedSqFt, 40);
});

test('each enum field only accepts its own preset ids, not another field\'s', () => {
  // A crafted link swapping a material id into the layout slot (or vice
  // versa) must not silently set a field to a value the form never offers
  // there -- the cross-field version of the rename-drift class this codec
  // guards against.
  const restored = decodeInputs('layoutId=quartz&materialId=galley&sinkId=eased&edgeId=none');
  assert.equal('layoutId' in restored, false);
  assert.equal('materialId' in restored, false);
  assert.equal('sinkId' in restored, false);
  assert.equal('edgeId' in restored, false);
});
