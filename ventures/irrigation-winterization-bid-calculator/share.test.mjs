import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  systems: [
    { name: 'Typical residential', sprayZones: 6, rotorZones: 2, dripZones: 2, extra: 'drop-me' },
    { name: 'Small commercial / HOA', sprayZones: 8, rotorZones: 12, dripZones: 4 },
  ],
  sprayMinutes: 4,
  rotorMinutes: 5,
  dripMinutes: 8,
  backflows: 2,
  backflowMinutes: 15,
  freezeWarning: true,
  afterHoursPremium: 50,
  hourlyWage: 28,
  burdenRate: 32,
  milesOneWay: 14,
  speedMph: 32,
  setupHours: 0.4,
  minOnSiteHours: 1.25,
  tripFee: 30,
  compressorCost: 14,
  fittingsCost: 5,
  otherCost: 8,
  overheadRate: 16,
  targetMargin: 28,
  proposedPrice: 75,
  secret: 'must-not-round-trip',
};

test('a shared link keeps drip zones, backflows, freeze warning, and target margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.systems[0].dripZones, 2);
  assert.equal(restored.systems[1].rotorZones, 12);
  assert.equal(restored.backflows, 2);
  assert.equal(restored.freezeWarning, true);
  assert.equal(restored.afterHoursPremium, 50);
  assert.equal(restored.targetMargin, 28);
  assert.equal(restored.proposedPrice, 75);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.systems[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    backflows: 3,
    eval: 'nope',
    systems: [{ name: 'x', sprayZones: 4, rotorZones: 0, dripZones: 1, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.backflows, 3);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.systems[0].proto, undefined);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['systems', 'dripZones', 'backflows', 'freezeWarning', 'afterHoursPremium', 'targetMargin', 'proposedPrice', 'milesOneWay']) {
    if (key === 'dripZones') {
      assert.ok(SHARE_FIELDS.includes('systems'), 'drip zones ride inside systems');
      continue;
    }
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
