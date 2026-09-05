import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the finish method, color change, and hardware fields, not just the price fields', () => {
  const input = {
    finishId: 'onsite_brush',
    colorId: 'dark_to_light',
    doors: 20,
    drawers: 16,
    openings: 18,
    hardwarePieces: 76,
    hoursPerDoor: 1.35,
    hoursPerDrawer: 0.75,
    hoursPerOpening: 0.65,
    hoursPerHardware: 0.09,
    finishLaborFactor: 1.55,
    extraCoats: 1,
    extraCoatHoursPerPiece: 0.22,
    degreaseHours: 5,
    primerCoverage: 22,
    finishCoverage: 18,
    primerCost: 48,
    finishCost: 68,
    supplies: 85,
    hardwareCost: 8,
    hourlyWage: 38,
    burdenRate: 30,
    travelAndEquipment: 275,
    overheadRate: 15,
    targetMargin: 25,
    proposedPrice: 6200,
    replaceHardware: true,
  };
  const restored = decodeInputs(encodeInputs(input));
  for (const [key, value] of Object.entries(input)) {
    assert.equal(restored[key], value, `${key} did not round-trip`);
  }
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 23);
  assert.deepEqual(BOOLEAN_FIELD_IDS.sort(), ['replaceHardware'].sort());
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('doors=20&wageSecret=99&finishId=onsite_spray');
  assert.deepEqual(Object.keys(restored).sort(), ['doors', 'finishId']);
  assert.equal(restored.doors, 20);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('finishId=airbrush&colorId=dark_to_light');
  assert.equal('finishId' in restored, false);
  assert.equal(restored.colorId, 'dark_to_light');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('doors=-5&hourlyWage=abc&hardwareCost=8');
  assert.equal('doors' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.hardwareCost, 8);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#doors=20').doors, 20);
  assert.equal(decodeInputs('?hardwareCost=8').hardwareCost, 8);
  const encoded = encodeInputs({ finishId: 'shop', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
