import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  edgeFeet: 120,
  ratePerFoot: 8.5,
  crewSize: 3,
  estimatedHours: 3.5,
  crewHourlyRate: 38,
  travelHours: 1.5,
  travelMiles: 42,
  mileageRate: 0.7,
  steamerFuelCost: 25,
  equipmentCostPerJob: 18,
  emergencyCall: true,
  emergencyPct: 40,
  overheadRate: 14,
  targetMargin: 32,
  minimumServiceCharge: 400,
  depositPercent: 50,
  validDays: 15,
  proposalExclusions: 'Gutter repair',
  paymentTerms: 'Due on completion',
  proposalNotes: 'Weather permitting',
  actualHours: 10,
  secret: 'must-not-round-trip',
};

test('a shared link keeps every rate, footage, and crew figure', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.edgeFeet, 120);
  assert.equal(restored.ratePerFoot, 8.5);
  assert.equal(restored.crewSize, 3);
  assert.equal(restored.emergencyCall, true);
  assert.equal(restored.emergencyPct, 40);
  assert.equal(restored.minimumServiceCharge, 400);
});

test('the actual on-site hours figure rides in the same link', () => {
  // A setter fills this field in after the job, to see the real profit
  // against the phone estimate -- exactly the moment a link gets sent back
  // to the office, so losing it here defeats the feature's own purpose.
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.actualHours, 10);
});

test('the proposal panel deposit and terms ride in the same link', () => {
  // See platform/proposal/term-ids.test.mjs: a setter's deposit and hold
  // period must survive a shared link exactly as the pricing fields do, or
  // the recipient opens the sender's price under different money terms.
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.depositPercent, 50);
  assert.equal(restored.validDays, 15);
  assert.equal(restored.proposalExclusions, 'Gutter repair');
  assert.equal(restored.paymentTerms, 'Due on completion');
  assert.equal(restored.proposalNotes, 'Weather permitting');
});

test('unknown keys never survive encoding or decoding', () => {
  const encoded = encodeShare(sample);
  assert.equal(encoded.includes('must-not-round-trip'), false);
  const restored = decodeShare(encoded);
  assert.equal(restored.secret, undefined);
});

test('a crafted fragment cannot inject keys outside the allowlist', () => {
  const crafted = encodeURIComponent(JSON.stringify({
    eval: 'nope',
    edgeFeet: 60,
    __proto__: { polluted: true },
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.polluted, undefined);
  assert.equal(restored.edgeFeet, 60);
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

test('decodeShare rejects a non-object payload instead of crashing', () => {
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2, 3]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify('a string'))), null);
});

test('SHARE_FIELDS includes every pricing input and every proposal term', () => {
  for (const key of [
    'edgeFeet', 'ratePerFoot', 'crewSize', 'estimatedHours', 'crewHourlyRate',
    'travelHours', 'travelMiles', 'mileageRate', 'steamerFuelCost', 'equipmentCostPerJob',
    'emergencyCall', 'emergencyPct', 'overheadRate', 'targetMargin', 'minimumServiceCharge',
    'actualHours',
    'depositPercent', 'validDays', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
  ]) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
