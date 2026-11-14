// Faults found by reading more real US exports from public repositories (eval/us-bank-exports.mjs,
// 2026-11-14: Wells Fargo, Chase checking and card, Ally, Apple Card, a Stripe-funded LLC account).
// The rows below are written here, not copied: same columns and quirks, made-up payees and amounts.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { payeeKey, achCompact, suggest } from "./categorize.mjs";
import { newBooks, importStatement, categorize } from "./engine.mjs";

const ALLY = [
  "Date, Time, Amount, Type, Description",
  "2026-08-14,04:33:21,2500.00,Deposit,X123 ACME WIDGETS PAYROLL",
  "2026-08-12,03:46:30,-25.00,Withdrawal,VENMO PAYMENT",
  "2026-08-12,00:56:11,-41.20,Withdrawal,CITY POWER DIRECTPAY~ Future Amount: 41.2 ~ Tran: ACHDW",
  "2026-08-10,23:43:39,3.10,Deposit,Interest Paid",
  "2026-08-03,00:30:06,-60.00,Withdrawal,APPLECARD GSBANK PAYMENT~ Future Amount: 60 ~ Tran: ACHDW",
  "2026-07-30,02:00:00,-12.99,Withdrawal,STREAMCO SUBSCRIPTION",
].join("\n");

test("Ally checking: a utility's DIRECTPAY bill payment does not flip a signed file (real file: 528 rows were mis-signed)", () => {
  const r = readStatement(ALLY);
  assert.equal(r.bank, "ally");
  assert.equal(r.inferred ?? null, null, r.inferred);
  assert.equal(r.rows.find((x) => /PAYROLL/.test(x.desc)).cents, 250000);
  assert.equal(r.rows.find((x) => /DIRECTPAY/.test(x.desc)).cents, -4120);
});

test("Discover's own DIRECTPAY payment row still settles a card file's sign", () => {
  const csv = "Trans. Date,Post Date,Description,Amount,Category\n03/01/2026,03/01/2026,CORNER CAFE,12.50,Restaurants\n03/10/2026,03/10/2026,DIRECTPAY FULL BALANCE,-102.16,Payments and Credits\n";
  const r = readStatement(csv);
  assert.equal(r.rows.find((x) => /CAFE/.test(x.desc)).cents, -1250);
  assert.equal(r.rows.find((x) => /DIRECTPAY/.test(x.desc)).cents, 10216);
});

test("a Type column whose Withdrawal/Deposit words agree with the signs keeps them, even with a card-payment row in it", () => {
  // One value outside the debit/credit vocabulary ("Check") stops the Type column being read as a
  // marker; the side words still agree with the signs on the other rows, so nothing is flipped.
  const csv = [
    "Date,Amount,Type,Description",
    "2026-01-02,1800.00,Deposit,CLIENT INVOICE 12",
    "2026-01-03,-300.00,Withdrawal,CARD PAYMENT THANK YOU",
    "2026-01-04,-45.00,Withdrawal,OFFICE SUPPLY CO",
    "2026-01-05,-60.00,Withdrawal,PHONE CO",
    "2026-01-06,-120.00,Check,CHECK 1001",
    "2026-01-07,500.00,Deposit,CLIENT INVOICE 13",
    "2026-01-08,-20.00,Withdrawal,PARKING",
  ].join("\n");
  const r = readStatement(csv);
  assert.equal(r.inferred ?? null, null, r.inferred);
  assert.equal(r.rows[0].cents, 180000);
  assert.equal(r.rows[1].cents, -30000);
});

test("a pandas-saved Chase checking file (unnamed index column first) is still named Chase", () => {
  const csv = ",Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n" +
    "12,DEBIT,06/25/2018,Online Payment 111 To LANDLORD CO 06/25,-900.0,BILLPAY,100.00,\n" +
    "40,CREDIT,06/20/2018,ACME PAYROLL PPD ID: 999,1000.0,ACH_CREDIT,1000.00,\n";
  const r = readStatement(csv);
  assert.equal(r.bank, "chase-checking");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].cents, -90000);
});

const CHASE_ACH = (name, entry, amt, date) =>
  `CREDIT,${date},"ORIG CO NAME:${name.padEnd(20)} ORIG ID:0000000001 DESC DATE:       CO ENTRY DESCR:${entry}  SEC:CCD    TRACE#:000000000000001 EED:230801   IND ID:ST-AAAA1111              IND NAME:EXAMPLE STUDIO LLC TRN: 0000000001TC",${amt},ACH_CREDIT,,,`;

test("Chase ACH addenda: the payee is the originator, so payee memory does not lump every ACH line together", () => {
  const stripe = "ORIG CO NAME:STRIPE               ORIG ID:0000000001 DESC DATE:       CO ENTRY DESCR:TRANSFER  SEC:CCD    TRACE#:000000000000001 EED:230801   IND ID:ST-AAAA1111 IND NAME:EXAMPLE STUDIO LLC TRN: 1TC";
  const irs = "ORIG CO NAME:IRS                  ORIG ID:0000000002 DESC DATE:080123 CO ENTRY DESCR:USATAXPYMTSEC:CCD    TRACE#:000000000000002 EED:230801";
  const gusto = "ORIG CO NAME:GUSTO                ORIG ID:0000000003 DESC DATE:       CO ENTRY DESCR:NET 0801  SEC:CCD    TRACE#:000000000000003 EED:230801";
  assert.equal(achCompact(stripe), "STRIPE TRANSFER");
  assert.equal(payeeKey(stripe), "stripe transfer");
  assert.equal(payeeKey(gusto), "gusto");
  assert.notEqual(payeeKey(stripe), payeeKey(gusto));
  assert.equal(achCompact("AMAZON MKTPL*AB12 Amzn.com/bill WA"), null);
  assert.equal(achCompact(irs), "IRS USATAXPYMT");
});

test("Chase ACH: a Stripe payout into checking is suggested as sales, not a transfer", () => {
  const csv = "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n" +
    CHASE_ACH("STRIPE", "TRANSFER", "420.15", "08/03/2023") + "\n" +
    CHASE_ACH("STRIPE", "TRANSFER", "88.40", "08/02/2023") + "\n" +
    'DEBIT,08/01/2023,"Payment to Chase card ending in 0000 08/01",-500.00,LOAN_PMT,,,\n';
  let books = newBooks();
  books = importStatement(books, csv, "1000").books;
  const c = categorize(books);
  const txns = (c.books ?? c).transactions;
  const payouts = txns.filter((t) => t.cents > 0);
  assert.equal(payouts.length, 2);
  for (const t of payouts) { assert.equal(t.suggestion.account, "4000", t.suggestion.reason); assert.equal(t.suggestion.source, "built-in"); }
  // The card payment is still a transfer.
  assert.match(txns.find((t) => t.cents < 0).suggestion.reason, /transfer/);
});
