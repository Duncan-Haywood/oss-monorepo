import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, SHARE_FIELDS } from './share.mjs';

const sample = {
  containmentClass: 'classII',
  squareFootage: 600,
  containmentAreas: 2,
  crewSize: 4,
  crewHourlyRatePerWorker: 42,
  supervisorHourlyRate: 60,
  airMonitoringSamples: 8,
  airMonitoringCostPerSample: 70,
  wasteVolumeCubicYards: 5,
  disposalFeePerCubicYard: 150,
  requiresPermit: true,
  permitFee: 300,
  rushJob: true,
  rushSurchargePercentPct: 25,
  targetMarginPercentPct: 32,
  minimumJobFee: 700,
  naiveRatePerSquareFoot: 9,
  depositPercent: 50,
  validDays: 15,
  proposalExclusions: 'Post-abatement rebuild',
  paymentTerms: 'Due on completion',
  proposalNotes: 'Air clearance required before re-occupancy',
  secret: 'must-not-round-trip',
};

test('a shared link keeps every containment, crew, and cost figure', () => {
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.containmentClass, 'classII');
  assert.equal(restored.squareFootage, 600);
  assert.equal(restored.containmentAreas, 2);
  assert.equal(restored.crewSize, 4);
  assert.equal(restored.requiresPermit, true);
  assert.equal(restored.rushJob, true);
  assert.equal(restored.minimumJobFee, 700);
});

test('the proposal panel deposit and terms ride in the same link', () => {
  // See platform/proposal/term-ids.test.mjs: a contractor's deposit and hold
  // period must survive a shared link exactly as the pricing fields do, or
  // the recipient opens the sender's price under different money terms.
  const restored = decodeShare(encodeShare(sample));
  assert.equal(restored.depositPercent, 50);
  assert.equal(restored.validDays, 15);
  assert.equal(restored.proposalExclusions, 'Post-abatement rebuild');
  assert.equal(restored.paymentTerms, 'Due on completion');
  assert.equal(restored.proposalNotes, 'Air clearance required before re-occupancy');
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
    squareFootage: 200,
    __proto__: { polluted: true },
  }));
  const restored = decodeShare(`#${crafted}`);
  assert.equal(restored.eval, undefined);
  assert.equal(restored.polluted, undefined);
  assert.equal(restored.squareFootage, 200);
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
    'containmentClass', 'squareFootage', 'containmentAreas', 'crewSize',
    'crewHourlyRatePerWorker', 'supervisorHourlyRate', 'airMonitoringSamples',
    'airMonitoringCostPerSample', 'wasteVolumeCubicYards', 'disposalFeePerCubicYard',
    'requiresPermit', 'permitFee', 'rushJob', 'rushSurchargePercentPct',
    'targetMarginPercentPct', 'minimumJobFee', 'naiveRatePerSquareFoot',
    'depositPercent', 'validDays', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
  ]) {
    assert.ok(SHARE_FIELDS.includes(key), `missing ${key}`);
  }
});
