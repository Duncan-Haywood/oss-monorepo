// Property test for the federal payroll deposit schedule: seeded random registers (made up, no outside data).
// Invariants: every run with a nonzero deposit sits in exactly one deposit; amounts add to the year's liability;
// deposits come sorted by due date; no due date falls on a weekend or before the last pay date it covers;
// a deposit's runs and dates sit inside the year; the answer is deterministic; a forced schedule is honoured.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addPayroll, federalDeposit } from "./payroll.mjs";
import { depositSchedule } from "./deposits.mjs";

const HEAD = "Pay Date,Gross Pay,Federal Income Tax,Social Security,Medicare,State Income Tax,Other Deductions,Net Pay,Employer Social Security,Employer Medicare,FUTA,SUTA";
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const row = (date, c) => {
  const fed = Math.round(c * 0.1), ss = Math.round(c * 0.062), med = Math.round(c * 0.0145), f = (x) => (x / 100).toFixed(2);
  return `${date},${f(c)},${f(fed)},${f(ss)},${f(med)},0.00,0.00,${f(c - fed - ss - med)},${f(ss)},${f(med)},0.00,0.00`;
};

test("deposit schedule holds its invariants on 150 random registers", () => {
  const r = rng(20261102), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let checked = 0;
  for (let t = 0; t < 150; t++) {
    const base = Date.UTC(2025, 0, 1), rows = new Map();
    const big = r() < 0.3;
    for (let n = pick(1, 40); n > 0; n--) {
      const d = iso(base + pick(0, 700) * 864e5);
      rows.set(d, (rows.get(d) ?? 0) + pick(100_00, big ? 400_000_00 : 8000_00));
    }
    const csv = HEAD + "\n" + [...rows].sort().map(([d, c]) => row(d, c)).join("\n") + "\n";
    const tag = `register ${t}`;
    const books = addPayroll(newBooks(), csv).books;
    for (const year of [2025, 2026]) {
      const out = depositSchedule(books, year);
      assert.deepEqual(depositSchedule(books, year), out, tag);
      const yearRuns = books.payroll.filter((x) => x.date.startsWith(String(year)));
      const total = yearRuns.reduce((a, x) => a + federalDeposit(x), 0);
      assert.equal(out.deposits.reduce((a, d) => a + d.amount, 0), total, `${tag} ${year} amounts`);
      const seen = out.deposits.flatMap((d) => d.runs);
      assert.equal(new Set(seen).size, seen.length, `${tag} run in two deposits`);
      assert.deepEqual([...seen].sort(), yearRuns.filter((x) => federalDeposit(x) > 0).map((x) => x.id).sort(), tag);
      for (let i = 0; i < out.deposits.length; i++) {
        const d = out.deposits[i], w = new Date(`${d.due}T00:00:00Z`).getUTCDay();
        assert.ok(w !== 0 && w !== 6, `${tag} due ${d.due} is a weekend`);
        assert.ok(d.due > d.to, `${tag} due ${d.due} not after pay date ${d.to}`);
        assert.ok(d.from.startsWith(String(year)) && d.from <= d.to, tag);
        if (i) assert.ok(out.deposits[i - 1].due <= d.due, `${tag} unsorted`);
        checked++;
      }
      for (const s of ["monthly", "semiweekly"]) assert.equal(depositSchedule(books, year, { schedule: s }).schedule, s, tag);
    }
  }
  assert.ok(checked > 500, `only ${checked} deposits exercised`);
});

test("an unknown schedule name is refused", () => {
  assert.throws(() => depositSchedule(newBooks(), 2026, { schedule: "weekly" }), /monthly or semiweekly/);
});
