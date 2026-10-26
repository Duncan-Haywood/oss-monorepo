import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";
import { readStatementText } from "./statementtext.mjs";
import { newBooks, importStatement } from "./engine.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("pasted checking statement: sections give direction, the period gives the year, wrapped lines join", () => {
  const r = readStatement(fx("pasted-checking.txt"));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [
    ["2025-12-18", 240000], ["2026-01-05", 115025], ["2025-12-20", -8640],
    ["2025-12-29", -5999], ["2026-01-02", -50000], ["2026-01-09", -1250]]);
  assert.equal(r.rows[3].desc, "ADOBE CREATIVE CLOUD 800-833-6687 CA");
  // beginning 5,000.00 + rows = the printed ending balance 7,891.36
  assert.equal(500000 + r.rows.reduce((s, x) => s + x.cents, 0), 789136);
});

test("running balance decides direction when amounts are unsigned, and the balances reconcile", () => {
  const r = readStatement(fx("pasted-balance.txt"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-40000, 90000, -8000]);
  const c = checkRunningBalance(r.rows);
  assert.ok(c.checked);
  assert.equal(c.breaks.length, 0);
  assert.equal(c.opening, 100000);
});

test("card statement: payments in, purchases out, CR on a purchase is a refund, posting dates skipped", () => {
  const r = readStatement(fx("pasted-card.txt"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-04-02", 100000], ["2026-03-20", -21234], ["2026-04-10", 1820]]);
});

test("signs, parentheses and DR/CR beat the heading; no direction at all is flagged", () => {
  const t = "Statement 2026\n03/01 A 5.00-\n03/02 B (6.00)\n03/03 C 7.00 CR\n03/04 D 8.00 DR\n";
  assert.deepEqual(readStatementText(t).rows.map((x) => x.cents), [-500, -600, 700, -800]);
  const u = readStatementText("2026\n03/01 MYSTERY 9.00\n");
  assert.deepEqual(u.rows.map((x) => x.cents), [-900]);
  assert.match(u.inferred, /read as money out/);
});

test("no year anywhere is a reported problem, not a guessed date; a year option fixes it", () => {
  const r = readStatementText("03/01 A 5.00\n");
  assert.equal(r.rows.length, 0);
  assert.equal(readStatementText("03/01 A 5.00-\n", { year: 2024 }).rows[0].date, "2024-03-01");
});

test("text that is not a statement says what a line should look like; CSV is untouched", () => {
  assert.match(readStatement("hello\nworld\n").problems[0], /No date and amount columns|No transaction lines/);
  const csv = readStatement("Date,Description,Amount\n2026-01-02,X,-5.00\n");
  assert.equal(csv.rows.length, 1);
  assert.equal(csv.rows[0].cents, -500);
});

test("imports through the engine and importing the same paste twice adds nothing", () => {
  const a = importStatement(newBooks(), fx("pasted-checking.txt"), "1000");
  assert.equal(a.added, 6);
  assert.equal(importStatement(a.books, fx("pasted-checking.txt"), "1000").added, 0);
});

test("pasted text with a stray 'Amount' heading but no date column still reads as a statement", () => {
  const r = readStatement("Account activity,Amount\n15 Jan 2024 Coffee Shop 4.50 CR\n16 Jan 2024 Grocery 20.00 DR\n");
  assert.equal(r.bank, "text");
  assert.deepEqual(r.rows.map((x) => x.cents), [450, -2000]);
});
