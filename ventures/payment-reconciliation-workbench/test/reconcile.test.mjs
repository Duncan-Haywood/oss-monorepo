import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecords, reconcile } from '../src/reconcile.mjs';

const csv = `date,net\n2026-08-20,100.00\n2026-08-21,25.50`;
test('normalizes common CSV headers and matches within settlement tolerance', () => {
  const payouts = readRecords(csv, 'payouts');
  const deposits = readRecords('deposit_date,deposit_amount\n2026-08-22,100.00\n2026-08-29,25.50', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  assert.deepEqual(result.map(row => row.status), ['matched', 'unmatched payout', 'unmatched deposit']);
});

test('rejects files without recognizable columns', () => {
  assert.throws(() => readRecords('name,total\nA,4', 'payouts'), /date and amount/);
});

test('parses quoted commas and rejects malformed rows instead of silently dropping them', () => {
  const records = readRecords('date,net,note\n2026-08-20,"100.00","monthly, batch"', 'payouts');
  assert.equal(records[0].cents, 10000);
  assert.throws(() => readRecords('date,net\n2026-08-20,100.00\nnot-a-date,25.50', 'payouts'), /invalid date or amount/);
});
