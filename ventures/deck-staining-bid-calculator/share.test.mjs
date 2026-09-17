import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  deckSqFt: 320,
  railLinealFeet: 40,
  railSfPerLf: 9,
  stairRuns: 1,
  stairSf: 40,
  hoursTrip: 1.1,
  hoursPer100SfPrep: 0.55,
  hoursPer100SfCoat: 0.65,
  coats: 2,
  hoursAccess: 1.5,
  hoursFurniture: 1.4,
  siteHours: 0.3,
  prepMaterialPer100Sf: 3.5,
  stainPerGallon: 46,
  coverageSfPerGallon: 225,
  furnitureFee: 45,
  mobilizationFee: 85,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 30,
  travelAndEquipment: 75,
  overheadRate: 15,
  targetMargin: 28,
  proposedPrice: 900,
  prep: 'strip',
  finish: 'oil',
  access: 'second',
  moveFurniture: true,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every field the bid needs', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.deckSqFt, 320);
  assert.equal(restored.railLinealFeet, 40);
  assert.equal(restored.prep, 'strip');
  assert.equal(restored.finish, 'oil');
  assert.equal(restored.access, 'second');
  assert.equal(restored.moveFurniture, true);
  assert.equal(restored.targetMargin, 28);
  assert.equal(restored.proposedPrice, 900);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    deckSqFt: 200,
    proto: 1,
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.proto, undefined);
  assert.equal(restored.deckSqFt, 200);
});

test('accepts a leading "#" the same as a bare fragment', () => {
  const hash = encodeShare(sample);
  assert.deepEqual(decodeShare(`#${hash}`), decodeShare(hash));
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['prep', 'finish', 'access', 'moveFurniture', 'targetMargin', 'proposedPrice']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
