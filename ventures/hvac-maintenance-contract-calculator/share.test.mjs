import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  visits: 6,
  hours: 2.5,
  rate: 48,
  travel: 22,
  parts: 40,
  callbacks: 2,
  callbackHours: 1.5,
  callbackCost: 30,
  overhead: 150,
  margin: 25,
  proposed: 90,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every cost assumption', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.visits, 6);
  assert.equal(restored.hours, 2.5);
  assert.equal(restored.rate, 48);
  assert.equal(restored.callbacks, 2);
  assert.equal(restored.callbackHours, 1.5);
  assert.equal(restored.margin, 25);
  assert.equal(restored.proposed, 90);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({ eval: 'nope', visits: 4, proto: 1 }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.proto, undefined);
  assert.equal(restored.visits, 4);
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

test('SHARE_FIELDS includes every field the calculation reads', () => {
  for (const key of ['visits', 'hours', 'rate', 'travel', 'parts', 'callbacks', 'callbackHours', 'callbackCost', 'overhead', 'margin', 'proposed']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
