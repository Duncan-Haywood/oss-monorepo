import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeSdiReceipt, readSdiReceipt, receiptFindings, SDI_CODES, sha256Hex, withhold } from "./sdi-receipt.mjs";
import { preflightDocuments } from "./report.mjs";
import { checkFatturaPa } from "./fatturapa.mjs";

// Receipts written for these tests in the shape of specification 1.9's Appendix 6
// (element names and namespaces); the values are made up.
const B2B = "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fattura/messaggi/v1.0";
const PA = "http://www.fatturapa.gov.it/sdi/messaggi/v1.0";
const ns = (errors, { name = "IT01234567890_00001.xml", hash = "", root = "RicevutaScarto", space = B2B } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<ns3:${root} xmlns:ns3="${space}" versione="1.0">
  <IdentificativoSdI>1234</IdentificativoSdI>
  <NomeFile>${name}</NomeFile>
  ${hash ? `<Hash>${hash}</Hash>` : ""}
  <DataOraRicezione>2026-11-15T10:00:00.000+01:00</DataOraRicezione>
  <ListaErrori>${errors.map(([c, d, s]) => `<Errore><Codice>${c}</Codice><Descrizione>${d}</Descrizione>${s ? `<Suggerimento>${s}</Suggerimento>` : ""}</Errore>`).join("")}</ListaErrori>
  <MessageId>99</MessageId>
</ns3:${root}>`;

const invoice = readFileSync(new URL("./examples/fatturapa-invoice.xml", import.meta.url), "utf8");
// The clean example with the buyer's partita IVA's last digit changed: fails the check digit.
function withBadBuyerVat(xml) {
  const m = /(<CessionarioCommittente>[\s\S]*?<IdCodice>)(\d{11})(<\/IdCodice>)/.exec(xml);
  assert.ok(m, "example has a buyer IdCodice");
  const bad = m[2].slice(0, 10) + String((Number(m[2][10]) + 1) % 10);
  return xml.replace(m[0], m[1] + bad + m[3]);
}

test("recognises both namespaces and every receipt root, and nothing else", () => {
  assert.ok(looksLikeSdiReceipt(ns([["00002", "Nome file duplicato"]])));
  assert.ok(looksLikeSdiReceipt(ns([["00100", "x"]], { root: "NotificaScarto", space: PA })));
  assert.ok(!looksLikeSdiReceipt(invoice));
  assert.ok(!looksLikeSdiReceipt("<Invoice><RicevutaScarto/></Invoice>"));
});

test("a rejection: each code explained from specification 1.9, tax numbers withheld", () => {
  const r = readSdiReceipt(ns([["00305", "1.4.1.1.2 IdCodice non valido : 09876543210&#13;", "Verificare la partita IVA"]]));
  assert.equal(r.type, "NS");
  assert.equal(r.errors[0].description, "1.4.1.1.2 IdCodice non valido : [number withheld]");
  const [f] = receiptFindings(r, null);
  assert.equal(f.rule, "SDI-00305");
  assert.match(f.message, /buyer's VAT number/);
  assert.match(f.fix, /SdI suggests: "Verificare la partita IVA"/);
  assert.match(f.fix, /in part .*IT-003, INV-023/);
  assert.ok(!/09876543210/.test(JSON.stringify(f)));
});

test("transport, signature and register codes say why no file-only check sees them", () => {
  const [sig] = receiptFindings(readSdiReceipt(ns([["00102", "firma non valida"]])), null);
  assert.match(sig.fix, /file name, size, compression or signature/);
  const [dup] = receiptFindings(readSdiReceipt(ns([["00404", "Fattura duplicata"]])), null);
  assert.match(dup.fix, /tax register|own records/);
  const [unknown] = receiptFindings(readSdiReceipt(ns([["00999", "?"]])), null);
  assert.match(unknown.message, /not in specification 1.9's control list/);
});

test("every code in the table names its offline status, and offline codes name a rule", () => {
  for (const [code, c] of Object.entries(SDI_CODES)) {
    assert.match(code, /^\d{5}$/);
    assert.ok(["yes", "partly", "no"].includes(c.offline), code);
    if (c.offline !== "no") assert.ok(c.rules.length > 0, code);
  }
});

test("paired with the invoice: SdI's 00305 is reproduced by the buyer's check digit (IT-003)", async () => {
  const bad = withBadBuyerVat(invoice);
  assert.ok(checkFatturaPa(bad).findings.some((f) => f.rule === "IT-003" && f.sdi === "00305"));
  const out = await preflightDocuments([
    { name: "IT01234567890_00001_NS_001.xml", source: ns([["00305", "IdCodice non valido"]], { hash: sha256Hex(bad) }) },
    { name: "IT01234567890_00001.xml", source: bad },
  ]);
  const rep = out.reports.find((r) => r.receipt);
  assert.equal(rep.receipt.pairedBy, "hash");
  const f = rep.errors.find((e) => e.rule === "SDI-00305");
  assert.equal(f.reproduced, true);
  assert.match(f.fix, /raises it too \(IT-003\)/);
  assert.ok(rep.errors.some((e) => e.rule === "SDI-HASH" && e.severity === "information"));
});

test("paired by name only, with a different hash: a warning, and an unreproduced register code says so", async () => {
  const out = await preflightDocuments([
    { name: "IT01234567890_00001_NS_001.xml", source: ns([["00305", "IdCodice non valido"]], { hash: "0".repeat(64) }) },
    { name: "IT01234567890_00001.xml", source: invoice },
  ]);
  const rep = out.reports.find((r) => r.receipt);
  assert.equal(rep.receipt.pairedBy, "name");
  const f = rep.errors.find((e) => e.rule === "SDI-00305");
  assert.equal(f.reproduced, false);
  assert.match(f.fix, /passes its check digit, so the fault is one only the register shows/);
  assert.ok(rep.errors.some((e) => e.rule === "SDI-HASH" && e.severity === "warning"));
});

test("an offline code SdI raised that this checker misses is reported as a miss", () => {
  const r = readSdiReceipt(ns([["00428", "FormatoTrasmissione non coerente"]]));
  const [f] = receiptFindings(r, { name: "a.xml", by: "hash", digest: "", findings: [] });
  assert.equal(f.reproduced, false);
  assert.match(f.fix, /does not raise it, though the check is offline/);
});

test("delivery, could-not-deliver, outcome and deadline notices", () => {
  const rc = readSdiReceipt(`<ns3:RicevutaConsegna xmlns:ns3="${B2B}" versione="1.0"><IdentificativoSdI>1</IdentificativoSdI><NomeFile>a.xml</NomeFile><DataOraRicezione>2026-01-01T10:00:00</DataOraRicezione><DataOraConsegna>2026-01-01T10:01:00</DataOraConsegna><Destinatario><Codice>ABC1234</Codice><Descrizione>x</Descrizione></Destinatario><MessageId>2</MessageId></ns3:RicevutaConsegna>`);
  assert.equal(rc.type, "RC");
  assert.equal(rc.delivered, "2026-01-01T10:01:00");
  assert.deepEqual(receiptFindings(rc, null), []);
  const mc = readSdiReceipt(`<ns3:RicevutaImpossibilitaRecapito xmlns:ns3="${B2B}"><IdentificativoSdI>1</IdentificativoSdI><NomeFile>a.xml</NomeFile><DataMessaADisposizione>2026-01-02</DataMessaADisposizione><MessageId>2</MessageId></ns3:RicevutaImpossibilitaRecapito>`);
  assert.equal(mc.type, "MC");
  assert.equal(mc.availableFrom, "2026-01-02");
  const ne = readSdiReceipt(`<ns3:NotificaEsito xmlns:ns3="${PA}"><IdentificativoSdI>1</IdentificativoSdI><NomeFile>a.xml</NomeFile><EsitoCommittente><IdentificativoSdI>1</IdentificativoSdI><RiferimentoFattura><NumeroFattura>7</NumeroFattura><AnnoFattura>2026</AnnoFattura></RiferimentoFattura><Esito>EC02</Esito><Descrizione>CIG assente</Descrizione></EsitoCommittente><MessageId>2</MessageId></ns3:NotificaEsito>`);
  const [refused] = receiptFindings(ne, null);
  assert.equal(refused.rule, "SDI-EC02");
  assert.match(refused.message, /refused the invoice 7 of 2026 \(EC02\): "CIG assente"/);
  const dt = readSdiReceipt(`<types:NotificaDecorrenzaTermini xmlns:types="${PA}"><IdentificativoSdI>1</IdentificativoSdI><NomeFile>a.xml</NomeFile><MessageId>2</MessageId></types:NotificaDecorrenzaTermini>`);
  assert.equal(dt.type, "DT");
});

test("the transmitter's tax id: a failed check digit is SdI's 00300 (IT-034); a valid one passes", () => {
  const m = /(<IdTrasmittente>[\s\S]*?<IdCodice>)([^<]+)(<\/IdCodice>)/.exec(invoice);
  assert.ok(m);
  assert.ok(!checkFatturaPa(invoice).findings.some((f) => f.rule === "IT-034"));
  const bad = invoice.replace(m[0], m[1] + "01234567891" + m[3]);
  const f = checkFatturaPa(bad).findings.find((x) => x.rule === "IT-034");
  assert.equal(f.sdi, "00300");
});

test("withhold keeps short codes and decodes character references", () => {
  assert.equal(withhold("errore 00305 &amp; 12345678"), "errore 00305 & [number withheld]");
});
