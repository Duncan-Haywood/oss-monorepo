import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const mint = `"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name","Labels","Notes"
"10/03/2026","Starbucks","STARBUCKS #1234 SEATTLE WA","4.50","debit","Coffee Shops","Checking","",""
"10/05/2026","Paycheck","ACME CORP PAYROLL","2500.00","credit","Paycheck","Checking","",""
`;
const monarch = `"Date","Merchant","Category","Account","Original Statement","Notes","Amount","Tags"
"2026-10-03","Starbucks","Coffee Shops","Checking (...1234)","STARBUCKS #1234","","-4.50",""
"2026-10-05","Acme","Paychecks","Checking (...1234)","ACME PAYROLL","","2500.00",""
`;

test("Mint export: labelled, debit/credit signs applied", () => {
  const r = readStatement(mint);
  assert.equal(r.bank, "mint");
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, 250000]);
  assert.deepEqual(r.rows.map((x) => x.desc), ["Starbucks", "Paycheck"]);
});

test("Monarch export: labelled, signed amounts kept", () => {
  const r = readStatement(monarch);
  assert.equal(r.bank, "monarch");
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, 250000]);
  assert.deepEqual(r.rows.map((x) => x.desc), ["Starbucks", "Acme"]);
});
