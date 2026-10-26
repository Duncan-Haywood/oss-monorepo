// Shape seen in GnuCash's doc/examples QIF files (GPL, cloned at run time, read
// only, nothing copied; rows made up): Money 95 / Quicken exports write
// two-digit years, so 95 means 1995.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDate, readStatement } from "./bank.mjs";

test("two-digit years in the 1990s are not pushed to 2095", () => {
  assert.equal(parseDate("12/03/95"), "1995-12-03");
  assert.equal(parseDate("03-Dec-99"), "1999-12-03");
});

test("recent two-digit years still read as 20yy", () => {
  assert.equal(parseDate("12/03/26"), "2026-12-03");
  assert.equal(parseDate("1/2/05"), "2005-01-02");
});

test("a Money 95 QIF reads as 1995 rows", () => {
  const r = readStatement("!Type:Bank\nD12/03/95\nT4,706.57\nPOpening Balance\n^\nD12/05/95\nT-52.50\nPLandlord\n^\n");
  assert.deepEqual(r.rows.map((x) => x.date), ["1995-12-03", "1995-12-05"]);
});
