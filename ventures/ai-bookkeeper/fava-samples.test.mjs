import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts seen in the sample files of beancount/fava (MIT, layout only; every
// row below is made up). Found by reading its CSVs with the reader: the
// Payee/Narration layout kept only the payee, and the Austrian export kept the
// booking type ("Bankomat") but dropped the Umsatztext that names the merchant.

test("Payee and Narration columns: both are kept in the description", () => {
  const r = readStatement([
    "Date,Payee,Narration,Amount",
    "2026-03-02,Supermarket,Groceries,-52.10",
    "2026-03-31,Employer,Salary,2500.00",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.cents, x.desc]), [[-5210, "Supermarket Groceries"], [250000, "Employer Salary"]]);
});

test("Austrian export: the Umsatztext follows the booking type", () => {
  const r = readStatement([
    "IBAN;Auszugsnummer;Buchungsdatum;Valutadatum;Umsatzzeit;Zahlungsreferenz;Waehrung;Betrag;Buchungstext;Umsatztext;Saldo",
    'AT000000000000;1;2017-02-14;2017-02-14;2017-02-14-11.57.44.235044;"";EUR;-100,00;"Bankomat";" BANKOMAT  00000483 K2 UM 11:56";4.467,89',
  ].join("\n"));
  assert.equal(r.rows.length, 1);
  assert.match(r.rows[0].desc, /^Bankomat BANKOMAT 00000483/);
});
