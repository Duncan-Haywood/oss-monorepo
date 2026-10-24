// Faults the third-party categories dataset showed (eval/hf-bank-categories.mjs);
// each description below is written here, not copied from it.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -5000) => suggest({ desc, cents }, model).account;

test("a PayPal wrapper does not turn a purchase into a transfer", () => {
  assert.equal(acct("PAYPAL INST XFER GITHUB WEB ID: PAYPALSI30"), "6060");
  assert.equal(acct("PAYPAL INST XFER DOORDASH WEB ID: PAYPALSI08"), "6130");
});
test("'<biller> AUTOPAY <ref>' is the bill, a bare AUTOPAY line stays a card payment", () => {
  assert.equal(acct("XCEL ENERGY AUTOPAY 948400517275 PPD ID: 889502428"), "6140");
  assert.equal(acct("AUTOPAY 230113 PAYMENT THANK YOU"), "transfer");
});
test("card and wire fees are fees, not transfers", () => {
  assert.equal(acct("WIRE TRANSFER FEE"), "6010");
  assert.equal(acct("Foreign Transaction Fee"), "6010");
});
test("keywords match words, not the middle of one", () => {
  assert.equal(acct("Zelle payment to BARBARA DAVIS SAN DIEGO CA"), null);
  assert.notEqual(acct("MTA 3370 MISSION BLVD SACRAMENTO 95814"), "6130");
});
test("withdrawal wrappers and deposits", () => {
  assert.equal(acct("Withdrawal From Dominion Energy"), "6140");
  assert.equal(acct("REMOTE ONLINE DEPOSIT # 1", 20000), "4000");
});

// Plain-English narrations seen in Beancount's example ledger (eval/beancount-example.mjs);
// the lines here are written for this test.
test("plain narrations name the account: rent, eating out, tram tickets", () => {
  assert.equal(acct("Landlord Co Paying the rent"), "6080");
  assert.equal(acct("Bistro Nine Eating out with a client"), "6130");
  assert.equal(acct("City Transit Authority Tram tickets"), "6120");
});
test("the new phrases do not catch car rentals or a bare 'rent'", () => {
  assert.equal(acct("ENTERPRISE RENT-A-CAR 4471"), "6120");
  assert.notEqual(acct("Rent the Runway"), "6080");
});
