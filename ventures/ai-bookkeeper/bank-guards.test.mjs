// Guards for faults the red-team campaign seeded in bank.mjs that no test caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, readCzBlocks, readStatement, rowIds, checkRunningBalance } from "./bank.mjs";

test("parseDate rejects a year of 0 and a five-digit compact year", () => {
  assert.equal(parseDate("0000-03-05"), null);
  assert.equal(parseDate("5Mar12345"), null);
  assert.equal(parseDate("5Mar2026"), "2026-03-05");
});

test("a Czech block with an unreadable amount is reported at its own line", () => {
  const text = "Pohyby na účtu: 123\nDatum: 01.03.2026\nČástka: abc\nMěna: CZK\n";
  const r = readCzBlocks(text);
  assert.equal(r.rows.length, 0);
  assert.ok(r.problems.some((p) => p.startsWith("Line 2:")), r.problems.join("|"));
});

test("a blank balance cell reads as no balance, not a parsed zero", () => {
  const csv = "Date,Description,Amount,Balance\n2026-03-01,Coffee,-4.50,\n2026-03-02,Pay,100.00,95.50\n";
  const r = readStatement(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].balance ?? null, null);
  assert.equal(r.rows[1].balance, 9550);
});

test("amounts like 1,234 with a thousands comma are not read as decimal commas", () => {
  const csv = 'Date,Description,Amount\n2026-03-01,Rent,"-1,234"\n2026-03-02,Sale,"2,500"\n';
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-123400, 250000]);
});

test("a GPC transaction line with bytes after the 128-column record still reads its date", () => {
  const z = (v, n) => String(v).padStart(n, "0");
  const tr = "075" + z("123456789", 16) + z("987654", 16) + z(1, 13) + z(40000, 12) + "1" + z(0, 10) + "0800000000" + z(0, 10) + "000000" + "ACME".padEnd(20) + "0" + "0203" + "030514" + " X";
  const r = readStatement(tr);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2014-05-03", -40000]]);
  assert.deepEqual(r.problems, []);
});

test("row ids depend on the first character of the account and stay stable", () => {
  const rows = [{ date: "2026-03-01", cents: -450, desc: "Coffee" }];
  assert.notEqual(rowIds(rows, "a1")[0], rowIds(rows, "b1")[0]);
  assert.equal(rowIds(rows, "a1")[0], rowIds(rows, "a1")[0]);
  assert.match(rowIds(rows, "a1")[0], /^[0-9a-z]+-1$/);
});

test("a running-balance break reports the balance the file should have printed", () => {
  const rows = [{ line: 2, cents: 1000, balance: 1000 }, { line: 3, cents: -250, balance: 700 }];
  const r = checkRunningBalance(rows);
  assert.deepEqual(r.breaks, [{ line: 3, expected: 750, printed: 700 }]);
});
