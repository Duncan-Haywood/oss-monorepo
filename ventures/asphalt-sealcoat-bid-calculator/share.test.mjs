import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  surfaces: [
    { name: 'Residential driveway', squareFeet: 800, coats: 2, firstCoatSqFtPerGal: 90, secondCoatSqFtPerGal: 120, extra: 'drop-me' },
    { name: 'Commercial parking lot', squareFeet: 12000, coats: 1, firstCoatSqFtPerGal: 80, secondCoatSqFtPerGal: 110 },
  ],
  condition: 'failing',
  method: 'spray',
  oilSpots: 6,
  crackFeet: 90,
  stalls: 24,
  sand: true,
  addOns: [{ id: 'handicap', label: 'Stencil', hours: 0.3, parts: 18, enabled: true, note: 'no' }],
  hourlyWage: 26,
  burdenRate: 30,
  milesOneWay: 11,
  speedMph: 32,
  setupHours: 0.75,
  minOnSiteHours: 2,
  tripFee: 45,
  sealerPerGallon: 4.5,
  primerPerGallon: 19,
  crackFillerPerFoot: 0.5,
  sandPerBag: 9,
  paintPerStall: 4,
  otherCost: 12,
  overheadRate: 16,
  targetMargin: 28,
  proposedPrice: 980,
  secret: 'must-not-round-trip',
};

test('a shared link keeps coats, oil spots, and target margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.surfaces[0].coats, 2);
  assert.equal(restored.surfaces[1].squareFeet, 12000);
  assert.equal(restored.oilSpots, 6);
  assert.equal(restored.condition, 'failing');
  assert.equal(restored.sand, true);
  assert.equal(restored.targetMargin, 28);
  assert.equal(restored.proposedPrice, 980);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.surfaces[0].extra, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    oilSpots: 3,
    eval: 'nope',
    surfaces: [{ name: 'x', squareFeet: 10, coats: 1, firstCoatSqFtPerGal: 90, secondCoatSqFtPerGal: 120, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.oilSpots, 3);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.surfaces[0].proto, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['surfaces', 'coats', 'oilSpots', 'crackFeet', 'targetMargin', 'proposedPrice', 'milesOneWay', 'sand']) {
    if (key === 'coats') {
      assert.ok(SHARE_FIELDS.includes('surfaces'), 'coats ride inside surfaces');
      continue;
    }
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
