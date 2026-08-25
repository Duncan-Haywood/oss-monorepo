import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCharges, auditTotals, csvForReview } from './audit.mjs';

const rows = [
  { invoice: 'INV-1', reference: 'PO-8', code: 'LIFT', billed: '125', expected: '75' },
  { invoice: 'INV-1', reference: 'PO-8', code: 'LIFT', billed: '125', expected: '75' },
  { invoice: 'INV-2', reference: 'PO-9', code: '', billed: '20', expected: '20' },
];

test('flags overages, duplicates, and missing codes', () => {
  const results = auditCharges(rows);
  assert.deepEqual(results.map(row => row.flags), [
    ['Over expected by $50.00'],
    ['Possible duplicate', 'Over expected by $50.00'],
    ['Missing accessorial code'],
  ]);
  assert.deepEqual(auditTotals(results), { billed: 270, expected: 170, flagged: 3, recoverable: 100 });
});

test('escapes review CSV values', () => {
  const csv = csvForReview(auditCharges([{ invoice: 'I"1', reference: 'R', code: 'FUEL', billed: 10, expected: 10 }]));
  assert.match(csv, /"I""1"/);
});

test('flags malformed and negative amounts instead of treating them as zero', () => {
  const results = auditCharges([
    { invoice: 'INV-3', reference: 'PO-10', code: 'FUEL', billed: 'not-a-number', expected: '10' },
    { invoice: 'INV-4', reference: 'PO-11', code: 'DET', billed: '-5', expected: '0' },
  ]);
  assert.deepEqual(results.map(row => row.flags), [
    ['Invalid billed amount'],
    ['Invalid billed amount'],
  ]);
  assert.equal(results[0].billed, 0);
  assert.equal(results[1].variance, -5);
});

test('flags blank amounts as invalid', () => {
  const results = auditCharges([{ invoice: 'INV-5', reference: 'PO-12', code: 'FUEL', billed: '', expected: ' ' }]);
  assert.deepEqual(results[0].flags, ['Invalid billed amount', 'Invalid expected amount']);
});
