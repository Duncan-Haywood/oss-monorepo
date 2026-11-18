import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout-only fixtures written by hand from each provider's documented export columns
// (2026-11-07). Made-up rows; no real account tried. They pin dates, signs and the
// detected bank for layouts that had no test of their own.
const cases = [
  ["monzo",
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In\n" +
    "tx_1,07/11/2026,10:15:00,Card payment,Pret A Manger,,Eating out,-4.50,GBP,-4.50,GBP,,,,PRET,,-4.50,\n" +
    "tx_2,08/11/2026,09:00:00,Faster payment,ACME Ltd,,Income,1200.00,GBP,1200.00,GBP,,,,SALARY,,,1200.00\n",
    "monzo", [["2026-11-07", -450], ["2026-11-08", 120000]]],
  ["n26",
    '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"\n' +
    '"2026-11-05","2026-11-05","REWE","","MasterCard Payment","","Main","-23.40","","",""\n' +
    '"2026-11-06","2026-11-06","Client GmbH","DE001","Income","Inv 12","Main","500.00","","",""\n',
    "n26", [["2026-11-05", -2340], ["2026-11-06", 50000]]],
  ["mercury",
    "Date (UTC),Description,Amount,Status,Source Account,Bank Description,Reference,Note,Last Four Digits,Name On Card,Category,Mercury Category,Check Number\n" +
    "11-05-2026,Figma,-15.00,Sent,Checking ••1234,FIGMA,,,,,Software,Software,\n" +
    "11-06-2026,Client Inc,2500.00,Sent,Checking ••1234,WIRE IN,,,,,,Revenue,\n",
    "mercury", [["2026-11-05", -1500], ["2026-11-06", 250000]]],
  ["cash app",
    "Transaction ID,Date,Transaction Type,Currency,Amount,Fee,Net Amount,Asset Type,Asset Price,Asset Amount,Status,Notes,Name of sender/receiver,Account\n" +
    "T1,2026-11-05 10:00:00 EST,Cash Card Debit,USD,-$12.00,$0,-$12.00,,,,COMPLETE,Lunch,Taco Place,Cash\n" +
    "T2,2026-11-06 11:00:00 EST,P2P,USD,$50.00,$0,$50.00,,,,COMPLETE,Rent,Bob,Cash\n",
    "cash-app", [["2026-11-05", -1200], ["2026-11-06", 5000]]],
  ["chime",
    "Date,Description,Type,Amount,Net Amount,Settlement Date\n" +
    "11/05/2026,Chipotle,Purchase,-$11.25,-$11.25,11/06/2026\n" +
    "11/06/2026,Direct Deposit ACME,Direct Deposit,$900.00,$900.00,11/06/2026\n",
    undefined, [["2026-11-05", -1125], ["2026-11-06", 90000]]],
];

for (const [name, csv, bank, rows] of cases) {
  test(`${name} export reads dates, signs and amounts`, () => {
    const r = readStatement(csv);
    if (bank) assert.equal(r.bank, bank);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), rows);
  });
}
