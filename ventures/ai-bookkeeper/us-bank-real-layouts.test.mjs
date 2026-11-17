// Layouts read from US bank exports in public repositories (eval/us-bank-exports.mjs,
// 2026-11-12). The rows below are written here, not copied: same columns and quirks,
// made-up merchants and amounts.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, checkRunningBalance, parseCsv } from "./bank.mjs";

test("TD Bank: routing and account columns, an unquoted comma in a description, Account Running Balance", () => {
  const csv = [
    "Date,Bank RTN,Account Number,Transaction Type,Description,Debit,Credit,Check Number,Account Running Balance",
    "2024-01-12,000000000,0000000000,DIRECTDEP,ACME CORP DIRECT DEP ,,1000.00,,2950.00",
    "2024-01-10,000000000,0000000000,DEBIT,CITY WATER, SERVICE ,40.5,,,1950.00",
    "2024-01-09,000000000,0000000000,CHECK,CHECK # 101,9.5,,101,1990.50",
    "2024-01-05,000000000,0000000000,INT,IOD INTEREST PAID ,,0.04,,2000.00",
  ].join("\n");
  const r = readStatement(csv);
  assert.equal(r.bank, "td-bank");
  assert.equal(r.rows.length, 4, JSON.stringify(r.problems));
  const water = r.rows.find((x) => x.desc.startsWith("CITY WATER"));
  assert.equal(water.desc, "CITY WATER, SERVICE");
  assert.equal(water.cents, -4050);
  assert.equal(water.balance, 195000);
  assert.ok(r.problems.some((p) => /Line 3: the description held an unquoted comma/.test(p)));
  const bal = checkRunningBalance(r.rows);
  assert.equal(bal.checked, true);
  assert.deepEqual(bal.breaks, []);
});

test("an unquoted comma is not rejoined when the row reads as it stands", () => {
  // Extra trailing cell, money columns already fine: leave it alone.
  const csv = "Date,Description,Debit,Credit,Balance\n2024-01-10,Coffee,4.00,,96.00,\n2024-01-09,Opening,,100.00,100.00\n";
  const r = readStatement(csv);
  assert.equal(r.rows.find((x) => x.desc === "Coffee").cents, -400);
  assert.ok(!r.problems.some((p) => /unquoted comma/.test(p)));
});

test("Navy Federal: unsigned Amount with a Credit Debit Indicator column, both header spellings", () => {
  const tail = "type,Type Group,Reference,Instructed Currency,Currency Exchange Rate,Instructed Amount,Description,Category,Check Serial Number,Card Ending";
  const newer = `Posting Date,Transaction Date,Amount,Credit Debit Indicator,${tail},Rewards Total,Rewards Type\n` +
    "12/30/2025,12/30/2025,120.00,Debit,ACH,Withdrawals,REF1,,,,POWER CO BILL PAY,Utilities,,,,\n" +
    "12/10/2025,12/10/2025,2500.00,Credit,ACH,Deposits,REF2,,,,ACME PAYROLL,Income,,,,\n";
  const older = `﻿Booking Date,Amount,Credit Debit Indicator,${tail}\n` +
    "03/01/2025,15.25,Debit,Purchase,Purchase,,,,,CORNER DELI,Dining,,1234\n";
  for (const [csv, n] of [[newer, 2], [older, 1]]) {
    const r = readStatement(csv);
    assert.equal(r.bank, "navy-federal");
    assert.equal(r.rows.length, n);
  }
  const r = readStatement(newer);
  assert.equal(r.rows.find((x) => x.desc === "POWER CO BILL PAY").cents, -12000);
  assert.equal(r.rows.find((x) => x.desc === "ACME PAYROLL").cents, 250000);
});

test("Truist: amounts in parentheses, Daily Posted Balance not read as a running balance", () => {
  const csv = "Posted Date,Transaction Date,Transaction Type,Check/Serial #,Description,Amount,Daily Posted Balance\n" +
    "11/04/2024,11/04/2024,POS,,MARKET 11-01 DEBIT CARD PURCHASE,($1.35),\n" +
    "11/04/2024,11/04/2024,POS,,WAREHOUSE CLUB DEBIT CARD PURCHASE-PIN,($31.72),$500.00\n" +
    "11/05/2024,11/05/2024,ACH,,ACME PAYROLL DEPOSIT,$900.00,$1400.00\n";
  const r = readStatement(csv);
  assert.equal(r.bank, "truist");
  assert.deepEqual(r.rows.map((x) => x.cents), [-135, -3172, 90000]);
  assert.ok(r.rows.every((x) => x.balance === null));
});

test("Bank of America card: Posted Date, Reference Number, Payee, Address, Amount", () => {
  const csv = 'Posted Date,Reference Number,Payee,Address,Amount\n05/15/2025,1234567890,"BA ELECTRONIC PAYMENT","",188.00\n05/12/2025,1234567891,"HARDWARE STORE 42","ANYTOWN  ST ",-42.10\n';
  const r = readStatement(csv);
  assert.equal(r.bank, "bank-of-america-card");
  assert.deepEqual(r.rows.map((x) => x.cents), [18800, -4210]);
});

test("line numbers count the blank lines a bank leaves above the header", () => {
  // Bank of America checking: summary block, a blank line, then the header.
  const csv = 'Description,,Summary Amt.\nBeginning balance as of 11/07/2025,,"100.00"\n\nDate,Description,Amount,Running Bal.\n11/10/2025,"COFFEE","-5.00","95.00"\n13/45/2025,"BAD","-1.00","94.00"\n';
  const r = readStatement(csv);
  assert.equal(r.rows[0].line, 5);
  assert.ok(r.problems.some((p) => /^Line 6:/.test(p)), JSON.stringify(r.problems));
  assert.deepEqual(parseCsv("a,b\n\n\nc,d\n").map((x) => x.ln), [1, 4]);
  assert.deepEqual(parseCsv('a,"b\nb"\nc,d\n').map((x) => x.ln), [1, 3]);
});
