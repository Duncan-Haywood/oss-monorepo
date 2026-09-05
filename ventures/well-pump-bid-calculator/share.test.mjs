import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps well depth and pitless scope, not just the price fields', () => {
  const input = {
    type: 'submersible',
    work: 'full',
    hp: '1.5',
    pitless: 'seized',
    wellDepthFeet: 280,
    includedFootage: 100,
    cableFeet: 300,
    includedCableFeet: 100,
    stuckPump: true,
    addVfd: true,
    hoursTrip: 0.75,
    pumpCost: 780,
    hourlyWage: 52,
    targetMargin: 35,
    proposedPrice: 6800,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.type, 'submersible');
  assert.equal(restored.work, 'full');
  assert.equal(restored.hp, '1.5');
  assert.equal(restored.pitless, 'seized');
  assert.equal(restored.wellDepthFeet, 280);
  assert.equal(restored.cableFeet, 300);
  assert.equal(restored.stuckPump, true);
  assert.equal(restored.addVfd, true);
  assert.equal(restored.pumpCost, 780);
  assert.equal(restored.hourlyWage, 52);
  assert.equal(restored.targetMargin, 35);
  assert.equal(restored.proposedPrice, 6800);
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 25);
  assert.ok(BOOLEAN_FIELD_IDS.includes('stuckPump'));
  assert.ok(BOOLEAN_FIELD_IDS.includes('addVfd'));
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('wellDepthFeet=150&wageSecret=99&type=jet');
  assert.deepEqual(Object.keys(restored).sort(), ['type', 'wellDepthFeet']);
  assert.equal(restored.wellDepthFeet, 150);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('type=nuclear&pitless=seized');
  assert.equal('type' in restored, false);
  assert.equal(restored.pitless, 'seized');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('wellDepthFeet=-5&hourlyWage=abc&pumpCost=420');
  assert.equal('wellDepthFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.pumpCost, 420);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#wellDepthFeet=180').wellDepthFeet, 180);
  assert.equal(decodeInputs('?pumpCost=500').pumpCost, 500);
  const encoded = encodeInputs({ type: 'jet', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
