import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, reviewAll, toCsv, loadGrants, sampleGrants } from './calc.mjs';

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

test('loads only saved grant rows and recovers from damaged local storage', () => {
  assert.deepEqual(loadGrants(null), []);
  assert.deepEqual(loadGrants(''), []);
  assert.deepEqual(loadGrants('{not json'), []);
  assert.deepEqual(loadGrants('{"awardDate":"2026-01-01"}'), []);
  // The row that used to blank the queue: a null and a string alongside a real
  // award. Both are dropped; the real award survives.
  assert.deepEqual(
    loadGrants(JSON.stringify([{ name: 'Garden' }, null, 'not a grant'])),
    [{ name: 'Garden' }],
  );
});

test('a damaged saved queue still reviews the awards that survived', () => {
  const grants = loadGrants(JSON.stringify([null, { name: 'Garden', awardDate: '2026-01-01', intervalMonths: 6, awardAmount: 1000, spentAmount: 250 }]));
  const rows = reviewAll(grants, '2026-06-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].restrictedBalance, 750);
});

test('the sample shows every status, whatever day it is loaded', () => {
  // The point of deriving the dates: run the sample on a leap day, a
  // month-end, and an ordinary day and it still demonstrates all three
  // statuses. A hard-coded fixture decays into three overdue rows.
  for (const today of ['2026-08-27', '2026-01-31', '2028-02-29', '2026-12-31', '2027-03-01']) {
    const rows = reviewAll(sampleGrants(today), today);
    assert.deepEqual(
      rows.map((row) => row.status),
      ['Overdue', 'Due soon', 'On track'],
      `sample statuses drifted when loaded on ${today}`,
    );
  }
});

test('the sample rows carry the fields the queue and CSV read', () => {
  const rows = reviewAll(sampleGrants('2026-08-27'), '2026-08-27');
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(row.name && row.funder, 'a sample row is missing its name or funder');
    assert.match(row.nextReport, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(row.restrictedBalance));
  }
  // A fully spent award is worth showing: the balance column reads 0.00, not blank.
  assert.equal(rows.find((row) => row.name === 'Winter shelter capital').restrictedBalance, 0);
});

test('sampleGrants survives an unusable today', () => {
  assert.deepEqual(sampleGrants('not-a-date').map((row) => row.awardDate), [null, null, null]);
});
