import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  title: 'Added outlets and a wall',
  hours: 12,
  wage: 32,
  burdenPercent: 28,
  materials: 420,
  subcontractor: 150,
  daysAdded: 2,
  dailyGeneralConditions: 300,
  markupCapPercent: 10,
  overheadPercent: 12,
  targetMarginPercent: 22,
  proposedPrice: 1500,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every field the price needs', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.title, 'Added outlets and a wall');
  assert.equal(restored.hours, 12);
  assert.equal(restored.daysAdded, 2);
  assert.equal(restored.dailyGeneralConditions, 300);
  assert.equal(restored.markupCapPercent, 10);
  assert.equal(restored.targetMarginPercent, 22);
  assert.equal(restored.proposedPrice, 1500);
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
    hours: 5,
    proto: 1,
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.proto, undefined);
  assert.equal(restored.hours, 5);
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

test('SHARE_FIELDS includes the fields a dropped value would silently change', () => {
  for (const key of ['markupCapPercent', 'daysAdded', 'dailyGeneralConditions', 'targetMarginPercent', 'proposedPrice']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
