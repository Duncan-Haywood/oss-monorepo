// Boundary guards found by a red-team campaign on ledger.mjs (2026-10-28): a
// chart row missing only its code or only its name is rejected, and one negative
// amount is rejected even when the entry still balances.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACCOUNTS, accountLedger, parseAccounts, ratios, validateEntry } from "./ledger.mjs";

test("parseAccounts rejects a row missing its name or its code", () => {
  const r = parseAccounts("1000,,asset\n,Cash,asset\n1010,Petty cash,asset");
  assert.deepEqual(r.accounts.map((a) => a.code), ["1010"]);
  assert.equal(r.problems.length, 2);
});

test("validateEntry rejects a single negative amount in a balanced entry", () => {
  const [a, b] = DEFAULT_ACCOUNTS.map((x) => x.code);
  for (const lines of [
    [{ account: a, debit: -100, credit: 0 }, { account: b, debit: 0, credit: -100 }],
    [{ account: a, debit: 0, credit: -100 }, { account: b, debit: -100, credit: 0 }],
  ]) {
    const p = validateEntry({ date: "2026-01-02", lines }, DEFAULT_ACCOUNTS);
    assert.ok(p.some((s) => /whole cents/.test(s)), JSON.stringify(p));
  }
  assert.deepEqual(validateEntry({ date: "2026-01-02", lines: [{ account: a, debit: 100, credit: 0 }, { account: b, debit: 0, credit: 100 }] }, DEFAULT_ACCOUNTS), []);
});

test("ratios divides by a denominator of one cent", () => {
  const pnl = { totalIncome: 1, net: 1, expense: [] };
  const bs = { assets: [{ code: "1000", amount: 5 }], liabilities: [{ code: "2050", amount: 1 }], totalLiabilities: 1, totalEquity: 1 };
  const r = ratios(pnl, bs);
  assert.equal(r.currentRatio, 5);
  assert.equal(r.debtToEquity, 1);
  assert.equal(r.netMargin, 1);
});

test("accountLedger sums only the requested account's lines in a two-account entry", () => {
  const [a, b] = DEFAULT_ACCOUNTS.map((x) => x.code);
  const entries = [{ id: 1, date: "2026-01-02", memo: "m", lines: [{ account: a, debit: 700, credit: 0 }, { account: b, debit: 0, credit: 700 }] }];
  const rows = accountLedger(entries, DEFAULT_ACCOUNTS, a);
  assert.equal(rows.length, 1);
  assert.equal(Math.abs(rows[0].amount), 700);
});

// Red-team campaign on ledger.mjs (2026-10-29): cashFlowByMonth boundaries.
import { cashFlowByMonth } from "./ledger.mjs";

test("cashFlowByMonth: empty books give a zero burn, a month ends on its last day, and recent burn counts fixed-asset purchases", () => {
  assert.deepEqual(cashFlowByMonth([], DEFAULT_ACCOUNTS, {}), { months: [], recentBurn: 0, recentRunwayMonths: null });
  const bank = DEFAULT_ACCOUNTS.find((a) => a.bank).code;
  const fixed = DEFAULT_ACCOUNTS.find((a) => a.type === "asset" && a.code >= "1500" && a.code !== "1590").code;
  const e = (id, date, debit, credit, amt) => ({ id, date, memo: id, lines: [{ account: debit, debit: amt, credit: 0 }, { account: credit, debit: 0, credit: amt }] });
  const books = [e("a", "2026-01-01", bank, "3000", 1000000), e("b", "2026-01-31", "6060", bank, 100000), e("c", "2026-02-01", "6060", bank, 300000), e("d", "2026-02-10", fixed, bank, 200000)];
  const r = cashFlowByMonth(books, DEFAULT_ACCOUNTS, {});
  assert.deepEqual(r.months.map((m) => m.operating), [-100000, -300000], "1 Feb belongs to February");
  assert.deepEqual(r.months.map((m) => m.investing), [0, -200000]);
  assert.equal(r.recentBurn, 300000, "(100k + 300k + 200k) over two months");
});
