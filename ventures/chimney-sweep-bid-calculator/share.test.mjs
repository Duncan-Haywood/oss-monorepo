import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  flues: [
    { name: 'Wood-burning fireplace', quantity: 1, hoursEach: 1, extra: 'drop-me' },
    { name: 'Wood stove / insert', quantity: 2, hoursEach: 1.25 },
  ],
  stories: 3,
  roofAccess: 'steep',
  creosote: 'glazed',
  workType: 'camera',
  animalRemoval: true,
  addOns: [{ id: 'rainCap', label: 'Rain cap / spark arrestor', hours: 0.4, parts: 45, enabled: true, note: 'no' }],
  hourlyWage: 28,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 35,
  setupHours: 0.25,
  minOnSiteHours: 1,
  tripFee: 45,
  consumablesPerFlue: 8,
  chemicalPerGlazedFlue: 18,
  otherCost: 10,
  overheadRate: 18,
  targetMargin: 30,
  proposedPrice: 420,
  secret: 'must-not-round-trip',
};

test('a shared link keeps quantity, creosote, and target margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.flues[1].quantity, 2);
  assert.equal(restored.creosote, 'glazed');
  assert.equal(restored.targetMargin, 30);
  assert.equal(restored.proposedPrice, 420);
  assert.equal(restored.stories, 3);
  assert.equal(restored.animalRemoval, true);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.flues[0].extra, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    stories: 2,
    eval: 'nope',
    flues: [{ name: 'x', quantity: 1, hoursEach: 1, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.stories, 2);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.flues[0].proto, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['flues', 'stories', 'creosote', 'targetMargin', 'proposedPrice', 'milesOneWay', 'animalRemoval']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
