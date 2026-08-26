import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  openings: [
    { name: 'Living picture', type: 'picture', widthIn: 60, heightIn: 48, quantity: 1, story: 1, frame: 'vinyl', install: 'insert', condition: 'clean', trim: false, extra: 'drop-me' },
    { name: 'Bedrooms', type: 'double-hung', widthIn: 30, heightIn: 54, quantity: 4, story: 2, frame: 'vinyl', install: 'insert', condition: 'clean', trim: true },
  ],
  hourlyWage: 38,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 28,
  setupHours: 1,
  minOnSiteHours: 6,
  tripFee: 95,
  scaffoldingCost: 375,
  disposalPerOpening: 18,
  permitCost: 85,
  otherCost: 10,
  overheadRate: 15,
  targetMargin: 25,
  addOns: [{ id: 'interiorCasing', label: 'Interior casing', hoursPerOpening: 0.4, partsPerOpening: 38, enabled: true, note: 'no' }],
  proposedPrice: 3850,
  secret: 'must-not-round-trip',
};

test('a shared link keeps story, United Inches, rot, quantity, and margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.openings[0].widthIn, 60);
  assert.equal(restored.openings[0].heightIn, 48);
  assert.equal(restored.openings[1].story, 2);
  assert.equal(restored.openings[1].quantity, 4);
  assert.equal(restored.openings[1].trim, true);
  assert.equal(restored.scaffoldingCost, 375);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 3850);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.openings[0].extra, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    openings: [{ name: 'x', widthIn: 30, heightIn: 40, story: 2, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.openings[0].proto, undefined);
  assert.equal(restored.openings[0].story, 2);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['openings', 'scaffoldingCost', 'disposalPerOpening', 'targetMargin', 'proposedPrice', 'permitCost']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
