import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";

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
  const r1 = importStatement(newBooks(), a, "1000");
  assert.equal(importStatement(r1.books, a, "1000").added, 0);
});
