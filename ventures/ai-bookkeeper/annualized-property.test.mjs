// Property test for the annualized installment worksheet: seeded random months of income (made up, no outside data).
// Invariants: installments are never negative, the cumulative requirement never falls and never exceeds the regular
// cumulative amount, each installment is at most the regular quarter plus the unused carry, credits never go
// negative, and a payment made on the due date never raises the shortfall.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { annualizedInstallments } from "./annualized.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const books = (rows) => {
  const csv = "Date,Description,Amount\n" + rows.map(([d, a]) => `${d},CLIENT PAYMENT ACME,${a}`).join("\n") + "\n";
  const { books: b } = importStatement(newBooks(), csv, "1000");
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, "4000"])));
};

test("annualized worksheet holds its invariants on 150 random sole proprietors", () => {
  const r = rng(20261028);
  for (let i = 0; i < 150; i++) {
    const rows = [];
    for (let m = 1; m <= 12; m++) if (r() < 0.6) rows.push([`2026-${String(m).padStart(2, "0")}-10`, (100 + Math.floor(r() * 20000)).toFixed(2)]);
    if (!rows.length) rows.push(["2026-12-10", "5000.00"]);
    const opts = { year: 2026, filing: r() < 0.5 ? "single" : "mfj", withholding: Math.floor(r() * 300000) };
    const res = annualizedInstallments(books(rows), opts);
    let prevCum = 0, carry = 0;
    res.rows.forEach((x, k) => {
      const tag = `case ${i} row ${k}`;
      assert.ok(x.installment >= 0, `installment >= 0, ${tag}`);
      assert.ok(x.installment <= res.regularQuarter + carry, `cap, ${tag}`);
      carry = res.regularQuarter + carry - x.installment;
      assert.ok(x.cumulativeRequired >= prevCum, `cumulative monotone, ${tag}`);
      assert.ok(x.cumulativeRequired <= x.regularCumulative + 1, `below regular, ${tag}`);
      assert.ok(x.shortfall >= 0 && x.regularShortfall >= 0 && x.creditsByDue >= 0, `non-negative, ${tag}`);
      prevCum = x.cumulativeRequired;
    });
    const due = res.rows[0].due;
    const paid = annualizedInstallments(books(rows), { ...opts, payments: [{ date: due, cents: 50000 }] });
    assert.ok(paid.rows[0].shortfall <= res.rows[0].shortfall, `payment never raises shortfall, case ${i}`);
  }
});
