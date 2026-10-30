// Property test for the ledger reports: seeded random balanced books (made up,
// no outside data). Invariants: the trial balance and balance sheet balance;
// profit and loss net equals the balance sheet's current earnings; a period split
// at any date adds up; the cash flow sections add up to the change in the bank
// accounts, and the months of cashFlowByMonth add up to the whole period.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACCOUNTS, validateEntry, trialBalance, profitAndLoss, balanceSheet, cashFlow, cashFlowByMonth, balances } from "./ledger.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10);

function randomBooks(r) {
  const pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const entries = [];
  for (let i = 0, n = pick(1, 40); i < n; i++) {
    const lines = [];
    let total = 0;
    for (let k = 0, m = pick(1, 3); k < m; k++) { const amt = pick(1, 500_000); total += amt; lines.push({ account: codes[pick(0, codes.length - 1)], debit: amt, credit: 0 }); }
    // the credit side may be split over one or two accounts
    const first = pick(1, total), split = first < total && r() < 0.5 ? [first, total - first] : [total];
    for (const amt of split) lines.push({ account: codes[pick(0, codes.length - 1)], debit: 0, credit: amt });
    entries.push({ id: `e${i}`, date: day(pick(0, 364)), memo: "made up", lines, source: "test" });
  }
  return entries;
}

test("ledger reports hold their invariants on 500 random books", () => {
  const r = rng(20261027);
  for (let i = 0; i < 500; i++) {
    const entries = randomBooks(r), tag = `book ${i}`;
    for (const e of entries) assert.deepEqual(validateEntry(e, DEFAULT_ACCOUNTS), [], tag);
    const cut = day(Math.floor(r() * 364)), next = day(Date.parse(cut) / 864e5 - Date.UTC(2026, 0, 1) / 864e5 + 1);
    const tb = trialBalance(entries, DEFAULT_ACCOUNTS);
    assert.ok(tb.balanced && tb.debit === tb.credit, tag);
    const bs = balanceSheet(entries, DEFAULT_ACCOUNTS, { to: cut });
    assert.ok(bs.balanced, tag);
    const pnl = profitAndLoss(entries, DEFAULT_ACCOUNTS, { to: cut });
    assert.equal(pnl.net, bs.currentEarnings, tag);
    assert.equal(pnl.net, pnl.netByMonth.reduce((a, v) => a + v, 0), tag);
    // split at `cut`: the two halves add up to the whole year
    const whole = profitAndLoss(entries, DEFAULT_ACCOUNTS), a = profitAndLoss(entries, DEFAULT_ACCOUNTS, { to: cut }), b = profitAndLoss(entries, DEFAULT_ACCOUNTS, { from: next });
    assert.equal(a.totalIncome + b.totalIncome, whole.totalIncome, tag);
    assert.equal(a.totalExpense + b.totalExpense, whole.totalExpense, tag);
    const cf = cashFlow(entries, DEFAULT_ACCOUNTS, { from: "2026-01-01", to: cut });
    assert.ok(cf.ties, "cash flow ties " + tag);
    const bank = DEFAULT_ACCOUNTS.filter((x) => x.type === "asset" && x.bank).map((x) => x.code);
    const bal = balances(entries, { to: cut });
    assert.equal(cf.closingCash, bank.reduce((s, c) => s + (bal.get(c) ?? 0), 0), "closing cash is the bank balances " + tag);
    const byMonth = cashFlowByMonth(entries, DEFAULT_ACCOUNTS, { from: "2026-01-01", to: cut });
    assert.equal(byMonth.months.reduce((s, m) => s + m.change, 0), cf.change, "months add up " + tag);
  }
});
