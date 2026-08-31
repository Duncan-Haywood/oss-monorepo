import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  slabs: [
    { name: 'Broom finish', lengthFt: 20, widthFt: 40, thicknessIn: 4, hoursPer100: 0.85, extra: 'drop-me' },
    { name: 'Stamped / decorative', lengthFt: 10, widthFt: 12, thicknessIn: 5, hoursPer100: 2.5 },
  ],
  wastePct: 8,
  concretePerYd: 165,
  formPerLf: 3.5,
  formHours: 4,
  reinforcementPerSqFt: 0.35,
  pumpFee: 0,
  shortLoadThresholdYd: 3,
  shortLoadFee: 150,
  demoSqFt: 0,
  demoThicknessIn: 0,
  haulPerYd: 45,
  demoHours: 0,
  prepHours: 3,
  hourlyWage: 32,
  burdenRate: 28,
  otherCost: 150,
  overheadRate: 12,
  targetMargin: 20,
  proposedPrice: 9800,
  reinforcement: 'rebar',
  access: 'pump',
  secret: 'must-not-round-trip',
};

test('a shared link keeps every slab, the reinforcement/access choice, and the margin', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.slabs.length, 2);
  assert.equal(restored.slabs[0].name, 'Broom finish');
  assert.equal(restored.slabs[0].thicknessIn, 4);
  assert.equal(restored.slabs[1].name, 'Stamped / decorative');
  assert.equal(restored.slabs[1].hoursPer100, 2.5);
  assert.equal(restored.reinforcement, 'rebar');
  assert.equal(restored.access, 'pump');
  assert.equal(restored.targetMargin, 20);
  assert.equal(restored.proposedPrice, 9800);
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('drop-me'), false);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
  assert.equal(restored.slabs[0].extra, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    slabs: [{ name: 'x', lengthFt: 20, widthFt: 10, thicknessIn: 4, proto: 1 }],
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.slabs[0].proto, undefined);
  assert.equal(restored.slabs[0].thicknessIn, 4);
});

test('empty or broken fragments are absent, not a crash', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare('#'), null);
  assert.equal(decodeShare('#not-json'), null);
  assert.equal(decodeShare('#%7B%7D'), null);
});

test('a slab with nothing usable is dropped rather than restored as an empty row', () => {
  const crafted = encodeURIComponent(JSON.stringify({ slabs: [{}, { name: 'ok', lengthFt: 5 }] }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.slabs.length, 1);
  assert.equal(restored.slabs[0].name, 'ok');
});

test('SHARE_FIELDS includes the lines a dropped field would silently change', () => {
  for (const key of ['wastePct', 'concretePerYd', 'shortLoadThresholdYd', 'targetMargin', 'proposedPrice', 'haulPerYd']) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
