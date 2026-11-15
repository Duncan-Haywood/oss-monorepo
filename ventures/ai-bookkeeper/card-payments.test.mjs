// Card payments as real cards and paying banks print them (2026-11-15; README "Card payments
// as the banks print them"). Descriptions copied from real exports' layouts; amounts made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, buildMemory } from "./categorize.mjs";
import { readJournal, wantFor } from "./eval/nevarro-ledger.mjs";

const cold = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
const s = (desc, cents) => suggest({ desc, cents }, cold);

test("the card side's own payment lines are transfers", () => {
  for (const d of ["AUTOMATIC PAYMENT - THANK", "ONLINE PAYMENT, THANK YOU", "INTERNET PAYMENT - THANK YOU",
    "ELECTRONIC PAYMENT RECEIVED-THANK", "Ext Credit Card Credit PAYMENT - THANK YOU BEAVERTON OR", "Payment Thank You-Mobile",
    "CAPITAL ONE MOBILE PYMT", "Capital One Autopay"]) assert.equal(s(d, 12345).account, "transfer", d);
});

test("the paying bank's lines that name a card issuer are transfers", () => {
  for (const d of ["CHASE CREDIT CRD, AUTOPAYBUS", "CHASE CREDIT CRD AUTOPAY", "CHASE CREDIT CRD DES:EPAY ID:X1 INDN:A CO ID:9 WEB",
    "EPAY CHASE CREDIT CRD 1234567890INTERNET PAYMENT", "DISCOVER E-PAYMENT 1234", "E-PAYMENT DISCOVER 1234 INTERNETPAYMENT",
    "AMERICAN EXPRESS ACH PMT W1234", "APPLECARD GSBANK PAYMENT", "CCPYMT WELLS FARGO CARD 1234 INTERNET PAYMENT",
    "Citi Autopay Des", "CITI CARD ONLINE PAYMENT", "Synchrony Bank CC PYMT OCT 11", "DISCOVER CAP ONE CRCARDPMT"]) assert.equal(s(d, -12345).account, "transfer", d);
});

test("an issuer's name without a payment word, or a payment to someone else, is not a transfer", () => {
  for (const d of ["CITI FLEX PAY", "CITI TRAVEL HOTEL 123 Internet DE", "VENMO PAYMENT", "ZELLE PAYMENT TO LANDLORD", "VERIZON WIRELESS PAYMENT", "WEB AUTHORIZED PMT PAYPAL"])
    assert.notEqual(s(d, -12345).account, "transfer", d);
  // A refund on a card that says "thank you" is not a card payment.
  assert.notEqual(s("Thankyou Points Redeemed TY OR1", 500).account, "transfer");
});

test("state filing fees and a few developer services the LLC's books named", () => {
  assert.equal(s("CO SECRETARY STATE FEE, DENVER, CO", -2500).account, "6110");
  assert.equal(s("PURCHASE AUTHORIZED ON 07/22 NC SEC OF STATE CO", -2500).account, "6110");
  assert.equal(s("Fee for registering DBA", -2000).account, "6110");
  for (const d of ["GOOGLE *Workspace_example", "GOOGLE*DOMAINS INTERNET", "Google Domains", "UptimeRobot", "Nodeping", "Migadu Micro yearly plan"])
    assert.equal(s(d, -1200).account, "6060", d);
});

test("the hledger reader takes the bank line and the owner's largest other posting", () => {
  const j = `2024-01-02 * hetzner.com
    liabilities:credit-cards:chase:ink-unlimited  $-64.39
    liabilities:accounts-payable:hetzner            56.39 EUR  @@  $62.52
    expenses:fees:foreign-transaction               $1.87

2024-01-03 * AUTOMATIC PAYMENT - THANK
    liabilities:credit-cards:chase:ink-unlimited   $39.50  ; date:01/03/2024
    equity:transfers                              $-39.50

2024-01-05 * NAME-CHEAP.COM* WODMG8  ; a renewal
    liabilities:credit-cards:chase:ink-unlimited  $-20.98
    expenses:domains:namecheap
`;
  const rows = readJournal(j, "chase-ink");
  assert.deepEqual(rows.map((r) => [r.desc, r.cents, r.label]), [
    ["hetzner.com", -6439, "liabilities:accounts-payable:hetzner"],
    ["AUTOMATIC PAYMENT - THANK", 3950, "equity:transfers"],
    ["NAME-CHEAP.COM* WODMG8", -2098, "expenses:domains:namecheap"],
  ]);
  assert.deepEqual(wantFor(rows[0].label), ["6060", "6140"]);
  assert.equal(wantFor("expenses:donations"), null);
});
