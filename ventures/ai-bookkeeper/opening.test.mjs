import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, journal, reports, closeChecks, analyze } from "./engine.mjs";
import { setOpeningBalances, clearOpeningBalances } from "./opening.mjs";

const TB = "code,amount\n1000,5000.00\n1200,1200.00\n1500,3000.00\n2200,2000.00\n3900,7200.00\n";

test("natural-sign amounts balance without a plug", () => {
  const r = setOpeningBalances(newBooks(), TB, { date: "2026-01-01" });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plug, 0);
  const rep = reports({ ...r.books, transactions: [] });
  assert.equal(rep.balanceSheet.totalAssets, 920000);
  assert.equal(rep.balanceSheet.totalLiabilities, 200000);
  assert.ok(rep.balanceSheet.balanced);
});

test("an imbalance goes to Opening balance equity and is reported", () => {
  const r = setOpeningBalances(newBooks(), "1000,100.00\n2200,30.00\n", { date: "2026-01-01" });
  assert.equal(r.plug, -7000);
  assert.deepEqual(r.lines.map((l) => [l.account, l.cents]), [["1000", 10000], ["2200", -3000], ["3000", -7000]]);
  assert.ok(reports(r.books).balanceSheet.balanced);
});

test("debit and credit columns", () => {
  const r = setOpeningBalances(newBooks(), "code,debit,credit\n1000,500.00,\n3900,,500.00\n", { date: "2026-01-01" });
  assert.equal(r.plug, 0);
  assert.equal(r.books.openingTB.lines.length, 2);
});

test("unknown account or bad amount is refused, books unchanged", () => {
  const b = newBooks();
  const r = setOpeningBalances(b, "7777,10\n1000,abc\n", { date: "2026-01-01" });
  assert.equal(r.problems.length, 2);
  assert.equal(r.books, b);
});

test("bad date and locked period throw", () => {
  assert.throws(() => setOpeningBalances(newBooks(), TB, { date: "01/01/2026" }));
  assert.throws(() => setOpeningBalances({ ...newBooks(), lockedThrough: "2026-03-31" }, TB, { date: "2026-01-01" }), /locked/);
});

test("a typed opening balance wins over one inferred from the statement and is not counted twice", () => {
  const csv = "Date,Description,Amount,Balance\n2026-02-01,Coffee Shop,-5.00,995.00\n2026-02-02,Client Pay,100.00,1095.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  assert.equal(b.opening["1000"], 100000);
  b = setOpeningBalances(b, "1000,1000.00\n3900,1000.00\n", { date: "2026-01-31" }).books;
  const open1000 = journal(b).flatMap((e) => e.lines).filter((l) => l.account === "1000" && l.debit === 100000);
  assert.equal(open1000.length, 1);
});

test("lines dated before the opening date are flagged", () => {
  const csv = "Date,Description,Amount\n2026-01-05,Coffee Shop,-5.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  const r = setOpeningBalances(b, TB, { date: "2026-01-31" });
  assert.equal(r.before, 1);
  assert.match(r.problems[0], /count twice|would count twice/);
});

test("clear removes it; analyze accepts it", () => {
  const r = setOpeningBalances(newBooks(), TB, { date: "2026-01-01" });
  assert.equal(clearOpeningBalances(r.books).openingTB, undefined);
  const a = analyze({ opening: { csv: TB, date: "2026-01-01" }, example: true });
  assert.ok(a.books.openingTB);
  assert.ok(a.reports.balanceSheet.balanced);
});
