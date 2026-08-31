import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  surfaces: [
    { name: 'Concrete driveway', squareFeet: 1200, productionRate: 1000, chemicalCost: 18, extra: 'drop-me' },
    { name: 'House siding (soft wash)', squareFeet: 2200, productionRate: 500, chemicalCost: 44 },
  ],
  hourlyWage: 24,
  burdenRate: 28,
  roundTripMinutes: 40,
  setupMinutes: 20,
  waterCost: 8,
  equipmentWear: 15,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 25,
  minimumJob: 175,
  packageVisits: 4,
  packageDiscount: 15,
  proposedPrice: 325,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every surface, the preset choice, and the margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.surfaces.length, 2);
  assert.equal(restored.surfaces[0].name, 'Concrete driveway');
  assert.equal(restored.surfaces[1].name, 'House siding (soft wash)');
  assert.equal(restored.surfaces[1].squareFeet, 2200);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 325);
  assert.equal(restored.minimumJob, 175);
  assert.equal(restored.packageVisits, 4);
  assert.equal(restored.packageDiscount, 15);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.surfaces[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    surfaces: [{ name: 'x', squareFeet: 200, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.surfaces[0].proto, undefined);
  assert.equal(restored.surfaces[0].squareFeet, 200);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('a surface with nothing usable is dropped rather than restored as an empty row', () => {
  const crafted = encodeURIComponent(JSON.stringify({ surfaces: [{}, { name: 'ok', squareFeet: 5 }] }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.surfaces.length, 1);
  assert.equal(restored.surfaces[0].name, 'ok');
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['roundTripMinutes', 'minimumJob', 'packageVisits', 'packageDiscount', 'targetMargin', 'proposedPrice']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
