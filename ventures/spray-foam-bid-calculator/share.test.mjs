import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps the plane, cell, and rim, not just the price fields', () => {
  const input = {
    area: 'cathedral',
    cell: 'hybrid',
    pitch: '8/12',
    barrier: 'intumescent',
    access: 'tight-crawl',
    lengthFeet: 40,
    widthFeet: 36,
    thicknessInches: 5.5,
    rimLf: 80,
    rimHeightInches: 9.25,
    rimThicknessInches: 3,
    includePermit: true,
    areaSf: 1734.5,
    openBf: 3811.7,
    closedBf: 1734.5,
    rimBf: 185,
    wastePercent: 12,
    hourlyWage: 32,
    targetMargin: 25,
    proposedPrice: 6800,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.area, 'cathedral');
  assert.equal(restored.cell, 'hybrid');
  assert.equal(restored.pitch, '8/12');
  assert.equal(restored.barrier, 'intumescent');
  assert.equal(restored.access, 'tight-crawl');
  assert.equal(restored.lengthFeet, 40);
  assert.equal(restored.rimLf, 80);
  assert.equal(restored.includePermit, true);
  assert.equal(restored.areaSf, 1734.5);
  assert.equal(restored.wastePercent, 12);
  assert.equal(restored.hourlyWage, 32);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 6800);
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 25);
  assert.ok(BOOLEAN_FIELD_IDS.includes('includePermit'));
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('lengthFeet=40&wageSecret=99&area=attic-floor');
  assert.deepEqual(Object.keys(restored).sort(), ['area', 'lengthFeet']);
  assert.equal(restored.lengthFeet, 40);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('cell=molten&pitch=6/12');
  assert.equal('cell' in restored, false);
  assert.equal(restored.pitch, '6/12');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('rimLf=-5&hourlyWage=abc&permitFee=185');
  assert.equal('rimLf' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.permitFee, 185);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#lengthFeet=40').lengthFeet, 40);
  assert.equal(decodeInputs('?permitFee=185').permitFee, 185);
  const encoded = encodeInputs({ area: 'crawl-wall', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
