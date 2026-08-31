import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  piles: [
    { name: 'Mixed household junk', quantity: 6, lbsPerUnit: 200, specialFeeEach: 0, extra: 'drop-me' },
    { name: 'Appliance (each)', quantity: 2, lbsPerUnit: 200, specialFeeEach: 25 },
  ],
  truckCapacityCubicYards: 15,
  dumpFeePerTon: 85,
  dumpMinimum: 40,
  surchargeRate: 10,
  onSiteHours: 1.5,
  stairsFlights: 2,
  minutesPerFlight: 3,
  longCarryMinutes: 5,
  oneWayMinutes: 20,
  dumpMinutes: 30,
  crewSize: 2,
  hourlyWage: 22,
  burdenRate: 25,
  fuelPerJob: 15,
  otherJobCost: 10,
  overheadRate: 12,
  targetMargin: 30,
  minimumCharge: 175,
  proposedPrice: 650,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every pile and the margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.piles.length, 2);
  assert.equal(restored.piles[0].name, 'Mixed household junk');
  assert.equal(restored.piles[0].quantity, 6);
  assert.equal(restored.piles[1].name, 'Appliance (each)');
  assert.equal(restored.piles[1].specialFeeEach, 25);
  assert.equal(restored.targetMargin, 30);
  assert.equal(restored.proposedPrice, 650);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.piles[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    piles: [{ name: 'x', quantity: 3, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.piles[0].proto, undefined);
  assert.equal(restored.piles[0].quantity, 3);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('a pile with nothing usable is dropped rather than restored as an empty row', () => {
  const crafted = encodeURIComponent(JSON.stringify({ piles: [{}, { name: 'ok', quantity: 4 }] }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.piles.length, 1);
  assert.equal(restored.piles[0].name, 'ok');
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['dumpFeePerTon', 'truckCapacityCubicYards', 'targetMargin', 'proposedPrice', 'minimumCharge']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
