import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Shape of PayPal's activity export (columns trimmed); rows made up.
const paypal = [
  "Date,Time,TimeZone,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID",
  '01/05/2022,06:53:17,PST,Acme Buyer,Website Payment,Completed,USD,"1,000.00",-30.00,970.00,9P625722TL4699942',
].join("\n");

test("a gross/fee/net processor export imported as a bank file is flagged", () => {
  const r = readStatement(paypal);
  assert.equal(r.rows.length, 1);
  assert.ok(r.problems.some((p) => /payouts FILE/.test(p)), r.problems.join("|"));
});

test("a plain bank file raises no processor hint", () => {
  const r = readStatement("Date,Description,Amount\n2026-01-02,Coffee,-4.50\n");
  assert.ok(!r.problems.some((p) => /payment processor/.test(p)));
});
