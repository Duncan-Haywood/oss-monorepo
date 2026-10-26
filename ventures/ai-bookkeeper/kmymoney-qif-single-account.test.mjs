// KMyMoney's QIF import test (bug 337405, GPL, read at run time, nothing copied) puts a
// !Type:Bank header before its one !Account block; rows here are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readQif } from "./bank.mjs";

test("one !Account block after a !Type header is one account, not two", () => {
  const q = "!Type:Bank\n!Account\nNMain\nTBank\n^\n!Type:Bank\nD30/12/2025\nT100.00\nPDeposit\n^\n";
  const r = readQif(q);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.problems, []);
});
