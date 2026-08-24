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
