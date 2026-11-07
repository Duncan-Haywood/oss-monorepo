// Descriptor shapes seen in a real person's Canadian Capital One card export
// (eval/capone-card.mjs, pythoninoffice/tutorials); each line is written here, not copied.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";
import { readStatement } from "./bank.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -4000) => suggest({ desc, cents }, model).account;

test("Canadian fuel, phone, transit, food and insurance descriptors", () => {
  for (const d of ["PETROCAN", "SHELL", "ESSO 4412"]) assert.equal(acct(d), "6160", d);
  for (const d of ["FIDO Mobile", "KOODO MOBILE", "TELUS COMM"]) assert.equal(acct(d), "6140", d);
  assert.equal(acct("PRESTO EXAMPLE TOWN RELOAD"), "6120");
  for (const d of ["JOLLIBEE- EXAMPLE", "CONGEE PALACE"]) assert.equal(acct(d), "6130", d);
  assert.equal(acct("BELAIRDIRECT - ONTARIO"), "6030");
  assert.equal(acct("OVERLIMIT FEE JAN 5, 2020"), "6010");
});
test("a bare SHELL rule does not catch Shell Fleet or an unrelated shell company", () => {
  assert.equal(acct("SHELL FLEET CARD"), "6160");
  assert.notEqual(acct("SHELL COMPANY FORMATION LLC"), "6160");
});
test("Capital One card layout: Debit and Credit columns book purchases negative", () => {
  const csv = "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2024-02-01,2024-02-02,1234,GAS STATION,Gas,45.20,\n2024-02-03,2024-02-04,1234,PAYMENT THANK YOU,Payment/Credit,,100.00";
  const r = readStatement(csv);
  assert.equal(r.bank, "capital-one");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 10000]);
});
