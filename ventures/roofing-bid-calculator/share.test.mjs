import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  sections: [
    { name: 'Main house', footprintSqFt: 1800, pitchRise: 6, tearOffLayers: 1, extra: 'drop-me' },
    { name: 'Attached garage', footprintSqFt: 400, pitchRise: 12, tearOffLayers: 2 },
  ],
  wastePercent: 12,
  materialPerSquare: 140,
  underlaymentPerSquare: 22,
  accessoriesFlat: 450,
  installHoursPerSquare: 1.8,
  tearOffHoursPerSquare: 1,
  hourlyWage: 38,
  burdenRate: 32,
  dumpPerSquare: 35,
  dumpsterFee: 450,
  permitFee: 250,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 22,
  proposedPrice: 18500,
  secret: 'must-not-round-trip',
};

test('a shared link keeps pitch, tear-off layers, waste, and margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.sections[0].footprintSqFt, 1800);
  assert.equal(restored.sections[0].pitchRise, 6);
  assert.equal(restored.sections[1].pitchRise, 12);
  assert.equal(restored.sections[1].tearOffLayers, 2);
  assert.equal(restored.wastePercent, 12);
  assert.equal(restored.targetMargin, 22);
  assert.equal(restored.proposedPrice, 18500);
});

test('a shared link keeps the chosen covering, not just its derived costs', () => {
  const restored = decodeShare(encodeShare({ ...sample, materialPreset: '2' }));
  assert.equal(restored.materialPreset, '2');
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.sections[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    sections: [{ name: 'x', footprintSqFt: 1200, pitchRise: 6, tearOffLayers: 1, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.sections[0].proto, undefined);
  assert.equal(restored.sections[0].footprintSqFt, 1200);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['sections', 'wastePercent', 'targetMargin', 'proposedPrice', 'permitFee', 'materialPreset']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
