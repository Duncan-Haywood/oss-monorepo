import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSettlement, compareQuotes, tieredCommission, INPUT_IDS, B_INPUT_IDS } from './calc.mjs';

// Hand-verified: $10,000 estimated sale, 40% on the first $2,000, 30% on the
// next $6,000 (up to $8,000), 25% above $8,000.
//   tier1: $2,000 x 40% = $800
//   tier2: $6,000 x 30% = $1,800
//   tier3: $2,000 x 25% = $500
//   commission = $3,100; fees = $250 + $150 + $100 = $500
//   net = $10,000 - $3,100 - $500 = $6,400 (retained 36%)
const TIERED = {
  grossSale: 10000,
  tier1Rate: 40, tier1Threshold: 2000,
  tier2Rate: 30, tier2Threshold: 8000,
  tier3Rate: 25,
  setupFee: 250, cardProcessingFee: 150, haulAwayFee: 100,
  minimumGuarantee: 0,
};

// Same $10,000 sale, a flat 30% commission (entered as tier 1 spanning the
// whole sale) plus a $200 card-processing fee only.
//   commission = $10,000 x 30% = $3,000; fees = $200
//   net = $10,000 - $3,000 - $200 = $6,800 (retained 32%)
const FLAT = {
  grossSale: 10000,
  tier1Rate: 30, tier1Threshold: 999999,
  tier2Rate: 0, tier2Threshold: 999999,
  tier3Rate: 0,
  setupFee: 0, cardProcessingFee: 200, haulAwayFee: 0,
  minimumGuarantee: 0,
};

test('tieredCommission splits a sale across three tiers by hand-verified arithmetic', () => {
  const { t1Base, t2Base, t3Base, commission } = tieredCommission(10000, 40, 2000, 30, 8000, 25);
  assert.equal(t1Base, 2000);
  assert.equal(t2Base, 6000);
  assert.equal(t3Base, 2000);
  assert.equal(commission, 3100);
});

test('a single flat-rate quote is entered as tier 1 spanning the whole sale', () => {
  const { t1Base, t2Base, t3Base, commission } = tieredCommission(10000, 30, 999999, 0, 999999, 0);
  assert.equal(t1Base, 10000);
  assert.equal(t2Base, 0);
  assert.equal(t3Base, 0);
  assert.equal(commission, 3000);
});

test('the tiered quote settles at the hand-verified $6,400 net, 36% retained', () => {
  const result = calculateSettlement(TIERED);
  assert.equal(result.ok, true);
  assert.equal(result.commission, 3100);
  assert.equal(result.fees, 500);
  assert.equal(result.net, 6400);
  assert.ok(Math.abs(result.totalRetained - 36) < 1e-9);
  assert.equal(result.guaranteeApplied, false);
});

test('the flat-rate quote settles at $6,800 net, 32% retained', () => {
  const result = calculateSettlement(FLAT);
  assert.equal(result.ok, true);
  assert.equal(result.commission, 3000);
  assert.equal(result.fees, 200);
  assert.equal(result.net, 6800);
  assert.ok(Math.abs(result.totalRetained - 32) < 1e-9);
});

test('a lower headline rate is not always the better quote: the tiered schedule nets $400 less', () => {
  const input = Object.fromEntries([
    ['grossSale', TIERED.grossSale],
    ...Object.keys(TIERED).filter(k => k !== 'grossSale').map(k => [k, TIERED[k]]),
    ...Object.keys(FLAT).filter(k => k !== 'grossSale').map(k => [`b${k[0].toUpperCase()}${k.slice(1)}`, FLAT[k]]),
  ]);
  const result = compareQuotes(input);
  assert.equal(result.ok, true);
  assert.equal(result.a.net, 6400);
  assert.equal(result.b.net, 6800);
  assert.equal(result.difference, -400);
  assert.equal(result.better, 'b');
});

test('a minimum guarantee floors the settlement when the computed net falls short', () => {
  const result = calculateSettlement({
    grossSale: 1000,
    tier1Rate: 50, tier1Threshold: 999999,
    tier2Rate: 0, tier2Threshold: 999999,
    tier3Rate: 0,
    setupFee: 100, cardProcessingFee: 0, haulAwayFee: 0,
    minimumGuarantee: 600,
  });
  assert.equal(result.ok, true);
  assert.equal(result.rawNet, 400);
  assert.equal(result.guaranteeApplied, true);
  assert.equal(result.net, 600);
  assert.match(result.notes[0], /the guarantee applies/);
});

test('a guarantee that is never reached leaves the computed net untouched', () => {
  const result = calculateSettlement({ ...TIERED, minimumGuarantee: 5000 });
  assert.equal(result.guaranteeApplied, false);
  assert.equal(result.net, 6400);
});

test('a settlement that goes negative is flagged, not hidden', () => {
  const result = calculateSettlement({
    grossSale: 500,
    tier1Rate: 30, tier1Threshold: 999999,
    tier2Rate: 0, tier2Threshold: 999999,
    tier3Rate: 0,
    setupFee: 600, cardProcessingFee: 0, haulAwayFee: 0,
    minimumGuarantee: 0,
  });
  assert.equal(result.ok, true);
  assert.ok(result.net < 0);
  assert.match(result.notes[0], /negative settlement/);
});

test('a required field left blank is a validation error, not a silent zero', () => {
  const result = calculateSettlement({ ...TIERED, grossSale: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'grossSale');
});

test('a negative gross sale is rejected', () => {
  const result = calculateSettlement({ ...TIERED, grossSale: -100 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /at least 0/);
});

test('every quote field has a matching b-prefixed comparison field', () => {
  for (const id of INPUT_IDS.filter(id => id !== 'grossSale')) {
    const expected = `b${id[0].toUpperCase()}${id.slice(1)}`;
    assert.ok(B_INPUT_IDS.includes(expected), `expected ${expected} in B_INPUT_IDS`);
  }
});

test('compareQuotes surfaces both quotes\' own validation errors', () => {
  const result = compareQuotes({ grossSale: '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2);
});
