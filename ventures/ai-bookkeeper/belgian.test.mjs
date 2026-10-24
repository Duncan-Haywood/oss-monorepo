import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts of Belgian bank CSVs, taken from the column positions in the
// ofxstatement-be-* plugins (KBC, Belfius, Triodos, Keytrade). The header
// words are Dutch ones I wrote to fit those positions and every row is made up,
// so none of this is a real bank download.
const kbc = [
  "Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;Omschrijving;Valuta;Bedrag;Saldo;credit;debet;rekeningnummer tegenpartij;BIC tegenpartij;Naam tegenpartij;Adres tegenpartij;gestructureerde mededeling;vrije mededeling",
  "BE68539007547034;Zichtrekening;Jan Peeters;EUR;12;15/03/2026;BETALING MET DEBETKAART COLRUYT;15/03/2026;-45,20;954,80;;-45,20;;;COLRUYT;;;Aankoop",
  "BE68539007547034;Zichtrekening;Jan Peeters;EUR;11;12/03/2026;OVERSCHRIJVING;12/03/2026;1.000,00;1.000,00;1.000,00;;BE71096123456769;GKCCBEBB;Klant NV;;;Factuur 14",
].join("\n");

test("KBC: Valuta is a value date, not a currency, and the free message joins the description", () => {
  const r = readStatement(kbc);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.problems, [], "no false 'mixes currencies' warning");
  assert.equal(r.rows[0].cents, -4520);
  assert.equal(r.rows[0].date, "2026-03-15");
  assert.match(r.rows[1].desc, /OVERSCHRIJVING Factuur 14/);
});

test("a Dutch Boekingsdatum header is found (Belfius, Triodos, Keytrade)", () => {
  const triodos = [
    "Boekingsdatum,Rekening,Bedrag,Tegenrekening,Naam tegenpartij,Omschrijving,Valutadatum,Code,Mededeling",
    '25-03-2026,BE10523080801234,"-1.250,00",BE71096123456769,Verhuurder,Huur,25-03-2026,OV,Huur maart',
    '24-03-2026,BE10523080801234,"2.500,00",BE71096123456770,Klant,Betaling,24-03-2026,OV,Factuur 3',
  ].join("\n");
  const r = readStatement(triodos);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].date, "2026-03-25");
  assert.equal(r.rows[0].cents, -125000);
  assert.equal(r.rows[1].cents, 250000);
  assert.match(r.rows[0].desc, /Huur maart/, "the message column is kept");
  assert.ok(!/^BE10/.test(r.rows[0].desc), "the account number is not the description");
  assert.ok(!r.problems.some((p) => /preamble/.test(p)), "the header row is not skipped as a preamble");

  const keytrade = [
    "Transactienummer;Boekingsdatum;Valutadatum;Tegenpartij;Mededeling;Bedrag;Munt",
    "1001;25.03.2026;25.03.2026;Verhuurder;Huur maart;-850,00;EUR",
    "1002;23.03.2026;23.03.2026;Werkgever BV;Loon;2.400,50;EUR",
  ].join("\n");
  const k = readStatement(keytrade);
  assert.deepEqual(k.rows.map((x) => [x.date, x.cents, x.desc]), [["2026-03-25", -85000, "Verhuurder Huur maart"], ["2026-03-23", 240050, "Werkgever BV Loon"]]);
});

test("Belfius: the quoted file with a query header reads the counterparty and message", () => {
  const head = ["Rekening", "Boekingsdatum", "Afschriftnummer", "Transactienummer", "Rekening tegenpartij", "Naam tegenpartij bevat", "Straat en nummer", "Postcode en plaats", "Transactie", "Valutadatum", "Bedrag", "Devies", "BIC", "Landcode", "Mededelingen"];
  const row = (d, n, amt, who, msg) => ["BE10 0000 0000 0001", d, "12", n, "BE71 0961 2345 6769", who, "", "", "Overschrijving", d, amt, "EUR", "GKCCBEBB", "BE", msg];
  const q = (r) => r.map((c) => `"${c}"`).join(";");
  const t = ["Belfius Direct Net", "Rekening:;BE10 0000 0000 0001", "", [head, row("25/03/2026", "0045", "-23,40", "COLRUYT", "Aankoop"), row("21/03/2026", "0044", "1.800,00", "Werkgever", "Loon")].map(q).join("\r\n")].join("\r\n");
  const r = readStatement(t);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2026-03-25", -2340, "COLRUYT Aankoop"], ["2026-03-21", 180000, "Werkgever Loon"]]);
});
