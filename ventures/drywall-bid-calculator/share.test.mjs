import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  rooms: [
    { name: 'Great room', lengthFt: 20, widthFt: 16, heightFt: 9, includeCeiling: true, extra: 'drop-me' },
    { name: 'Bath', lengthFt: 8, widthFt: 6, heightFt: 8, includeCeiling: true },
  ],
  openingSqFt: 86,
  openingCount: 7,
  wastePercent: 12,
  hangHoursPer100: 1.45,
  materialPer100: 68,
  sheetSqFt: 32,
  tapeLfPerSqFt: 0.42,
  finishLevel: 5,
  textureHoursPer100: 0.85,
  textureMaterialPer100: 11,
  tearOff: true,
  tearOffHoursPer100: 1.6,
  addOns: [{ id: 'stilts', label: 'Stilts / scaffold', hours: 2.5, parts: 120, enabled: true, note: 'no' }],
  hourlyWage: 34,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 32,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 75,
  dumpsterCost: 425,
  otherCost: 10,
  overheadRate: 16,
  targetMargin: 26,
  proposedPrice: 6400,
  boardType: 'typex-4x8',
  textureType: 'orange-peel',
  secret: 'must-not-round-trip',
};

test('a shared link keeps finish level, waste, tear-out, and target margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.rooms[0].lengthFt, 20);
  assert.equal(restored.rooms[0].includeCeiling, true);
  assert.equal(restored.wastePercent, 12);
  assert.equal(restored.finishLevel, 5);
  assert.equal(restored.tearOff, true);
  assert.equal(restored.targetMargin, 26);
  assert.equal(restored.proposedPrice, 6400);
  assert.equal(restored.dumpsterCost, 425);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.rooms[0].extra, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    finishLevel: 4,
    eval: 'nope',
    rooms: [{ name: 'x', lengthFt: 10, widthFt: 10, heightFt: 8, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.finishLevel, 4);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.rooms[0].proto, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['rooms', 'wastePercent', 'finishLevel', 'tearOff', 'textureHoursPer100', 'targetMargin', 'proposedPrice', 'dumpsterCost']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('the board and texture the bid is for travel with it', () => {
  // Both used to be reconstructed on arrival by matching the carried rates
  // back against the preset table, so a setter who typed their own sheet
  // price — the ordinary case — handed the recipient "Other / custom rates"
  // and "No texture" over their own Type X and orange peel, and a customer
  // proposal that named neither.
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.boardType, 'typex-4x8');
  assert.equal(restored.textureType, 'orange-peel');
});
