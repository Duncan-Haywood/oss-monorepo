import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecords, reconcile } from '../reconcile.mjs';
import { reviewCsv, csvCell, csvNumber, REVIEW_HEADER } from '../export.mjs';

test('the review CSV carries the header, the amounts, and the explanation', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,96.80', 'deposits');
  const lines = reviewCsv(reconcile(payouts, deposits, 3)).split('\n');
  assert.equal(lines[0], REVIEW_HEADER);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^unmatched payout,2026-08-20,,10000,0,320,/);
  assert.match(lines[1], /consistent with a processor fee/);
});

test('neutralises a date cell a spreadsheet would run as a formula', () => {
  // A processor export is a file from somewhere else; it can contain anything
  // that parses as a date to Date.parse, including a leading "+".
  const payouts = readRecords('date,net\n+2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,50.00', 'deposits');
  const csv = reviewCsv(reconcile(payouts, deposits, 3));
  assert.match(csv, /,'\+2026-08-20,/);
});

test('formula guard covers every spreadsheet trigger character', () => {
  for (const prefix of ['=', '+', '-', '@']) {
    assert.equal(csvCell(`${prefix}SUM(A1)`), `'${prefix}SUM(A1)`);
  }
  // The guard and the quoting compose: the apostrophe goes on first, then the
  // whole cell is quoted because it contains quotes of its own.
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('2026-08-20'), '2026-08-20');
});

test('quotes a cell containing a comma, a quote, or a newline', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
});

test('numeric cells stay summable, including a negative difference', () => {
  // A deposit larger than its payout gives a negative difference. Prefixing it
  // with an apostrophe would turn a figure the recipient sums into text.
  assert.equal(csvNumber(-320), '-320');
  assert.equal(csvNumber(0), '0');
  assert.equal(csvNumber(''), '');
});

test('a grouped match lists every contributing deposit date', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,60.00\n2026-08-22,40.00', 'deposits');
  const csv = reviewCsv(reconcile(payouts, deposits, 3));
  assert.match(csv, /matched,2026-08-20,2026-08-21 \+ 2026-08-22,10000,2,,/);
});
