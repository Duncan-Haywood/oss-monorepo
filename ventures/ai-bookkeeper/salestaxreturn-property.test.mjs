// Property test for the sales tax return: seeded random invoices and credit notes (made up,
// no outside data). Invariants: the tax over all periods equals the signed tax lines typed in,
// whatever the filing frequency; period rows add up to their period; every due date is a real
// date after its period ends; and every state's due-day rule gives a due date on or after the
// period end that falls on a business day once moved.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement } from "./engine.mjs";
import { salesTaxReturn, dueDate, stateDueDay, nextBusinessDay, STATE_DUE_DAYS } from "./salestaxreturn.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const JURS = ["CA state", "LA county", "City"];

test("sales tax returns hold their invariants on 150 random ledgers", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 150; i++) {
    const lines = ["type,number,date,due,party,amount,account,description"];
    let expected = 0;
    const n = pick(1, 25);
    for (let k = 1; k <= n; k++) {
      const credit = r() < 0.2, date = `2026-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`;
      const sale = pick(100, 900000), type = credit ? "credit note" : "invoice";
      lines.push(`${type},${k},${date},,P${k},${(sale / 100).toFixed(2)},4000,Goods`);
      for (const j of JURS) if (r() < 0.6) {
        const tax = pick(1, Math.max(1, Math.floor(sale / 8)));
        lines.push(`${type},${k},${date},,P${k},${(tax / 100).toFixed(2)},2100,${j}`);
        expected += credit ? -tax : tax;
      }
    }
    const csv = lines.join("\n") + "\n", tag = `case ${i} (${n} docs)`;
    const books = addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books, csv).books;
    for (const frequency of ["monthly", "quarterly", "annual"]) {
      const res = salesTaxReturn(books, { frequency });
      assert.equal(res.totals.tax, expected, `total tax ${frequency} ${tag}`);
      assert.equal(res.periods.reduce((a, p) => a + p.rows.reduce((b, x) => b + x.tax, 0), 0), expected, `periods ${frequency} ${tag}`);
      for (const p of res.periods) {
        for (const x of p.rows) {
          assert.equal(x.payable, x.tax - x.discount, `payable ${tag}`);
          assert.ok(!Number.isNaN(Date.parse(x.due)) && x.due > p.period.slice(0, 4) + "-00", `due ${tag}`);
          assert.ok(x.taxCredited >= 0 && x.creditedSales >= 0, `credits are positive ${tag}`);
        }
        assert.equal(p.payable, p.rows.reduce((a, x) => a + x.payable, 0), `period payable ${tag}`);
      }
    }
  }
});

test("every state's due-day rule lands after the period and on a business day", () => {
  const periods = { monthly: ["2026-01", "2026-02", "2026-12"], quarterly: ["2026-Q1", "2026-Q4"], annual: ["2026"] };
  for (const state of Object.keys(STATE_DUE_DAYS))
    for (const [frequency, list] of Object.entries(periods))
      for (const period of list) {
        const raw = dueDate(period, stateDueDay(state, frequency));
        const end = period.length === 4 ? `${period}-12-31` : period.includes("Q") ? `${period.slice(0, 4)}-${["03-31", "06-30", "09-30", "12-31"][period.at(-1) - 1]}` : `${period}-28`;
        assert.ok(raw > end, `${state} ${frequency} ${period}: ${raw} should be after ${end}`);
        const moved = nextBusinessDay(raw), wd = new Date(`${moved}T00:00:00Z`).getUTCDay();
        assert.ok(moved >= raw && wd !== 0 && wd !== 6, `${state} ${moved}`);
      }
});
