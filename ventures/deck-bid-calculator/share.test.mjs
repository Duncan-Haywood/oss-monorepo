import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  sections: [
    { name: 'Main deck', lengthFt: 14, widthFt: 20, heightFt: 3, material: 'pt', extra: 'drop-me' },
    { name: 'Wrap', lengthFt: 10, widthFt: 12, heightFt: 8, material: 'composite' },
  ],
  railingLf: 46,
  railingStyle: 'cable',
  stairs: [{ name: 'Yard stair', runs: 1, widthFt: 4, risers: 5, note: 'no' }],
  demoSf: 280,
  hourlyWage: 42,
  burdenRate: 30,
  milesOneWay: 14,
  speedMph: 28,
  setupHours: 1.5,
  minOnSiteHours: 8,
  tripFee: 125,
  disposalPerSf: 2.4,
  footingEach: 85,
  permitCost: 175,
  otherCost: 40,
  overheadRate: 15,
  targetMargin: 22,
  proposedPrice: 11200,
  secret: 'must-not-round-trip',
};

test('a shared link keeps height, railing, stairs, demo, and margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.sections[0].lengthFt, 14);
  assert.equal(restored.sections[0].widthFt, 20);
  assert.equal(restored.sections[1].heightFt, 8);
  assert.equal(restored.sections[1].material, 'composite');
  assert.equal(restored.railingLf, 46);
  assert.equal(restored.railingStyle, 'cable');
  assert.equal(restored.stairs[0].risers, 5);
  assert.equal(restored.demoSf, 280);
  assert.equal(restored.targetMargin, 22);
  assert.equal(restored.proposedPrice, 11200);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.sections[0].extra, undefined);
  assert.equal(restored.stairs[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    sections: [{ name: 'x', lengthFt: 12, widthFt: 12, heightFt: 8, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.sections[0].proto, undefined);
  assert.equal(restored.sections[0].heightFt, 8);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['sections', 'railingLf', 'stairs', 'demoSf', 'targetMargin', 'proposedPrice', 'permitCost']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
