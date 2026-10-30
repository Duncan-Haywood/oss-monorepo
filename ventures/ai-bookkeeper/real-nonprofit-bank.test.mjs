// Descriptors seen in a real small organisation's bank exports
// (eval/queeriouslabs-bank.mjs); each line below is written here, not copied.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -5000) => suggest({ desc, cents }, model).account;

test("bank-truncated utility, ISP and cloud descriptors", () => {
  assert.equal(acct("ACH DEBIT PGANDE          -WEB ONLINE"), "6140");
  assert.equal(acct("DEBIT CARD #XXXX 01/01 MONKEYBRAINS     415-974-1313 CA"), "6140");
  assert.equal(acct("DEBIT CARD #XXXX 11/30 GOOGLE*CLOUD 01E INTERNET     CA"), "6060");
  assert.equal(acct("DEBIT CARD #XXXX 10/01 GOOGLE *CLOUD_01 CC@GOOGLE.COMCA"), "6060");
});
test("a truncated Secretary of State charge is a licence/filing fee", () => {
  assert.equal(acct("DEBIT CARD #XXXX 12/02 CA SECRETARY OF  916-6951338  CA"), "6110");
});
test("a Patreon payout is income, not a guess at anything else", () => {
  assert.equal(acct("ACH CREDIT PATREON         -PATREON", 5000), "4000");
});
test("a business account's analysis charge is a bank fee", () => {
  assert.equal(acct("DEBIT-ANALYSIS CHARGE", -1500), "6010");
  assert.equal(acct("ACCOUNT ANALYSIS FEE", -1500), "6010");
});

// Payees from a second real nonprofit's books (eval/hackclub-ledger.mjs); written here, not copied.
test("clean payee names: rideshare, transit, supermarkets, monitoring and DNS vendors", () => {
  assert.equal(acct("Uber"), "6120");
  assert.equal(acct("Clipper Card"), "6120");
  assert.equal(acct("Instacart"), "6130");
  assert.equal(acct("Papertrail"), "6060");
  assert.equal(acct("DNSimple"), "6060");
  assert.equal(acct("Sticker Mule"), "6000");
  assert.equal(acct("Mechanical Turk"), "6020");
});
test("a bare name that is also a bank-line prefix is not over-matched", () => {
  assert.equal(acct("UBER EATS 8005928996 CA"), "6130");
});

// Replay in date order (eval/hackclub-online.mjs): a payee filed once is suggested next time.
test("replay learns a payee from the line before it", async () => {
  const { replay } = await import("./eval/hackclub-online.mjs");
  const { parseLedger } = await import("./eval/hackclub-ledger.mjs");
  const rows = parseLedger("2015/01/02 Zorblax Cloud\n    Expenses:Operating:Software  $5\n    Assets:Bank\n\n2015/02/02 Zorblax Cloud\n    Expenses:Operating:Software  $5\n    Assets:Bank\n");
  assert.equal(rows[0].date, "2015/01/02");
  const o = replay(rows);
  assert.deepEqual([o.n, o.right, o.blank, o.bySource.memory?.right], [2, 1, 1, 1]);
  assert.equal(replay(rows, { learn: false }).right, 0);
});

// Same replay on bank text (eval/queeriouslabs-online.mjs): card numbers and dates in the descriptor must not hide a repeat payee.
test("replay learns a raw bank descriptor despite changing dates and card digits", async () => {
  const { replay, parseDated } = await import("./eval/queeriouslabs-online.mjs");
  const csv = "Date,Description,Statement Description,Category,Debit,Credit,Balance\n" +
    "1/02/2021,Zorblax,DEBIT CARD #XXXX 01/01 ZORBLAX HOSTING 415-555-0100 CA,Web Infrastructure,-75,,1\n" +
    "2/02/2021,Zorblax,DEBIT CARD #XXXX 02/01 ZORBLAX HOSTING 415-555-0100 CA,Web Infrastructure,-75,,1\n";
  const rows = parseDated(csv);
  assert.equal(rows[0].date, "2021-01-02");
  const o = replay(rows);
  assert.deepEqual([o.n, o.right, o.bySource.memory?.right], [2, 1, 1]);
});
test("open-source collective lines: sponsor contributions are income, bounties are contractor pay", () => {
  assert.equal(acct("Monthly contribution from A Person (Bronze)", 1000), "4000");
  assert.equal(acct("Contribution from incognito", 2500), "4000");
  assert.equal(acct("Expense from A Person - Regression finder bounty for #1234", -5000), "6020");
  assert.equal(acct("Owner contribution", 100000), "3010");
});

// Bank of America card text from Actual Budget's sample files (MIT); lines written here, not copied.
test("fuel stops and a waste hauler on card text with trailing dates and phone numbers", () => {
  assert.equal(acct("REGENCY MART CITGO 01/18 PURCHASE RICHMOND VA"), "6160");
  assert.equal(acct("COUNTY WASTE 01/18 PURCHASE 804-8439288 VA"), "6140");
});
