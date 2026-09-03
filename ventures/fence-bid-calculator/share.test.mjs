import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  runs: [
    {
      name: 'Wood privacy, 6 ft', linearFeet: 140, postSpacingFt: 8, corners: 2,
      walkGates: 1, driveGates: 1, materialPerLf: 14, linePostCost: 22,
      terminalPostCost: 36, walkGateCost: 220, driveGateCost: 520,
      concretePerPost: 10, hoursPerLf: 0.14, hoursPerPost: 0.5,
      hoursPerWalkGate: 1.75, hoursPerDriveGate: 3.5, extra: 'drop-me',
    },
    {
      name: 'Custom chain-link', linearFeet: 60, postSpacingFt: 10, corners: 0,
      walkGates: 0, driveGates: 0, materialPerLf: 7, linePostCost: 18,
      terminalPostCost: 42, walkGateCost: 0, driveGateCost: 0,
      concretePerPost: 12, hoursPerLf: 0.08, hoursPerPost: 0.45,
      hoursPerWalkGate: 0, hoursPerDriveGate: 0,
    },
  ],
  tearOutFeet: 40,
  hoursPerTearOutLf: 0.18,
  tearOutPerFoot: 4,
  dig: 'clay',
  slope: 'mild',
  hourlyWage: 25,
  burdenRate: 28,
  otherCost: 150,
  overheadRate: 15,
  targetMargin: 25,
  proposedPrice: 9800,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every run and every cost field the sender saw', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.runs[0].name, 'Wood privacy, 6 ft');
  assert.equal(restored.runs[0].driveGates, 1);
  assert.equal(restored.runs[0].terminalPostCost, 36);
  assert.equal(restored.runs[1].name, 'Custom chain-link');
  assert.equal(restored.runs[1].postSpacingFt, 10);
  assert.equal(restored.dig, 'clay');
  assert.equal(restored.slope, 'mild');
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 9800);
});

test('every field a new share link would need has an allowlist rule', () => {
  for (const key of ['dig', 'slope', 'hourlyWage', 'targetMargin', 'proposedPrice', 'tearOutFeet']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('unknown keys never survive encoding or decoding, at either level', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.runs[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    runs: [{ name: 'x', linearFeet: 12, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.runs[0].proto, undefined);
  assert.equal(restored.runs[0].linearFeet, 12);
});

test('a blank proposed price is dropped rather than encoded as the number zero', () => {
  // `Number('')` is 0 in JavaScript. `proposedPrice` left blank means "no
  // price to compare"; an explicit 0 means "I am considering giving this
  // job away". Confusing the two would let a shared link invent a price the
  // sender never typed.
  const withBlankPrice = { ...sample, proposedPrice: '' };
  const encoded = encodeShare(withBlankPrice);
  assert.equal(encoded.includes('proposedPrice'), false, decodeURIComponent(encoded));
  assert.equal(decodeShare(encoded).proposedPrice, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('a run missing from the payload leaves runs undefined rather than an empty array', () => {
  const restored = decodeShare(encodeShare({ ...sample, runs: [] }));
  assert.equal(restored.runs, undefined);
});
