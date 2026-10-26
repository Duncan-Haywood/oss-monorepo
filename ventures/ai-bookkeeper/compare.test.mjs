import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement, confirm, analyze, acceptSuggestions } from "./engine.mjs";
import { compareProfit, precedingPeriod } from "./compare.mjs";

// 4000 sales, 6010 fees, 6130 software (default chart codes), filed by hand
const filed = (rows) => {
  let b = importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
  const pick = { SALE: "4000", HOST: "6130", FEE: "6010" };
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, pick[t.desc.split(" ")[0]]])));
};
const books = filed([
  ["2026-01-05", "SALE ONE", "1000.00"], ["2026-01-09", "HOST A", "-100.00"],
  ["2026-02-05", "SALE TWO", "1500.00"], ["2026-02-09", "HOST A", "-100.00"], ["2026-02-12", "FEE X", "-40.00"],
]);

test("default is the latest month against the month before", () => {
  const c = compareProfit(books);
  assert.deepEqual(c.period, { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(c.against, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(c.income.now, 150000);
  assert.equal(c.income.then, 100000);
  assert.equal(c.net.now, 150000 - 14000);
  assert.equal(c.net.then, 90000);
  assert.equal(c.net.change, 136000 - 90000);
});

test("largest movers first; new accounts flagged; only profit-lowering moves are marked", () => {
  const c = compareProfit(books);
  assert.deepEqual(c.accounts.map((a) => a.code), ["4000", "6010", "6130"]);
  const sales = c.accounts[0], fee = c.accounts[1], host = c.accounts[2];
  assert.equal(sales.change, 50000); assert.equal(sales.pct, 0.5); assert.equal(sales.hurtsProfit, false);
  assert.equal(fee.status, "new"); assert.equal(fee.pct, null); assert.equal(fee.hurtsProfit, true);
  assert.equal(host.change, 0); assert.equal(host.hurtsProfit, false);
});

test("an account that stops shows as gone; explicit periods work; minChange filters", () => {
  const c = compareProfit(books, { period: { from: "2026-01-01", to: "2026-01-31" }, against: { from: "2026-02-01", to: "2026-02-28" } });
  assert.equal(c.accounts.find((a) => a.code === "6010").status, "gone");
  assert.equal(c.net.change, -46000);
  assert.equal(compareProfit(books, { minChange: 10000 }).accounts.length, 1);
});

test("a first month has nothing to compare; empty books give null; review lines are noted", () => {
  const one = filed([["2026-01-05", "SALE ONE", "1000.00"]]);
  assert.match(compareProfit(one).empty, /compared against/);
  assert.equal(compareProfit(newBooks()), null);
  const withReview = importStatement(books, "Date,Description,Amount\n2026-02-20,MYSTERY ZZZ,-9.00\n", "1000").books;
  assert.match(compareProfit(withReview).partial, /1 line/);
});

test("the built-in example compares without error and nets add up", () => {
  const c = compareProfit(acceptSuggestions(analyze({ example: true }).books, 0));
  assert.ok(c.accounts.length > 0);
  assert.equal(c.net.now, c.income.now - c.expense.now);
});

test("precedingPeriod is the same length, ending the day before", () => {
  assert.deepEqual(precedingPeriod({ from: "2026-02-01", to: "2026-02-28" }), { from: "2026-01-04", to: "2026-01-31" });
  assert.deepEqual(precedingPeriod({ from: "2026-01-01", to: "2026-12-31" }), { from: "2025-01-01", to: "2025-12-31" });
  assert.equal(precedingPeriod({ from: "2026-03-01", to: "2026-02-01" }), null);
  assert.equal(precedingPeriod({ from: "nope", to: "2026-02-01" }), null);
});

test("the page wires the comparison to the From and To dates", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="compare"/);
  assert.match(html, /renderCompare\(\); renderReconcile/);
  assert.equal((html.match(/renderBudget\(\); renderCompare\(\)/g) ?? []).length, 3);
});
