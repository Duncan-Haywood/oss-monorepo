// Property test for cashBasis with part-payments (made-up books, seeded, no outside data).
// Invariants: a document paid in N instalments recognises exactly its total once fully paid
// (the last payment takes the rounding), never more than its total, and each instalment
// lands in the month of its bank line; the input books are untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, addDocuments } from "./engine.mjs";
import { cashBasis } from "./cashbasis.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("cashBasis part-payments recognise exactly the total, in the payment months (200 random books)", () => {
  const r = rng(20261104), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 200; i++) {
    const cents = pick(100, 900000), n = pick(1, 4), invoice = r() < 0.6, full = r() < 0.6;
    const parts = [];
    let left = cents;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      const c = last ? (full ? left : Math.max(0, Math.floor(left / 2))) : Math.max(1, Math.floor(left / (n - k)));
      if (c < 1 || c > left) continue;
      parts.push(c);
      left -= c;
    }
    const tag = JSON.stringify({ cents, parts, invoice });
    let b = addDocuments(newBooks(), `type,number,date,party,amount,account,against\n${invoice ? "invoice" : "bill"},D1,2026-01-05,Pty,${(cents / 100).toFixed(2)},${invoice ? 4000 : 6100},\n`).books;
    const months = [];
    const lines = parts.map((c, k) => {
      const m = 2 + k;
      months.push(`2026-0${m}`);
      return `2026-0${m}-10,PAYMENT D1 ${k + 1},${((invoice ? c : -c) / 100).toFixed(2)}`;
    });
    if (lines.length) b = importStatement(b, "Date,Description,Amount\n" + lines.join("\n") + "\n", "1000").books;
    b = addDocuments(b, "").books;
    const before = JSON.stringify(b);
    const x = cashBasis(b).profitAndLoss;
    assert.equal(JSON.stringify(b), before, "books changed " + tag);
    const got = invoice ? x.totalIncome : x.totalExpense, paid = parts.reduce((a, c) => a + c, 0);
    assert.ok(got <= cents, "over-recognised " + tag);
    if (paid === cents) assert.equal(got, cents, "full " + tag);
    assert.ok(Math.abs(got - paid) <= parts.length, "recognised far from paid " + tag);
    if (!parts.length) assert.equal(got, 0, tag);
    else assert.deepEqual(x.months, months.slice(0, parts.length), "months " + tag);
  }
});
