import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts of ING (NL) and Rabobank CSV exports as I remember them; every row
// is made up, so none of this is a real bank download.
const ing = [
  '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"',
  '"20260315","Albert Heijn 1234 Utrecht","NL91INGB0001234567","","BA","Af","45,20","Betaalautomaat","Pasvolgnr: 012"',
  '"20260312","Klant BV","NL91INGB0001234567","NL02ABNA0123456789","OV","Bij","1.000,00","Overschrijving","Factuur 14"',
].join("\n");

const rabo = [
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Code","Omschrijving-1","Omschrijving-2","Omschrijving-3"',
  '"NL91RABO0123456789","EUR","RABONL2U","000000000000000001","2026-03-15","2026-03-15","-45,20","954,80","","Jumbo Supermarkten","bg","Pinbetaling","Jumbo 0412","Utrecht"',
  '"NL91RABO0123456789","EUR","RABONL2U","000000000000000002","2026-03-12","2026-03-12","+1.000,00","1.000,00","NL02ABNA0123456789","Klant BV","tb","Factuur 14","",""',
].join("\n");

test("ING: Af/Bij sets the sign and YYYYMMDD dates parse", () => {
  const r = readStatement(ing);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows[0].cents, -4520);
  assert.equal(r.rows[0].date, "2026-03-15");
  assert.equal(r.rows[1].cents, 100000);
  assert.match(r.rows[1].desc, /Klant BV Factuur 14/);
});

test("Rabobank: Omschrijving-1..3 join the payee and Saldo na trn is the running balance", () => {
  const r = readStatement(rabo);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows[0].desc, "Jumbo Supermarkten Pinbetaling Jumbo 0412 Utrecht");
  assert.equal(r.rows[1].desc, "Klant BV Factuur 14");
  assert.equal(r.rows[0].balance, 95480);
  assert.equal(r.rows[1].cents, 100000);
});
