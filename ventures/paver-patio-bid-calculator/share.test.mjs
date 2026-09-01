import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  lengthFeet: 18,
  widthFeet: 24,
  wastePct: 15,
  patternLaborFactor: 1.25,
  hoursPerFinishedSf: 0.09,
  hoursPerEdgeLf: 0.06,
  excavateYdPerHour: 1.5,
  baseDepthIn: 10,
  beddingIn: 1.5,
  paverThicknessIn: 2.375,
  edgeLf: 96,
  haulAway: false,
  paverCostPerSf: 5.25,
  gravelCostPerCuYd: 52,
  sandCostPerCuYd: 58,
  polymericCoverageSf: 75,
  polymericBagCost: 30,
  edgeCostPerLf: 4.25,
  haulCostPerCuYd: 60,
  hourlyWage: 34,
  burdenRate: 32,
  travelAndEquipment: 400,
  overheadRate: 18,
  targetMargin: 25,
  proposedPrice: 9800,
  secret: 'must-not-round-trip',
};

test('a shared link keeps base depth, waste, haul-away, and margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.lengthFeet, 18);
  assert.equal(restored.widthFeet, 24);
  assert.equal(restored.wastePct, 15);
  assert.equal(restored.baseDepthIn, 10);
  assert.equal(restored.haulAway, false);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 9800);
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
    lengthFeet: 12,
    proto: 1,
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.proto, undefined);
  assert.equal(restored.lengthFeet, 12);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['lengthFeet', 'widthFeet', 'wastePct', 'baseDepthIn', 'haulAway', 'targetMargin', 'proposedPrice']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
