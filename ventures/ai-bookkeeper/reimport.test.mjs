import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { readStatement, rowIds } from "./bank.mjs";

const a = "Date,Description,Amount\n2026-03-02,STARBUCKS #1234  SEATTLE WA,-4.50\n2026-03-02,Starbucks #1234 Seattle WA,-4.50\n2026-03-03,Rent,-1000.00\n";
const b = "Date,Description,Amount\n2026-03-02,\"Starbucks #1234 Seattle, WA\",-4.50\n2026-03-03,RENT,-1000.00\n2026-03-04,Payroll,2000.00\n";

test("re-import with different spacing, case or punctuation adds only new lines", () => {
  let r = importStatement(newBooks(), a, "1000");
  assert.equal(r.added, 3);
  r = importStatement(r.books, b, "1000");
  assert.equal(r.skipped, 2);
  assert.equal(r.added, 1);
});

test("two identical coffees in one file stay two lines", () => {
  const r = importStatement(newBooks(), a.replace("STARBUCKS #1234  SEATTLE WA", "Starbucks #1234 Seattle WA"), "1000");
  assert.equal(r.added, 3);
});

test("ids from before the change still dedupe", () => {
  // Books written before loose ids stored the exact-text id; rebuild them that way.
  const r1 = importStatement(newBooks(), a, "1000");
  const exact = rowIds(readStatement(a).rows, "1000");
  r1.books.transactions.forEach((t, i) => { t.id = exact[i]; });
  assert.notDeepEqual(exact, rowIds(readStatement(a).rows, "1000", { loose: true }));
  assert.equal(importStatement(r1.books, a, "1000").added, 0);
});

const pend = "Date,Description,Amount\n2026-03-02,SQ *BLUE BOTTLE,-6.25\n2026-03-03,Rent,-1000.00\n";
const post = "Date,Description,Amount\n2026-03-04,BLUE BOTTLE COFFEE SAN FRANCISCO,-6.25\n2026-03-03,Rent,-1000.00\n2026-03-05,Grocery,-20.00\n";

test("a pending line later posted with new wording and date is not booked twice", () => {
  let r = importStatement(newBooks(), pend, "1000");
  r = importStatement(r.books, post, "1000");
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
  assert.ok(r.problems.some((p) => /different wording/.test(p)));
});

test("a daily coffee with the same text on later days is still new", () => {
  const day1 = "Date,Description,Amount\n2026-03-02,Blue Bottle Coffee,-6.25\n2026-03-03,Rent,-1000.00\n";
  const day2 = "Date,Description,Amount\n2026-03-03,Rent,-1000.00\n2026-03-04,Blue Bottle Coffee,-6.25\n";
  let r = importStatement(newBooks(), day1, "1000");
  r = importStatement(r.books, day2, "1000");
  assert.equal(r.added, 1);
});
