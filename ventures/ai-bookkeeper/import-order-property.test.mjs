// Property test for import order and overlap (seeded random statements, made up, no outside data).
// Invariants: the same rows shuffled, or sent as two overlapping exports in either order, leave the
// same set of lines on the books; a second import of the whole file adds nothing; and once every
// line is filed the same way the profit and loss does not depend on how the rows arrived.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, reports } from "./engine.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const fixed = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);
const csvOf = (rows) => "Date,Description,Amount\n" + rows.map((x) => `${x.d},${x.name},${fixed(x.c)}`).join("\n") + "\n";
const sig = (b) => b.transactions.map((t) => `${t.date}|${t.cents}|${t.desc}`).sort().join("\n");
const file = (b) => confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, t.cents > 0 ? "4000" : "6010"])));

test("import order and overlap do not change the books, 300 random statements", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 300; i++) {
    const n = pick(4, 30), rows = [];
    for (let k = 0; k < n; k++) {
      const c = pick(100, 400_000) * (r() < 0.5 ? -1 : 1);
      rows.push({ c, d: `2026-04-${String(pick(1, 28)).padStart(2, "0")}`, name: `${c < 0 ? "FEE" : "SALE"} ${k}` });
    }
    const tag = JSON.stringify({ i, n });
    const imp = (b, rs) => importStatement(b, csvOf(rs), "1000").books;
    const whole = imp(newBooks(), rows);
    const shuffled = [...rows].sort(() => r() - 0.5);
    assert.equal(sig(imp(newBooks(), shuffled)), sig(whole), "shuffled " + tag);

    const cut = pick(1, n - 1), lo = Math.max(0, cut - pick(0, 3));
    const a = rows.slice(0, cut), b = rows.slice(lo);
    assert.equal(sig(imp(imp(newBooks(), a), b)), sig(whole), "overlap a then b " + tag);
    assert.equal(sig(imp(imp(newBooks(), b), a)), sig(whole), "overlap b then a " + tag);
    assert.equal(sig(imp(whole, rows)), sig(whole), "second import adds nothing " + tag);

    const pl = (bk) => JSON.stringify(reports(file(bk)).pnl ?? reports(file(bk)));
    assert.equal(pl(imp(imp(newBooks(), b), a)), pl(whole), "profit and loss " + tag);
  }
});
