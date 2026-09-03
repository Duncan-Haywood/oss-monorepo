import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  services: [
    { name: 'Turf mowing', unit: 'sqft', quantity: 10000, productionRate: 20000, extra: 'drop-me' },
    { name: 'Custom detail', unit: 'minutes', quantity: 30, productionRate: 12 },
  ],
  visitsPerWeek: 1,
  serviceWeeksPerYear: 32,
  oneWayMinutes: 18,
  crewSize: 2,
  hourlyWage: 22,
  burdenRate: 25,
  fuelPerVisit: 8,
  dumpPerVisit: 5,
  equipmentMonthly: 40,
  otherMonthly: 10,
  overheadRate: 12,
  targetMargin: 25,
  proposedPrice: 180,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every service and every cost field the sender saw', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.services[0].name, 'Turf mowing');
  assert.equal(restored.services[0].quantity, 10000);
  assert.equal(restored.services[1].name, 'Custom detail');
  assert.equal(restored.services[1].productionRate, 12);
  assert.equal(restored.crewSize, 2);
  assert.equal(restored.oneWayMinutes, 18);
  assert.equal(restored.targetMargin, 25);
  assert.equal(restored.proposedPrice, 180);
});

test('every field a new share link would need has an allowlist rule', () => {
  for (const key of ['crewSize', 'hourlyWage', 'targetMargin', 'proposedPrice', 'oneWayMinutes']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('unknown keys never survive encoding or decoding, at either level', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.services[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    services: [{ name: 'x', quantity: 12, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.services[0].proto, undefined);
  assert.equal(restored.services[0].quantity, 12);
});

test('a blank proposed price is dropped rather than encoded as the number zero', () => {
  // `Number('')` is 0 in JavaScript. `proposedPrice` left blank means "no
  // price to compare"; an explicit 0 means "I am considering giving this
  // stop away". Confusing the two would let a shared link invent a price
  // the sender never typed.
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

test('a services list missing from the payload leaves services undefined rather than an empty array', () => {
  const restored = decodeShare(encodeShare({ ...sample, services: [] }));
  assert.equal(restored.services, undefined);
});
