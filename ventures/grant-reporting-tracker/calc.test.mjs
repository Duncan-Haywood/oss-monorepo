import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, reviewAll, toCsv } from './calc.mjs';

test('adds months without overflowing short months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('orders grants and labels overdue and due-soon reports', () => {
  const rows = reviewAll([
    { name: 'Future', funder: 'A', awardDate: '2026-01-01', intervalMonths: 12, awardAmount: 100, spentAmount: 25 },
    { name: 'Late', funder: 'B', awardDate: '2025-01-01', intervalMonths: 6, awardAmount: 80, spentAmount: 20 },
  ], '2026-08-24');
  assert.equal(rows[0].name, 'Late');
  assert.equal(rows[0].status, 'Overdue');
  assert.equal(rows[0].restrictedBalance, 60);
  assert.equal(rows[1].status, 'On track');
});

test('escapes CSV values and preserves the review fields', () => {
  const csv = toCsv([{ name: 'Food, Inc.', funder: 'A "Funder"', nextReport: '2026-09-01', status: 'Due soon', restrictedBalance: 10 }]);
  assert.match(csv, /"Food, Inc\."/);
  assert.match(csv, /"A ""Funder"""/);
});

test('does not mutate saved award data while reviewing', () => {
  const grant = { name: 'Annual award', awardDate: '2026-01-31', intervalMonths: '1', awardAmount: '500', spentAmount: '125' };
  const before = JSON.stringify(grant);
  reviewAll([grant], '2026-02-01');
  assert.equal(JSON.stringify(grant), before);
});
