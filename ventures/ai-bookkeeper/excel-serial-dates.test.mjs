// A bank CSV re-saved from Excel with General format shows dates as day numbers. Made-up rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement, parseDate } from "./bank.mjs";

test("Excel serial day numbers read as dates (46297 is 2026-10-02)", () => {
  const r = readStatement("Date,Description,Amount\n46297,PAYROLL,3200.00\n46300.0,SPECTRUM,-89.99\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-10-02", 320000], ["2026-10-05", -8999]]);
  assert.deepEqual(r.problems, []);
});
test("known anchors and out-of-range numbers", () => {
  assert.equal(parseDate("25569"), "1970-01-01");
  assert.equal(parseDate("45292"), "2024-01-01");
  assert.equal(parseDate("12345"), null);
  assert.equal(parseDate("99999"), null);
  assert.equal(parseDate("20261002"), "2026-10-02");
});
