// Bank of America's CSV opens with a summary block; rows are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const head = (cr, db) => `Description,,Summary Amt.\nBeginning balance as of 01/01/2026,,"100.00"\nTotal credits,,"${cr}"\nTotal debits,,"${db}"\nEnding balance as of 01/31/2026,,"150.00"\n\nDate,Description,Amount,Running Bal.\n01/01/2026,Beginning balance as of 01/01/2026,,"100.00"\n01/05/2026,PAY,"100.00","200.00"\n01/09/2026,SHOP,-50.00,"150.00"\n`;

test("matching summary adds no problem", () => {
  const r = readStatement(head("100.00", "-50.00"), {});
  assert.equal(r.bank, "bank-of-america");
  assert.deepEqual(r.problems, []);
});
test("a summary that disagrees with the rows is reported", () => {
  const r = readStatement(head("250.00", "-50.00"), {});
  assert.ok(r.problems.some((p) => /summary says credits 250\.00/.test(p)));
});
