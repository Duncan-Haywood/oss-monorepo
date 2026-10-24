import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { decodeBytes } from "./textcodec.mjs";

// Layouts seen in the test-data files of the bank2ynab project (MIT; layout
// only, every row below is made up). Found by importing its 40 sample files
// with the CLI: a German card export (Buchungsbetrag), a UK card export with
// "Date Processed" and Pending rows, a Czech export in Windows-1250, and a
// Singapore export with a detail line under each transaction read nothing or
// skipped half their lines.

test("German card export: Buchungsbetrag is the amount, Transaktionsbeschreibung the description", () => {
  const r = readStatement([
    '"Umsatz getätigt von";"Belegdatum";"Buchungsdatum";"Originalbetrag";"Originalwährung";"Umrechnungskurs";"Buchungsbetrag";"Buchungswährung";"Transaktionsbeschreibung"',
    '"51_5 4400";"20.02.18";"20.02.18";"-5,00";"EUR";"1,00";"-5,00";"EUR";"CAFE EXAMPLE BERLIN  DE"',
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2018-02-20", -500, "CAFE EXAMPLE BERLIN DE"]]);
  assert.deepEqual(r.problems, []);
});

test("UK card export: Date Processed, and Pending rows are named as pending", () => {
  const r = readStatement([
    "Date Processed,Description,Amount,",
    "Pending,SHOP ONE LONDON GBR,£67.40,",
    "12-Dec-2019,SHOP TWO LONDON GBR,\"£1,183.23\",",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2019-12-12", 118323]]);
  assert.match(r.problems[0], /pending, not a booked transaction/);
});

test("Detail line under a transaction (no date, no amount) joins the description above", () => {
  const r = readStatement([
    "Transaction date,Value date,Description,Withdrawals (SGD),Deposits (SGD)",
    "18/04/2018,18/04/2018,DEBIT PURCHASE,6.66,",
    ",,15/04/18 12-3456 SHOP EXAMPLE,",
    "17/04/2018,17/04/2018,ATM WITHDRAWAL,50.00,",
    ",,12-3456 BRANCH,",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2018-04-18", -666, "DEBIT PURCHASE 15/04/18 12-3456 SHOP EXAMPLE"],
    ["2018-04-17", -5000, "ATM WITHDRAWAL 12-3456 BRANCH"],
  ]);
  assert.deepEqual(r.problems, []);
});

test("Czech export with no letter unique to Windows-1250 is still read as 1250 from its column names", () => {
  const text = "Datum provedení;Datum zaúčtování;Název protiúčtu;Zpráva;Zaúčtovaná částka;Měna účtu\n27.05.2018;27.05.2018;Jan Novák;Obed;-1,00;CZK\n";
  const bytes = new Uint8Array([...text].map((c) => ({ "í": 0xed, "ú": 0xfa, "č": 0xe8, "á": 0xe1, "ě": 0xec, "Č": 0xc8, "ý": 0xfd }[c] ?? c.charCodeAt(0))));
  const back = decodeBytes(bytes);
  assert.match(back, /Zaúčtovaná částka/);
  const r = readStatement(back);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2018-05-27", -100, "Obed"]]);
});

test("Discover card export: Trans. Date is the date, not Post Date", () => {
  const r = readStatement([
    "Trans. Date,Post Date,Description,Amount,Category",
    "10/05/2026,10/06/2026,SHOP EXAMPLE,23.10,Merchandise",
    "10/07/2026,10/07/2026,DIRECTPAY FULL BALANCE,-500.00,Payments and Credits",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-10-05", -2310], ["2026-10-07", 50000]]);
});
