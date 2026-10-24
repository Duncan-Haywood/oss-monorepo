import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFatturaPa, codiceFiscaleValid, looksLikeFatturaPa, partitaIvaValid } from "./fatturapa.mjs";
import { preflightDocuments } from "./report.mjs";

const clean = readFileSync(new URL("./examples/fatturapa-invoice.xml", import.meta.url), "utf8");
const rules = (xml) => checkFatturaPa(xml).findings.map((f) => f.rule).sort();

test("check digits", () => {
  assert.ok(partitaIvaValid("12345678903"));
  assert.ok(partitaIvaValid("01234567897"));
  assert.ok(!partitaIvaValid("12345678904"));
  assert.ok(codiceFiscaleValid("RSSMRA85T10A562S"));
  assert.ok(!codiceFiscaleValid("RSSMRA85T10A562T"));
  assert.ok(codiceFiscaleValid("12345678903"));
});

test("the clean example passes and is recognised", () => {
  assert.ok(looksLikeFatturaPa(clean));
  assert.deepEqual(checkFatturaPa(clean).findings, []);
});

test("planted defects are each found", () => {
  const bad = clean
    .replace("<CodiceDestinatario>ABCDEF1", "<CodiceDestinatario>ABC")
    .replace("<IdCodice>12345678903</IdCodice></IdFiscaleIVA>", "<IdCodice>12345678904</IdCodice></IdFiscaleIVA>")
    .replace("<RegimeFiscale>RF01", "<RegimeFiscale>RF03")
    .replace("<Natura>N2.2</Natura></DettaglioLinee>", "</DettaglioLinee>")
    .replace("<PrezzoTotale>1000.00", "<PrezzoTotale>900.00")
    .replace("<Imposta>220.00", "<Imposta>200.00");
  const found = rules(bad);
  for (const r of ["IT-002", "IT-003", "IT-006", "IT-011", "IT-012", "IT-014", "IT-015", "IT-016"]) {
    assert.ok(found.includes(r), `${r} in ${found}`);
  }
});

test("findings never echo the tax number", () => {
  const bad = clean.replace("<IdCodice>12345678903</IdCodice></IdFiscaleIVA>", "<IdCodice>12345678904</IdCodice></IdFiscaleIVA>");
  assert.ok(!JSON.stringify(checkFatturaPa(bad)).includes("12345678904"));
});

test("a rounding or cassa line skips the totals check instead of guessing", () => {
  const withBollo = clean.replace("<ImportoTotaleDocumento>", "<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo><ImportoTotaleDocumento>");
  const result = checkFatturaPa(withBollo);
  assert.deepEqual(result.findings, []);
  assert.equal(result.skipped.length, 1);
});

test("preflightDocuments routes FatturaPA to its own rules", async () => {
  const { reports, readErrors } = await preflightDocuments([{ name: "IT123_00001.xml", source: clean }]);
  assert.equal(readErrors.length, 0);
  assert.equal(reports[0].errors.length, 0);
  assert.match(reports[0].envelope, /FatturaPA/);
});

test("examples/fatturapa-invoice-with-defects.xml is the planted-defect file, pinned rule by rule", () => {
  const bad = readFileSync(new URL("./examples/fatturapa-invoice-with-defects.xml", import.meta.url), "utf8");
  assert.ok(looksLikeFatturaPa(bad));
  assert.deepEqual([...new Set(rules(bad))], ["IT-002", "IT-003", "IT-006", "IT-011", "IT-012", "IT-014", "IT-015", "IT-016"]);
});

test("IT-018 flags elements out of schema order, once per block", () => {
  const swapped = clean.replace(/(<Divisa>[^<]*<\/Divisa>)(<Data>[^<]*<\/Data>)/, "$2$1");
  assert.notEqual(swapped, clean);
  const f = checkFatturaPa(swapped).findings.filter((x) => x.rule === "IT-018");
  assert.equal(f.length, 1);
  assert.match(f[0].path, /DatiGeneraliDocumento\/Divisa$/);
  assert.deepEqual(rules(clean).filter((r) => r === "IT-018"), []);
});
