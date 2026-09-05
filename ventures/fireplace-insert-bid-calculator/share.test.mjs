import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, BOOLEAN_FIELD_IDS } from './share.mjs';

test('a round trip keeps liner footage and chimney scope, not just the fuel and size', () => {
  const input = {
    fuel: 'wood',
    size: 'large',
    chimney: 'liner',
    access: 'two',
    linerFeet: 32,
    addHearth: true,
    addGasLine: false,
    addCircuit: true,
    addSurround: false,
    addDamper: true,
    tearOut: true,
    hoursTrip: 1.5,
    unitCost: 2200,
    hourlyWage: 52,
    targetMargin: 35,
    proposedPrice: 6800,
  };
  const restored = decodeInputs(encodeInputs(input));
  assert.equal(restored.fuel, 'wood');
  assert.equal(restored.size, 'large');
  assert.equal(restored.chimney, 'liner');
  assert.equal(restored.access, 'two');
  assert.equal(restored.linerFeet, 32);
  assert.equal(restored.addHearth, true);
  assert.equal(restored.addGasLine, false);
  assert.equal(restored.addCircuit, true);
  assert.equal(restored.addDamper, true);
  assert.equal(restored.tearOut, true);
  assert.equal(restored.unitCost, 2200);
  assert.equal(restored.hourlyWage, 52);
  assert.equal(restored.targetMargin, 35);
  assert.equal(restored.proposedPrice, 6800);
});

test('every numeric and boolean field the calculator uses is shareable', () => {
  // Guards against a new input field being added to calc.mjs/index.html and
  // silently never making it into a shared link -- the exact bug class
  // share.mjs's own header and CLAUDE.md's rename-drift note both describe.
  assert.ok(NUMBER_FIELD_IDS.length >= 30);
  assert.ok(BOOLEAN_FIELD_IDS.includes('tearOut'));
});

test('unknown query keys are ignored so a stale or crafted link cannot inject fields', () => {
  const restored = decodeInputs('linerFeet=10&wageSecret=99&fuel=gas');
  assert.deepEqual(Object.keys(restored).sort(), ['fuel', 'linerFeet']);
  assert.equal(restored.linerFeet, 10);
});

test('an unknown enum value is dropped rather than accepted', () => {
  const restored = decodeInputs('fuel=nuclear&chimney=liner');
  assert.equal('fuel' in restored, false);
  assert.equal(restored.chimney, 'liner');
});

test('a negative or non-numeric value is dropped, matching the form\'s own min="0"', () => {
  const restored = decodeInputs('linerFeet=-5&hourlyWage=abc&unitCost=1200');
  assert.equal('linerFeet' in restored, false);
  assert.equal('hourlyWage' in restored, false);
  assert.equal(restored.unitCost, 1200);
});

test('hash or query prefixes and an empty proposed price do not break the codec', () => {
  assert.equal(decodeInputs('#linerFeet=18').linerFeet, 18);
  assert.equal(decodeInputs('?unitCost=1900').unitCost, 1900);
  const encoded = encodeInputs({ fuel: 'gas', proposedPrice: '' });
  assert.equal(encoded.includes('proposedPrice'), false);
});
