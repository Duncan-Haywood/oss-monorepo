// Shapes seen in the MIT-licensed csv2ofx project's sample files (rewritten here,
// not copied, and not a bank's real downloads): a spending-only card export
// with unsigned amounts, and a general-ledger journal export.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const card = `"Merchant Name","Card Used For Transaction","Date","Time","Amount"
"Mobil","**** 1234","01/10/2019","06:50 PM","36.33"
"APL*ITUNES.COM/BILL","**** 4567","12/15/2018","05:08 PM","13.98"
`;

test("a purchases-only card file with one unsigned amount column is flagged, not silently income", () => {
  const r = readStatement(card);
  assert.equal(r.rows.length, 2);
  assert.ok(r.problems.some((p) => /Every amount is positive/.test(p)), r.problems.join("|"));
});

test("the flagged card file reads as charges with invert", () => {
  const r = readStatement(card, { invert: true });
  assert.deepEqual(r.rows.map((x) => x.cents), [-3633, -1398]);
  assert.equal(r.problems.length, 0);
});

test("a mixed-sign file gets no all-positive warning", () => {
  const r = readStatement("Date,Description,Amount\n2026-03-01,COFFEE,-4.50\n2026-03-02,PAYROLL,1200.00\n");
  assert.equal(r.problems.length, 0);
});

test("a debit/credit file of deposits only gets no all-positive warning", () => {
  const r = readStatement("Date,Description,Debit,Credit\n2026-03-01,DEPOSIT,,10.00\n2026-03-02,DEPOSIT,,20.00\n");
  assert.equal(r.problems.length, 0);
});

test("a journal export says what it is instead of finding no lines", () => {
  const r = readStatement("JournalNumber,JournalDate,AccountName,NetAmount,TaxCode,Resource,Product,Reference,Description\n1,23-Jan-15,Income,-36000,Tax on Sales,,,INV-0001,Sales\n1,23-Jan-15,Cash,36000,,Office,Charger,INV-0001,Charger\n");
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0], /accounting journal/);
});

// UBS (Swiss, French headings) shape as in the project's ubs-ch-fr sample, rewritten with made-up rows.
const ubs = `Produit;Monn.;Description;Date de valeur;Description 1;Description 2;Description 3;N° de transaction;Débit;Crédit;Solde
0123 45678901.23A;CHF;Compte personnel;31.03.2019;Solde prix prestations;;;A01;10.00;;11'373.94
0123 45678901.23A;CHF;Compte personnel;28.02.2019;Virement postal;ASSOCIATION EXEMPLE;RUE DU LAC 1, 1201 GENEVE, CH;B02;;240.00;11'613.94
`;

test("a header whose only date column is 'Date de valeur' is read as a header, not skipped as a preamble", () => {
  const r = readStatement(ubs);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1000, 24000]);
  assert.equal(r.rows[0].date, "2019-03-31");
  assert.equal(r.problems.length, 0, r.problems.join("|"));
});

test("numbered Description 1..3 columns are joined in header order, not only the last", () => {
  const r = readStatement(ubs);
  assert.equal(r.rows[0].desc, "Solde prix prestations");
  assert.equal(r.rows[1].desc, "Virement postal ASSOCIATION EXEMPLE RUE DU LAC 1, 1201 GENEVE, CH");
});
