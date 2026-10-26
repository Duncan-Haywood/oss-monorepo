// MT940 :86: written as /KEY/value pairs (ING, ABN AMRO, Rabobank, KBC style).
// Files are hand-written from the layout those banks document; names, IBANs and amounts are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const file = (...entries) => [":20:STARTUMS", ":25:NL12INGB0001234567", ":28C:00001/001", ":60F:C260101EUR1000,00", ...entries, ":62F:C260131EUR1000,00", "-"].join("\n");

test("slash-tag :86: gives payee and remittance, not IBAN, BIC or reference ids", () => {
  const r = readStatement(file(
    ":61:2601020102D12,50NMSCNONREF",
    ":86:/TRTP/SEPA OVERBOEKING/IBAN/NL91ABNA0417164300/BIC/ABNANL2A/NAME/Jan de Vries/REMI/Factuur 2026-014/EREF/NOTPROVIDED",
    ":61:2601050105C250,00NTRFNONREF//BANKREF1",
    ":86:/TRTP/iDEAL/IBAN/NL02RABO0123456789/BIC/RABONL2U/NAME/Webshop BV/REMI/0000123 Order 5543/EREF/20260105",
  ));
  assert.deepEqual(r.rows.map((x) => x.desc), ["Jan de Vries Factuur 2026-014", "Webshop BV 0000123 Order 5543"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 25000]);
});

test("wrapped lines, /CNTP/ counterparty and unstructured/structured remittance", () => {
  const r = readStatement(file(
    ":61:2601100110D99,00NTRFNONREF",
    ":86:/TRTP/SEPA OVERBOEKING/CNTP/NL02RABO0123456789/RABONL2U/Kantoor Pla",
    "net BV/Utrecht/REMI/USTD//Huur januari/EREF/NOTPROVIDED",
    ":61:2601110111D10,00NTRFNONREF",
    ":86:/TRTP/SEPA OVERBOEKING/NAME/Gemeente/REMI/STRD/CUR/1234567890123456/EREF/X",
  ));
  assert.equal(r.rows[0].desc, "Kantoor Planet BV Huur januari");
  assert.equal(r.rows[1].desc, "Gemeente 1234567890123456");
});

test("ING-style // separators and a closing / leave no stray slash", () => {
  const r = readStatement(file(
    ":61:2601120112D20,00NTRFNONREF",
    ":86:/EREF/EV12341REP1231456T1234//CNTP/NL32INGB0000012345/INGBNL2A/ING BANK NV INZAKE WEB///REMI/USTD//EV10001REP1000000T1000/",
    ":61:2601130113D30,00NTRFNONREF",
    ":86:/TRTP/SEPA/NAME/Jan de Vries//REMI/Factuur 1/2/",
  ));
  assert.deepEqual(r.rows.map((x) => x.desc), ["ING BANK NV INZAKE WEB EV10001REP1000000T1000", "Jan de Vries Factuur 1/2"]);
});

test("plain and German-style :86: text are unchanged", () => {
  const r = readStatement(file(":61:260106D9,99NCHGNONREF", ":86:BETALINGSKENMERK 123 KOSTEN", ":61:260107D5,00NCHGNONREF", ":86:166?00GUTSCHR?20Miete?32Hans"));
  assert.deepEqual(r.rows.map((x) => x.desc), ["BETALINGSKENMERK 123 KOSTEN", "Hans Miete"]);
});

// Layouts seen in the BSD-licensed WoLpH/mt940 test files (ING, KNAB, Rabobank, PostFinance); snippets rewritten, names made up.
test("free-text :86: lines the bank ended on purpose get a space, lines cut at 65 characters do not", () => {
  const r = readStatement(file(
    ":61:2601020102D12,50NMSCNONREF",
    ":86:RC AFREKENING BETALINGSVERKEER",
    "BETREFT REKENING 4715589",
    ":61:2601030103C10,00NTRFNONREF",
    ":86:GIRO AUS ONLINE-SIC 80701 AUFTRAGGEBER: XXXXXXXXX XXX XXXXXXXXSTR",
    "ASSE 111 MITTEILUNGEN: 1 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX SONNE",
    "NGLAESER",
  ));
  assert.equal(r.rows[0].desc, "RC AFREKENING BETALINGSVERKEER BETREFT REKENING 4715589");
  assert.equal(r.rows[1].desc, "GIRO AUS ONLINE-SIC 80701 AUFTRAGGEBER: XXXXXXXXX XXX XXXXXXXXSTRASSE 111 MITTEILUNGEN: 1 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX SONNENGLAESER");
});

test("several :86: lines after one :61: (Rabobank) are all kept; a soft hyphen is dropped", () => {
  const r = readStatement(file(
    ":61:260102D000000001213,28N0440121470966      W.P. Jansen",
    ":86:Terugboeking",
    ":86:NIET AKKOORD MET AFSCHRIJVING",
    ":86:20095731",
    ":61:2601030103D1,00NTRFNONREF",
    ":86:iDEAL 10­06­2026",
  ));
  assert.equal(r.rows[0].desc, "Terugboeking NIET AKKOORD MET AFSCHRIJVING 20095731");
  assert.equal(r.rows[0].cents, -121328);
  assert.equal(r.rows[1].desc, "iDEAL 10-06-2026");
});

test("Triodos-style '>NN' subfields read like '?NN' ones, with no '>20' left in the description", () => {
  const r = readStatement([":20:X", ":25:TRIODOSBANK/0390123456", ":28:1", ":60F:C110101EUR100,00",
    ":61:110125D7,00N000NONREF", ":86:000>100133967858", ">20 HUUR>21 KANTOOR - FEB 2010", ":62F:C110201EUR93,00", "-"].join("\n"));
  assert.equal(r.rows[0].desc, "HUUR KANTOOR - FEB 2010");
  assert.equal(r.rows[0].cents, -700);
});
