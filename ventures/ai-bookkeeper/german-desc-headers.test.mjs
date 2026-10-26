// Two German description headers found by reading the sample files of
// ofxstatement-bubbas (DKB credit card, flatex; cloned at run time, nothing
// copied). Both imported every row with an empty description. Rows are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("DKB credit-card 'Umsatzbeschreibung' is the description", () => {
  const csv = '"Kreditkarte:";"1234********1234 Kreditkarte";\n\n"Saldo:";"-76.77 EUR";\n\n"Umsatz abgerechnet";"Wertstellung";"Belegdatum";"Umsatzbeschreibung";"Betrag (EUR)";"Ursprünglicher Betrag";\n"Ja";"04.02.2013";"02.02.2013";"TANKSTELLE MUSTER";"-95,00";"";\n"Ja";"23.01.2013";"22.01.2013";"Habenzinsen";"0,21";"";\n';
  const r = readStatement(csv);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].desc, "TANKSTELLE MUSTER");
  assert.equal(r.rows[0].cents, -9500);
});

test("flatex 'Buchungsinformationen' is the description", () => {
  const csv = "Buchungstag;Valuta;Bankleitzahl;Kontonummer;Buchungsinformationen;Betrag;Waehrung\n07.04.2015;09.04.2015;;;Gebühren Ordernummer,1 Transnr 2;-13,49;EUR\n08.04.2015;10.04.2015;;;Dividende Muster AG;1.672,50;EUR\n";
  const r = readStatement(csv);
  assert.equal(r.rows.length, 2);
  assert.match(r.rows[0].desc, /Gebühren/);
  assert.equal(r.rows[1].cents, 167250);
});
