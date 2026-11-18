// Property test for budget-against-actual, the period comparison and precedingPeriod: seeded random
// books (made up, no outside data). Invariants: rows add up to the totals; variance is actual minus
// budget; the budget scales with the months covered; swapping the two periods flips every change;
// a period against itself changes nothing; net change equals income change minus expense change;
// precedingPeriod is adjacent, equal in length and its own inverse in length.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { setBudget, budgetVsActual } from "./budget.mjs";
import { compareProfit, precedingPeriod } from "./compare.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const money = (c) => (c / 100).toFixed(2);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const CODES = { SALE: "4000", HOST: "6130", FEE: "6010", RENT: "6150" };
const names = Object.keys(CODES);

const book = (r, pick) => {
  const rows = [], start = Date.UTC(2025, 9, 1);
  for (let k = pick(5, 40); k > 0; k--) {
    const n = names[pick(0, names.length - 1)], amt = pick(1_00, 5000_00);
    rows.push(`${iso(start + pick(0, 400) * 864e5)},${n} ${k},${money(n === "SALE" ? amt : -amt)}`);
  }
  const b = importStatement(newBooks(), "Date,Description,Amount\n" + rows.join("\n") + "\n", "1000").books;
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, CODES[t.desc.split(" ")[0]]])));
};

test("budget and comparison reports hold their invariants on 100 random books", () => {
  const r = rng(20261105), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let t = 0; t < 100; t++) {
    const tag = `book ${t}`;
    let b = book(r, pick);
    for (const c of Object.values(CODES)) if (r() < 0.7) b = setBudget(b, c, pick(0, 3000_00));
    const from = iso(Date.UTC(2025, 9 + pick(0, 8), pick(1, 28))), to = iso(Date.parse(from) + pick(0, 200) * 864e5);
    const rep = budgetVsActual(b, { from, to });
    const sum = (type, k) => rep.rows.filter((x) => x.type === type).reduce((s, x) => s + x[k], 0);
    assert.equal(rep.income.budget, sum("income", "budget"), tag);
    assert.equal(rep.expense.actual, sum("expense", "actual"), tag);
    assert.equal(rep.net.variance, rep.net.actual - rep.net.budget, tag);
    for (const x of rep.rows) {
      assert.equal(x.variance, x.actual - x.budget, tag);
      assert.equal(x.budget, ((b.budget ?? {})[x.code] ?? 0) * rep.months, tag);
      assert.ok(Number.isInteger(x.budget) && Number.isInteger(x.actual), tag);
    }
    // a budget of zero removes the line, and the same books give the same report
    const [d] = Object.keys(b.budget ?? {});
    if (d) assert.equal(setBudget(b, d, 0).budget[d], undefined, tag);
    assert.deepEqual(budgetVsActual(b, { from, to }), rep, tag);

    // comparison
    const p1 = { from, to }, p2 = precedingPeriod(p1);
    assert.equal(Date.parse(p1.from) - Date.parse(p2.to), 864e5, tag);
    const len = (p) => Date.parse(p.to) - Date.parse(p.from);
    assert.equal(len(p1), len(p2), tag);
    assert.deepEqual(precedingPeriod(p2) && len(precedingPeriod(p2)), len(p1), tag);
    const ab = compareProfit(b, { period: p1, against: p2 }), ba = compareProfit(b, { period: p2, against: p1 });
    assert.equal(ab.net.change, (ab.income.now - ab.income.then) - (ab.expense.now - ab.expense.then), tag);
    assert.equal(ab.net.change, 0 - ba.net.change, tag);
    const flip = new Map(ba.accounts.map((x) => [x.code, x.change]));
    for (const x of ab.accounts) assert.equal(x.change, 0 - (flip.get(x.code) ?? 0), tag + " " + x.code);
    for (const x of compareProfit(b, { period: p1, against: p1 }).accounts) assert.equal(x.change, 0, tag);
    for (let i = 1; i < ab.accounts.length; i++) assert.ok(Math.abs(ab.accounts[i - 1].change) >= Math.abs(ab.accounts[i].change), tag);
  }
});
