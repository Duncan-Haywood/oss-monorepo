import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  walls: [
    { name: 'Front elevation', lengthFt: 40, heightFt: 18, extra: 'drop-me' },
    { name: 'Rear elevation', lengthFt: 40, heightFt: 10 },
  ],
  openingSqFt: 180,
  openingCount: 12,
  wastePercent: 12,
  hoursPerSquare: 7,
  materialPerSquare: 340,
  tearOffHoursPerSquare: 2.5,
  stories: 2,
  tearOff: true,
  housewrap: true,
  housewrapPerSqFt: 0.38,
  accessories: [{ id: 'starter', label: 'Starter strip', linearFeet: 136, hoursPer100Lf: 0.4, materialPerLf: 1.15, note: 'no' }],
  addOns: [{ id: 'scaffold', label: 'Scaffold / pump jacks', hours: 3, parts: 380, enabled: true, note: 'no' }],
  hourlyWage: 32,
  burdenRate: 34,
  milesOneWay: 14,
  speedMph: 35,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 85,
  dumpsterCost: 525,
  otherCost: 10,
  overheadRate: 18,
  targetMargin: 28,
  proposedPrice: 18400,
  materialType: 'fiber-cement',
  secret: 'must-not-round-trip',
};

test('a shared link keeps waste, stories, tear-off, and target margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.walls[0].lengthFt, 40);
  assert.equal(restored.wastePercent, 12);
  assert.equal(restored.stories, 2);
  assert.equal(restored.tearOff, true);
  assert.equal(restored.housewrap, true);
  assert.equal(restored.targetMargin, 28);
  assert.equal(restored.proposedPrice, 18400);
  assert.equal(restored.dumpsterCost, 525);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.walls[0].extra, undefined);
  assert.equal(restored.accessories[0].note, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    stories: 2,
    eval: 'nope',
    walls: [{ name: 'x', lengthFt: 20, heightFt: 10, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.stories, 2);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.walls[0].proto, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['walls', 'wastePercent', 'stories', 'tearOff', 'housewrap', 'targetMargin', 'proposedPrice', 'dumpsterCost']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('the material the bid is for travels with it', () => {
  // Reconstructed on arrival from the three rates it stamps until 2026-08-29,
  // so a setter who typed their own supplier price handed the recipient
  // "Other / custom rates" over their own fiber cement.
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.materialType, 'fiber-cement');
});
