import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecords, reconcile, explanation } from '../src/reconcile.mjs';

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

test('a blank or symbol-only amount cell is rejected, not silently read as $0.00', () => {
  // Number('') is 0, not NaN — a bare currency symbol and pure whitespace
  // strip down to '' the same way a missing export column does. Any of
  // these used to slip past the finite check and mint a phantom $0.00
  // record instead of failing the row the way a bad date already does.
  assert.throws(() => readRecords('date,net\n2026-08-20,\n2026-08-21,50.00', 'payouts'), /invalid date or amount/);
  assert.throws(() => readRecords('date,net\n2026-08-20,$\n2026-08-21,50.00', 'payouts'), /invalid date or amount/);
  assert.throws(() => readRecords('date,net\n2026-08-20,   \n2026-08-21,50.00', 'payouts'), /invalid date or amount/);
});

test('matches a payout split across multiple bank deposits', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,60.00\n2026-08-22,40.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  assert.equal(result[0].status, 'matched');
  assert.equal(result[0].deposits.length, 2);
  assert.equal(result[0].deposits.reduce((sum, deposit) => sum + deposit.cents, 0), 10000);
});

test('names a processor fee as the likely cause of a near-miss exception', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  // 2.9% + 30c is the shape of a card-processor deduction.
  const deposits = readRecords('date,amount\n2026-08-21,96.80', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.difference, 320);
  assert.equal(payoutRow.hint.feeLike, true);
  assert.match(explanation(payoutRow), /deposit is 3\.20 \(3\.20%\) short — consistent with a processor fee/);
  // The deposit half of the pair carries the same hint, so the operator sees
  // the explanation whichever row they are looking at.
  const depositRow = result.find(row => row.status === 'unmatched deposit');
  assert.equal(depositRow.hint, payoutRow.hint);
  // The deposit row has no payout date of its own, so the sentence has to name
  // both sides. Phrased as "this payout" it pointed at an empty table cell.
  assert.match(explanation(depositRow), /^Payout 2026-08-20 pairs with deposit 2026-08-21:/);
  assert.equal(explanation(depositRow), explanation(payoutRow));
});

test('refuses to call a large shortfall a fee, and still reports the gap', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,40.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.difference, 6000);
  assert.equal(payoutRow.hint.feeLike, false);
  assert.match(explanation(payoutRow), /verify against the processor statement/);
});

test('a deposit larger than its payout is never read as a fee', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,102.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.feeLike, false);
  assert.match(explanation(payoutRow), /deposit is 2\.00 \(2\.00%\) over/);
});

test('does not pair a deposit outside the date tolerance', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-09-30,96.80', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint, undefined);
  assert.equal(explanation(payoutRow), '');
});

test('offers one deposit as the explanation for only one payout', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,96.80', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const hinted = result.filter(row => row.status === 'unmatched payout' && row.hint);
  assert.equal(hinted.length, 1);
});

test('prefers the closest amount over the closest date', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  // The 2026-08-20 deposit is the same day but far off; the next day is a cent away.
  const deposits = readRecords('date,amount\n2026-08-20,10.00\n2026-08-21,99.99', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.deposit.date, '2026-08-21');
  assert.equal(payoutRow.hint.difference, 1);
});

test('matched rows carry no explanation', () => {
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,100.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  assert.equal(result[0].status, 'matched');
  assert.equal(explanation(result[0]), '');
});

test('explains an exact-amount deposit that landed just outside the tolerance', () => {
  // The most ordinary real exception: the bank posted the same money a few days
  // later than the operator allowed for. Before the hint window was widened
  // past the match window this row came back with an empty "What to check"
  // column, because any deposit near enough to be hinted had already matched.
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-25,100.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.difference, 0);
  assert.equal(payoutRow.hint.feeLike, false);
  assert.match(explanation(payoutRow), /same amount, 5 days apart/);
  assert.match(explanation(payoutRow), /outside the date tolerance you set/);
});

test('names the gap in whole days, singular at one day past the tolerance', () => {
  // The operator's next action is to widen the tolerance to cover the gap, so
  // the number is the actionable part of the sentence, not decoration.
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-22,100.00', 'deposits');
  const result = reconcile(payouts, deposits, 1);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.match(explanation(payoutRow), /same amount, 2 days apart/);

  const sameDay = reconcile(
    readRecords('date,net\n2026-08-20,100.00', 'payouts'),
    readRecords('date,amount\n2026-08-21,100.00', 'deposits'),
    0,
  );
  assert.match(explanation(sameDay.find(row => row.status === 'unmatched payout')), /same amount, 1 day apart/);
});

test('the widened hint window is still bounded', () => {
  // Wider than the matcher, not unbounded: a deposit more than a week past the
  // tolerance is not offered as a lead, because at that distance an equal
  // amount is as likely to be a different transaction as a late one.
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-09-05,100.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint, undefined);
  assert.equal(explanation(payoutRow), '');
});

test('still prefers the closest amount over the closest date across the wider window', () => {
  // Widening the window must not let a near-in-date but far-off-in-amount row
  // outrank an exact amount further out; the ranking is amount first.
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,10.00\n2026-08-27,100.00', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find(row => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.deposit.date, '2026-08-27');
  assert.equal(payoutRow.hint.difference, 0);
});
