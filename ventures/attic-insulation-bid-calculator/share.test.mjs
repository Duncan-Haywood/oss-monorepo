import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  areas: [
    { name: 'Main attic', lengthFt: 40, widthFt: 28, existingR: 13, targetR: 49, vaulted: false, extra: 'drop-me' },
    { name: 'Cathedral', lengthFt: 24, widthFt: 16, existingR: 19, targetR: 49, vaulted: true },
  ],
  rPerInch: 3.7,
  cuFtPerBag: 25,
  pricePerBag: 14,
  blowHoursPer1000: 1.4,
  baffleCount: 36,
  bafflePrice: 1.85,
  penetrations: 18,
  removeExisting: true,
  removalHoursPer1000: 2.4,
  addOns: [{ id: 'hatchDam', label: 'Attic hatch dam', hours: 0.6, parts: 45, enabled: true, note: 'no' }],
  hourlyWage: 32,
  burdenRate: 30,
  milesOneWay: 14,
  speedMph: 28,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 85,
  dumpsterCost: 375,
  otherCost: 10,
  overheadRate: 15,
  targetMargin: 28,
  proposedPrice: 4800,
  productType: 'fiberglass',
  secret: 'must-not-round-trip',
};

test('a shared link keeps target R, bag yield, air sealing, removal, and margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.areas[0].lengthFt, 40);
  assert.equal(restored.areas[0].targetR, 49);
  assert.equal(restored.areas[1].vaulted, true);
  assert.equal(restored.rPerInch, 3.7);
  assert.equal(restored.cuFtPerBag, 25);
  assert.equal(restored.penetrations, 18);
  assert.equal(restored.removeExisting, true);
  assert.equal(restored.targetMargin, 28);
  assert.equal(restored.proposedPrice, 4800);
  assert.equal(restored.dumpsterCost, 375);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.areas[0].extra, undefined);
  assert.equal(restored.addOns[0].note, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    targetR: 60,
    eval: 'nope',
    areas: [{ name: 'x', lengthFt: 10, widthFt: 10, existingR: 13, targetR: 49, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.areas[0].proto, undefined);
  assert.equal(restored.areas[0].targetR, 49);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['areas', 'rPerInch', 'cuFtPerBag', 'penetrations', 'removeExisting', 'targetMargin', 'proposedPrice', 'dumpsterCost']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});

test('the product the bid is for travels with it', () => {
  // Reconstructed on arrival from the four rates it stamps until 2026-08-29,
  // so a setter who typed their own bag price handed the recipient "Other /
  // custom rates" and a draft scope that said only "blow insulation".
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.productType, 'fiberglass');
});
