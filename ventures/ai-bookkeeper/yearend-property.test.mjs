// Property test for the ledger reports and year-end close: seeded random bank lines (made
// up, no outside data). Invariants: the trial balance and balance sheet balance; the P&L
// net equals income less expense; closing a year zeroes that year's income and expense in
// the closing-inclusive journal, keeps the balance sheet totals, locks the year, and
// reopening restores the books exactly.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, reports } from "./engine.mjs";
import { closeYear, reopenYear } from "./yearend.mjs";
import { trialBalance, balances, accountMap } from "./ledger.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const CATS = ["4000", "6130", "6010", "3100", "3010"];

test("reports balance and a year-end close keeps them on 200 random books", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 200; i++) {
    const rows = [];
    for (let k = pick(3, 25); k > 0; k--) {
      const cents = pick(1, 900_000) * (r() < 0.5 ? 1 : -1);
      const date = `${pick(2024, 2025)}-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`;
      rows.push([date, `LINE${k}`, (cents / 100).toFixed(2), CATS[pick(0, CATS.length - 1)]]);
    }
    const tag = JSON.stringify(rows);
    const b0 = importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
    const cat = Object.fromEntries(rows.map(([, n, , c]) => [n, c]));
    const books = confirm(b0, Object.fromEntries(b0.transactions.map((t) => [t.id, cat[t.desc.split(" ")[0]]])));
    const all = journal(books), map = accountMap(books.accounts);
    assert.equal(trialBalance(all, books.accounts).balanced, true, "trial " + tag);
    const rep = reports(books, { from: "2024-01-01", to: "2025-12-31" });
    assert.equal(rep.balanceSheet.balanced, true, "bs " + tag);
    assert.equal(rep.profitAndLoss.net, rep.profitAndLoss.totalIncome - rep.profitAndLoss.totalExpense, tag);
    assert.equal(rep.cashFlow.ties, true, "cash " + tag);
    const before = reports(books, { to: "2025-12-31" }).balanceSheet;

    const c = closeYear(books, 2024);
    assert.equal(c.lockedThrough, "2024-12-31", tag);
    const closed = journal(c, { withClosing: true });
    for (const e of closed.filter((e) => e.closing)) assert.equal(e.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0, tag);
    for (const [code, v] of balances(closed, { to: "2024-12-31" })) {
      const t = map.get(code)?.type;
      if (t === "income" || t === "expense") assert.equal(v, 0, `P&L account ${code} open after close ${tag}`);
    }
    const after = reports(c, { to: "2025-12-31" }).balanceSheet;
    assert.equal(after.balanced, true, tag);
    assert.equal(after.totalAssets, before.totalAssets, "assets unchanged " + tag);
    assert.equal(after.totalLiabilities, before.totalLiabilities, tag);
    assert.equal(reports(c, { from: "2024-01-01", to: "2025-12-31" }).profitAndLoss.net, rep.profitAndLoss.net, "P&L still shows closed year " + tag);

    assert.deepEqual(reopenYear(c, 2024), books, "reopen restores " + tag);
  }
});
