// MT940 :61: lines whose optional 4-digit entry date is written as four spaces (Citi, ASNB layouts
// in wolph/mt940's tests, BSD-3, cloned at run time, read only, nothing copied). Rows here are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const file = (...entries) => [":20:STARTUMS", ":25:123456789", ":28:1/1", ":60F:C260101USD1000,00", ...entries, ":62F:C260131USD837,61", "-"].join("\n");

test("a blank entry date does not make the :61: line unreadable", () => {
  const r = readStatement(file(
    ":61:260112    DD212,39NMSCNONREF//",
    ":86:CARD SHOP ONE",
    ":61:260113    C50,00NTRFNONREF",
    ":86:REFUND SHOP TWO",
  ));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-01-12", -21239], ["2026-01-13", 5000]]);
});
