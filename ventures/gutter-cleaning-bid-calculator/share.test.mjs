import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  runs: [
    { name: 'Front and sides', linearFeet: 80, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 3, extra: 'drop-me' },
    { name: 'Rear two-story', linearFeet: 40, story: '2', pitch: 'moderate', guards: 'screens', debris: 'mixed', downspouts: 1 },
  ],
  hourlyWage: 24,
  burdenRate: 28,
  minutesPer10ft: 9,
  minutesPerDownspout: 7,
  travelMinutes: 25,
  disposalPerVisit: 12,
  equipmentPerVisit: 8,
  overheadRate: 18,
  targetMargin: 30,
  visitsPerYear: 2,
  minimumCharge: 140,
  proposedPrice: 250,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every run and the cost assumptions', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.runs[0].linearFeet, 80);
  assert.equal(restored.runs[0].guards, 'none');
  assert.equal(restored.runs[1].linearFeet, 40);
  assert.equal(restored.runs[1].pitch, 'moderate');
  assert.equal(restored.targetMargin, 30);
  assert.equal(restored.visitsPerYear, 2);
  assert.equal(restored.minimumCharge, 140);
  assert.equal(restored.proposedPrice, 250);
});

test('unknown keys never survive encoding or decoding', () => {
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
    runs: [{ name: 'x', linearFeet: 50, story: '1', proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.runs[0].proto, undefined);
  assert.equal(restored.runs[0].linearFeet, 50);
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
  for (const key of ['runs', 'targetMargin', 'visitsPerYear', 'minimumCharge', 'proposedPrice']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
