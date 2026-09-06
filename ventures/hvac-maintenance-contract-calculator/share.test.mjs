import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  for (const key of ['visits', 'hours', 'rate', 'travel', 'parts', 'callbacks', 'callbackHours', 'callbackCost', 'overhead', 'margin', 'proposed', 'pullThrough', 'cancelMonths']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('the allowlist matches the ids the page actually reads', () => {
  // The failure this guards against is silent on both ends: the sender copies
  // a link, the recipient's page falls back to the HTML defaults for whatever
  // was dropped, and the two of them read different floors off the "same"
  // plan. Derived from the page rather than restated, so a field added to the
  // form without a share entry fails here instead of in someone's inbox.
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const ids = html.match(/const ids = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...SHARE_FIELDS].sort(), [...ids].sort());
});

test('the retention inputs survive a round trip', () => {
  const restored = decodeShare(encodeShare({ ...sample, pullThrough: 600, cancelMonths: 3 }));
  assert.equal(restored.pullThrough, 600);
  assert.equal(restored.cancelMonths, 3);
});
