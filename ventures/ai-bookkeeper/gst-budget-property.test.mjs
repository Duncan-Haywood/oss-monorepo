// Property test for GST worksheets and budget against actual: seeded random invoices, bills
// and credit notes (made up, no outside data). Invariants: Canada's net line is collected
// less claimed and the AU labels are whole-dollar roundings of the same cents; a period split
// at any date adds up to the whole; budget rows are monthly amounts times the months covered,
// variance is actual less budget, and the totals are the sums of the rows.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement } from "./engine.mjs";
import { gstReturn } from "./gstreturn.mjs";
import { budgetVsActual, setBudget } from "./budget.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const EXPENSES = ["6130", "6020", "6090"];

function randomBooks(r, pick) {
  const lines = ["type,number,date,due,party,amount,account,description"];
  for (let k = 1, n = pick(1, 25); k <= n; k++) {
    const kind = r() < 0.5 ? "invoice" : "bill", credit = r() < 0.2, type = credit ? (kind === "invoice" ? "credit note" : "vendor credit") : kind;
    const date = `2026-${String(pick(1, 12)).padStart(2, "0")}-${String(pick(1, 28)).padStart(2, "0")}`;
    const net = pick(100, 900000), tax = pick(0, Math.floor(net / 5)), acct = kind === "invoice" ? "4000" : EXPENSES[pick(0, 2)];
    lines.push(`${type},${k},${date},,P${k},${(net / 100).toFixed(2)},${acct},Goods`);
    if (tax) lines.push(`${type},${k},${date},,P${k},${(tax / 100).toFixed(2)},${kind === "invoice" ? "2100" : "1300"},Tax`);
  }
  const seed = importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books;
  return addDocuments(seed, lines.join("\n") + "\n").books;
}

test("GST worksheets hold their invariants on 200 random ledgers", () => {
  const r = rng(20261028), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 200; i++) {
    const books = randomBooks(r, pick), tag = `case ${i}`;
    const ca = gstReturn(books, { region: "ca" }), au = gstReturn(books, { region: "au" });
    assert.equal(ca.lines[109], ca.lines[105] - ca.lines[108], tag);
    assert.equal(ca.payable, ca.lines[109] >= 0 ? "pay" : "refund", tag);
    assert.equal(au.lines["1A"], Math.round(ca.lines[105] / 100), tag);
    assert.equal(au.lines["1B"], Math.round(ca.lines[108] / 100), tag);
    const m = pick(1, 11), cut = `2026-${String(m).padStart(2, "0")}-28`, next = `2026-${String(m + 1).padStart(2, "0")}-01`;
    const a = gstReturn(books, { region: "ca", to: cut }), b = gstReturn(books, { region: "ca", from: next });
    for (const l of [101, 105, 108]) assert.equal(a.lines[l] + b.lines[l], ca.lines[l], `split ${l} ${tag}`);
  }
});

test("budget against actual holds its invariants on 200 random ledgers", () => {
  const r = rng(20261029), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 200; i++) {
    let books = randomBooks(r, pick);
    const tag = `case ${i}`;
    books = setBudget(books, "4000", pick(0, 500000));
    for (const c of EXPENSES) if (r() < 0.6) books = setBudget(books, c, pick(0, 300000));
    const from = `2026-${String(pick(1, 6)).padStart(2, "0")}-01`, to = `2026-${String(pick(6, 12)).padStart(2, "0")}-28`;
    const rep = budgetVsActual(books, { from, to });
    const months = +to.slice(5, 7) - +from.slice(5, 7) + 1;
    assert.equal(rep.months, months, tag);
    for (const row of rep.rows) {
      assert.equal(row.budget, (books.budget[row.code] ?? 0) * months, tag);
      assert.equal(row.variance, row.actual - row.budget, tag);
    }
    const sum = (t, k) => rep.rows.filter((x) => x.type === t).reduce((s, x) => s + x[k], 0);
    assert.equal(rep.income.actual, sum("income", "actual"), tag);
    assert.equal(rep.net.actual, rep.income.actual - rep.expense.actual, tag);
    assert.equal(rep.net.variance, rep.net.actual - rep.net.budget, tag);
  }
});
