// Layout from Odoo's demo bank statement PDF (odoo/odoo, addons/account/static/demo, cloned at
// run time, read only, nothing copied; rows made up): a print-date header, "$ 1,275.00" amounts
// with no sign, a minus with a zero-width space in it, and opening and closing balances.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatementText } from "./statementtext.mjs";

const text = [
  "2025-07-11 11:12 Example Co 1 / 1",
  "Bank Statement",
  "Bank - 000111 - BNK1 Bank - 2025-06-11 - 06/11/2025",
  "Starting Balance 06/01/2025 $ 1,000.00",
  "Ending Balance 06/11/2025 $ 1,625.00",
  "06/11/2025 Acme Ltd $ 500.00",
  "INV/1 and INV/2",
  "06/11/2025 Office rent $ -​300.00",
  "06/01/2025 Payment of invoice #5 $ 425.00",
].join("\n");

test("a print-date header and the balance lines are not transactions", () => {
  const r = readStatementText(text);
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x.date.startsWith("2025-06")));
});

test("a minus with a zero-width space in it still reads as a minus", () => {
  const r = readStatementText(text);
  assert.equal(r.rows.find((x) => /rent/.test(x.desc)).cents, -30000);
});

test("unsigned rows take their direction from the opening and closing balance when one split fits", () => {
  const r = readStatementText(text);
  assert.deepEqual(r.rows.map((x) => x.cents), [50000, -30000, 42500]);
  assert.match(r.inferred, /opening and closing balance/);
});

test("when two splits fit, nothing is guessed from the balances", () => {
  const t = ["Opening Balance $ 100.00", "Closing Balance $ 100.00", "06/01/2025 A $ 10.00", "06/02/2025 B $ 10.00"].join("\n");
  const r = readStatementText(t);
  assert.match(r.inferred, /money out/);
});
