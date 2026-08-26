import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS, TEXT_FIELD_IDS } from './share.mjs';

const sample = {
  contractValue: 100000,
  retainagePct: 10,
  paidToDate: 75000,
  daysOutstanding: 90,
  annualCarryingRatePct: 12,
  percentComplete: 80,
  reductionAtPct: 50,
  reducedRetainagePct: 5,
  typicalHoldDays: 90,
  partialOffer: 5000,
  waitDays: 60,
  project: 'Main Street remodel',
  payer: 'Acme Construction',
  invoice: 'Pay application #4',
  due: 'August 30, 2026',
};

test('round-trips worksheet numbers and short project labels', () => {
  assert.deepEqual(decodeInputs(encodeInputs(sample)), sample);
});

test('drops unknown fields and negative numbers', () => {
  const encoded = encodeInputs({ ...sample, secret: 'nope', retainagePct: -1, extra: 12 });
  const decoded = decodeInputs(encoded);
  assert.equal('secret' in decoded, false);
  assert.equal('extra' in decoded, false);
  assert.equal('retainagePct' in decoded, false);
  assert.equal(decoded.contractValue, 100000);
});

test('accepts hash or query prefixes and ignores control characters', () => {
  const query = encodeInputs(sample);
  assert.deepEqual(decodeInputs(`#${query}`), sample);
  assert.deepEqual(decodeInputs(`?${query}`), sample);
  const dirty = decodeInputs('project=Main%0AStreet%07job&contractValue=100000');
  assert.equal(dirty.project, 'Main Street job');
  assert.equal(dirty.contractValue, 100000);
});

test('caps shared text so a pasted novel cannot bloat the URL', () => {
  const decoded = decodeInputs(encodeInputs({ project: 'x'.repeat(200) }));
  assert.equal(decoded.project.length, 80);
});

test('exports the field lists the page persists and shares', () => {
  assert.ok(NUMBER_FIELD_IDS.includes('percentComplete'));
  assert.ok(NUMBER_FIELD_IDS.includes('typicalHoldDays'));
  assert.ok(NUMBER_FIELD_IDS.includes('partialOffer'));
  assert.ok(NUMBER_FIELD_IDS.includes('waitDays'));
  assert.ok(TEXT_FIELD_IDS.includes('project'));
});
