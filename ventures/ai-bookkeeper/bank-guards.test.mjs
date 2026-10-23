// Guards for faults the red-team campaign seeded in bank.mjs that no test caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, readCzBlocks, readStatement } from "./bank.mjs";

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
