// PayPal's transaction types, taken from the descriptions in PayPal's transaction event
// codes reference (developer.paypal.com/docs/transaction-search/transaction-event-codes/,
// read 2026-10-25). The importer writes "Name - Type". Before these rules a customer's
// "Credit card payment" was booked as a transfer, and fee rows other than the plain
// "PayPal fee" were left for review. No real PayPal export has been tried.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents) => suggest({ desc, cents }, model)?.account ?? null;

test("a customer's payment through PayPal is a sale, whatever the funding source", () => {
  for (const t of ["General payment", "Express Checkout payment", "Standard web checkout payment", "Mobile payment", "Virtual Terminal payment", "PoS payment", "Subscription payment", "Donation payment", "Business payment", "eBay auction payment", "Credit card payment"]) {
    assert.equal(acct(`Jane Buyer - ${t}`, 4200), "4000", t);
  }
  assert.equal(acct("Express Checkout Payment", 4200), "4000");
});
test("money you paid out through PayPal is not a sale", () => {
  assert.notEqual(acct("Acme Supply - Express Checkout payment", -4200), "4000");
  assert.equal(acct("Crew - Mass payment", -9000), "6020");
});
test("PayPal's fee types are processor fees in either direction", () => {
  for (const t of ["Chargeback fee", "Dispute fee", "Payment fee", "Partner fee", "Custody fee", "Bank return fee"]) assert.equal(acct(`PayPal - ${t}`, -1500), "6010", t);
  assert.equal(acct("PayPal - Fee refund", 300), "6010");
  assert.equal(acct("PayPal - Fee reversal", 300), "6010");
});
test("moving your own balance is a transfer", () => {
  for (const [t, c] of [["General withdrawal", -50000], ["General withdrawal - bank account", -50000], ["Auto-sweep", -50000], ["Bank deposit to PP account", 50000], ["General currency conversion", -2000], ["User initiated currency conversion", 1850], ["Manual withdrawal", -100]]) assert.equal(acct(t, c), "transfer", t);
});
test("the plain bank wording is untouched", () => {
  assert.equal(acct("PAYMENT THANK YOU", 12000), "transfer");
  assert.equal(acct("CREDIT CARD PAYMENT", -12000), "transfer");
});
