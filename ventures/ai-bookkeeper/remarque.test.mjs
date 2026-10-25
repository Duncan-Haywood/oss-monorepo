// hledger's example files (GPL, cloned at run time, read only, rows rewritten here):
// sample.fr.csv has Date, Remarque, Montant; the note column was not a description header,
// so every row imported with an empty description.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("French 'Remarque' and Dutch 'Opmerking' headers are the description", () => {
  const fr = readStatement('"Date","Remarque","Montant"\n"2012/3/22","DÉPÔT","50.00"\n"2012/3/23","VIREMENT VERS ÉPARGNE","-10.00"\n');
  assert.deepEqual(fr.rows.map((r) => [r.cents, r.desc]), [[5000, "DÉPÔT"], [-1000, "VIREMENT VERS ÉPARGNE"]]);
  const nl = readStatement("Datum,Opmerking,Bedrag\n2024-03-01,ALBERT HEIJN 1234,-12.50\n");
  assert.equal(nl.rows[0].desc, "ALBERT HEIJN 1234");
});
