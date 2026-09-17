import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  sites: [
    { name: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5, iceMinutes: 13, iceSaltBags: 1.8, extra: 'drop-me' },
    { name: 'Large commercial lot', minutesPerPush: 90, sidewalkMinutes: 30, saltBags: 16, iceMinutes: 78, iceSaltBags: 19.2 },
  ],
  operatorWage: 22,
  burdenRate: 30,
  truckHourly: 45,
  deadheadMinutesPerSite: 6,
  saltCostPerBag: 8,
  overheadRate: 15,
  targetMargin: 20,
  passesPerSnowEvent: 1,
  expectedSnowEvents: 10,
  expectedIceEvents: 6,
  proposedSeasonal: 2800,
  proposedPerPush: 85,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every stop and the winter assumptions', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.sites[0].minutesPerPush, 12);
  assert.equal(restored.sites[0].saltBags, 1.5);
  assert.equal(restored.sites[1].minutesPerPush, 90);
  assert.equal(restored.sites[1].iceSaltBags, 19.2);
  assert.equal(restored.expectedSnowEvents, 10);
  assert.equal(restored.expectedIceEvents, 6);
  assert.equal(restored.targetMargin, 20);
  assert.equal(restored.proposedSeasonal, 2800);
  assert.equal(restored.proposedPerPush, 85);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.sites[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    sites: [{ name: 'x', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.sites[0].proto, undefined);
  assert.equal(restored.sites[0].minutesPerPush, 12);
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
  for (const key of ['sites', 'targetMargin', 'expectedSnowEvents', 'expectedIceEvents', 'proposedSeasonal', 'proposedPerPush']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
