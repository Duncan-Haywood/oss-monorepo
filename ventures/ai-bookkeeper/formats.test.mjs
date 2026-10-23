// Amount and date spellings seen in bank exports that parseCents / parseDate
// once misread silently (found by probing, 2026-10-23).
import test from "node:test";
import assert from "node:assert/strict";
import { parseCents, parseDate } from "./bank.mjs";

test("amounts: the last separator is the decimal point whatever the flag says", () => {
  for (const flag of [false, true]) {
    assert.equal(parseCents("1.234,56", flag), 123456);
    assert.equal(parseCents("€1.234,56", flag), 123456);
    assert.equal(parseCents("1,234.56", flag), 123456);
    assert.equal(parseCents("12.5", flag), 1250);
    assert.equal(parseCents("12,50", flag), 1250);
    assert.equal(parseCents("1 234,56", flag), 123456);
  }
});

test("amounts: a lone separator before three digits still follows the flag", () => {
  assert.equal(parseCents("1,234"), 123400);
  assert.equal(parseCents("1.234", true), 123400);
  assert.equal(parseCents("1.234"), 123);
});

test("amounts: parentheses anywhere mean negative", () => {
  assert.equal(parseCents("$ (12.00)"), -1200);
  assert.equal(parseCents("(12.00)CR"), -1200);
  assert.equal(parseCents("USD (1,000.00)"), -100000);
});

test("dates: compact, weekday-led, ordinal and run-together spellings", () => {
  for (const s of ["20261005", "Mon, Oct 5, 2026", "Monday 5 October 2026", "5th October 2026", "05Oct2026", "Oct 05 2026", "2026-10-05T14:03:00Z"])
    assert.equal(parseDate(s), "2026-10-05", s);
  assert.equal(parseDate("20261305"), null);
  assert.equal(parseDate("20260230"), null);
  assert.equal(parseDate("Oct 5, 2026"), "2026-10-05");
});

test("amounts: a DR suffix is money out, CR is money in", () => {
  assert.equal(parseCents("12.50 DR"), -1250);
  assert.equal(parseCents("1,200.00DR"), -120000);
  assert.equal(parseCents("12.50 Debit"), -1250);
  assert.equal(parseCents("3.50 CR"), 350);
  assert.equal(parseCents("3.50 Credit"), 350);
});

test("OFX: thousands separators in amounts and ledger balance, XML entities", async () => {
  const { readOfx } = await import("./bank.mjs");
  const o = "<OFX><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20260105<TRNAMT>-1,234.56<NAME>A &amp; B &apos;x&apos; &#38; C<MEMO>m</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>1,234.56<DTASOF>20260131</LEDGERBAL></STMTRS></OFX>";
  const r = readOfx(o);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows[0].cents, -123456);
  assert.equal(r.rows[0].desc, "A & B 'x' & C m");
  assert.equal(r.statement.cents, 123456);
});

test("Fidelity brokerage export: Run Date and Amount ($) headers are read", async () => {
  const { readStatement } = await import("./bank.mjs");
  const r = readStatement("Run Date,Account,Account Number,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date\n10/01/2026,Cash,X1,DIVIDEND RECEIVED,VTI,VANGUARD,Cash,0,,,,,12.34,\n");
  assert.deepEqual(r.problems, []);
  assert.equal(r.bank, "fidelity");
  assert.equal(r.rows[0].cents, 1234);
  assert.equal(r.rows[0].date, "2026-10-01");
});

test("Schwab Bank older export: Withdrawal (-) and Deposit (+) columns are read", async () => {
  const { readStatement } = await import("./bank.mjs");
  const r = readStatement('"Date","Type","Check #","Description","Withdrawal (-)","Deposit (+)","RunningBalance"\n"10/21/2026","ATM","","ATM WITHDRAWAL","$40.00","","$1,200.50"\n"10/20/2026","INTADJUST","","Bank Interest","","$0.12","$1,240.50"\n');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4000, 12]);
  assert.equal(r.rows[0].balance, 120050);
});

test("Apple Card: charges flip even when the file holds no payment row", async () => {
  const { readStatement } = await import("./bank.mjs");
  const r = readStatement("Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By\n10/21/2026,10/22/2026,APPLE.COM/BILL,Apple,Services,Purchase,9.99,Me\n");
  assert.equal(r.bank, "apple-card");
  assert.equal(r.rows[0].cents, -999);
});

test("brokerage and Indian-style headers: Activity Date, Narration, Withdrawal Amt./Deposit Amt., Closing Balance", async () => {
  const { readStatement } = await import("./bank.mjs");
  const rh = readStatement("Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n10/01/2026,10/01/2026,10/02/2026,,ACH Deposit,ACH,,,\"$500.00\"\n");
  assert.deepEqual(rh.rows.map((x) => [x.date, x.cents]), [["2026-10-01", 50000]]);
  const ind = readStatement("Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n10/01/2026,GROCERY,45.10,,100.00\n10/02/2026,SALARY,,2000.00,2100.00\n");
  assert.deepEqual(ind.rows.map((x) => x.cents), [-4510, 200000]);
});

test("Credit Debit Indicator column signs an unsigned amount (Navy Federal style)", async () => {
  const { readStatement } = await import("./bank.mjs");
  const r = readStatement("Transaction Date,Description,Amount,Credit Debit Indicator,Category\n10/01/2026,COFFEE,4.50,Debit,Dining\n10/02/2026,PAY,1000.00,Credit,Income\n");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, 100000]);
});
