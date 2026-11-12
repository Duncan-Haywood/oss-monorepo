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
  assert.deepEqual([...new Set(rules(bad))], ["IT-002", "IT-003", "IT-006", "IT-011", "IT-012", "IT-014", "IT-015", "IT-016", "IT-021", "IT-024"]);
});

test("IT-018 flags elements out of schema order, once per block", () => {
  const swapped = clean.replace(/(<Divisa>[^<]*<\/Divisa>)(<Data>[^<]*<\/Data>)/, "$2$1");
  assert.notEqual(swapped, clean);
  const f = checkFatturaPa(swapped).findings.filter((x) => x.rule === "IT-018");
  assert.equal(f.length, 1);
  assert.match(f[0].path, /DatiGeneraliDocumento\/Divisa$/);
  assert.deepEqual(rules(clean).filter((r) => r === "IT-018"), []);
});

test("IT-018 ranks ContattiTrasmittente before PECDestinatario, as the XSD does (the Agenzia's sample FPR02 has them the other way and fails xmllint)", () => {
  const a = clean.replace(/(<CodiceDestinatario>[^<]*<\/CodiceDestinatario>)/, "$1<PECDestinatario>x@pec.it</PECDestinatario><ContattiTrasmittente/>");
  assert.notEqual(a, clean);
  assert.deepEqual(rules(a).filter((r) => r === "IT-018"), ["IT-018"]);
  const ok = clean.replace(/(<CodiceDestinatario>[^<]*<\/CodiceDestinatario>)/, "$1<ContattiTrasmittente/><PECDestinatario>x@pec.it</PECDestinatario>");
  assert.deepEqual(rules(ok).filter((r) => /^IT-0(18|19|2)/.test(r)), []);
});

test("IT-019 names an element the schema does not allow in that block", () => {
  const f = checkFatturaPa(clean.replace("<Divisa>", "<Valuta>EUR</Valuta><Divisa>")).findings.filter((x) => x.rule === "IT-019");
  assert.equal(f.length, 1);
  assert.match(f[0].path, /DatiGeneraliDocumento\/Valuta$/);
});

test("IT-019 flags a second element where the schema allows one", () => {
  const f = checkFatturaPa(clean.replace(/(<Divisa>[^<]*<\/Divisa>)/, "$1$1")).findings.filter((x) => x.rule === "IT-019");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /more than once/);
});

test("IT-020 flags a required element that is missing", () => {
  const f = checkFatturaPa(clean.replace(/<Comune>[^<]*<\/Comune>/, "")).findings.filter((x) => x.rule === "IT-020");
  assert.ok(f.length >= 1);
  assert.match(f[0].message, /Comune is required/);
});

test("IT-021 catches a euro sign, an over-long text and an empty required value, without echoing them", () => {
  const euro = checkFatturaPa(clean.replace(/<Descrizione>[^<]*<\/Descrizione>/, "<Descrizione>Beratung \u20ac 100</Descrizione>")).findings.filter((x) => x.rule === "IT-021");
  assert.equal(euro.length, 1);
  assert.match(euro[0].message, /U\+20AC/);
  assert.ok(!JSON.stringify(euro).includes("Beratung"));
  const long = checkFatturaPa(clean.replace(/<Descrizione>[^<]*<\/Descrizione>/, `<Descrizione>${"x".repeat(1001)}</Descrizione>`)).findings.filter((x) => x.rule === "IT-021");
  assert.equal(long.length, 1);
  const empty = checkFatturaPa(clean.replace(/<Comune>[^<]*<\/Comune>/, "<Comune></Comune>")).findings.filter((x) => x.rule === "IT-021");
  assert.equal(empty.length, 1);
});

test("an empty Nazione takes the schema's default (IT) and is not a finding", () => {
  const r = checkFatturaPa(clean.replace(/<Nazione>IT<\/Nazione>/, "<Nazione></Nazione>"));
  assert.deepEqual(r.findings.filter((x) => x.rule === "IT-021"), []);
});

test("IT-022 flags a cut-off file", () => {
  const cut = clean.slice(0, clean.lastIndexOf("</p:FatturaElettronica>"));
  assert.deepEqual(rules(cut).filter((r) => r === "IT-022"), ["IT-022"]);
  assert.deepEqual(rules(clean).filter((r) => r === "IT-022"), []);
});

test("spec 1.9 codes TD29 and RF20 are known; TD29 needs an Italian seller (IT-023)", () => {
  const td29 = clean.replace(/<TipoDocumento>TD\d+/, "<TipoDocumento>TD29");
  assert.ok(!rules(td29).includes("IT-008"));
  assert.ok(!rules(td29).includes("IT-023"));
  assert.ok(!rules(clean.replace("<RegimeFiscale>RF01", "<RegimeFiscale>RF20")).includes("IT-006"));
  const foreign = td29.replace(/(<CedentePrestatore>[\s\S]*?<IdPaese>)IT/, "$1DE");
  assert.ok(rules(foreign).includes("IT-023"));
  assert.ok(!rules(clean.replace(/<TipoDocumento>TD\d+/, "<TipoDocumento>TD30")).includes("IT-023"));
});

test("codice fiscale: an O in an odd position weighs 11 (red team 2026-11-11: no test reached that table entry)", () => {
  // Check letter worked by hand from the Agenzia's odd-position table: R8 S18 O11 P15 L4 A0 ... = S.
  assert.ok(codiceFiscaleValid("RSOPLA80A01H501S"));
  assert.ok(!codiceFiscaleValid("RSOPLA80A01H501T"));
});

test("a date that does not exist (30 February) is refused, not rolled over to March", () => {
  const feb30 = clean.replace(/<Data>[^<]*<\/Data>/, "<Data>2026-02-30</Data>");
  assert.notEqual(feb30, clean);
  assert.ok(rules(feb30).includes("IT-009"));
  assert.ok(rules(feb30).includes("IT-021"));
  const leap = clean.replace(/<Data>[^<]*<\/Data>/, "<Data>2028-02-29</Data>");
  assert.deepEqual(rules(leap), []);
});

test("IT-024: lines at a rate and Natura with no DatiRiepilogo are flagged", () => {
  const missing = clean
    .replace(/<DatiRiepilogo><AliquotaIVA>0\.00.*?<\/DatiRiepilogo>/s, "")
    .replace(/<ImportoTotaleDocumento>[^<]*<\/ImportoTotaleDocumento>/, "");
  assert.notEqual(missing, clean);
  const f = checkFatturaPa(missing).findings.filter((x) => x.rule === "IT-024");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /0\.00 with Natura N2\.2/);
  assert.deepEqual(rules(clean).filter((r) => r === "IT-024"), []);
});

// Schema 1.2.3 (specification 1.9), read 2026-11-12 from a pinned copy (build-fatturapa-schema.mjs).
import schema from "./fatturapa-xsd-data.mjs";
import { codesFor } from "./fatturapa-xsd.mjs";
const schemaRules = (xml) => checkFatturaPa(xml).findings.filter((f) => /^IT-0(18|19|20|21|22)$/.test(f.rule));
const ritenuta = (tipo, causale) => `<DatiRitenuta><TipoRitenuta>${tipo}</TipoRitenuta><ImportoRitenuta>10.00</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>${causale}</CausalePagamento></DatiRitenuta>`;
const withRitenute = (...blocks) => clean.replace(/(<Numero>[^<]*<\/Numero>)/, `$1${blocks.join("")}`);
const pagamento = (mp) => clean.replace("</DatiBeniServizi>", `</DatiBeniServizi><DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>${mp}</ModalitaPagamento><ImportoPagamento>1320.00</ImportoPagamento></DettaglioPagamento></DatiPagamento>`);

test("the table is read from XSD 1.2.3 and its code lists are the ones the business rules use", () => {
  assert.equal(schema.version, "1.2.3");
  assert.deepEqual(codesFor("TipoDocumentoType").filter((c) => c < "TD10"), ["TD01", "TD02", "TD03", "TD04", "TD05", "TD06"]);
  assert.ok(codesFor("TipoDocumentoType").includes("TD29"));
  assert.ok(codesFor("RegimeFiscaleType").includes("RF20") && !codesFor("RegimeFiscaleType").includes("RF03"));
  assert.ok(schema.enums.NaturaType.includes("N2"), "the schema keeps N2 for old files");
  assert.ok(!codesFor("NaturaType").includes("N2") && !codesFor("NaturaType").includes("N6"), "its comments retire N2, N3, N6");
  assert.deepEqual(schema.retired.map((r) => r.code).sort(), ["N2", "N3", "N6", "Z"]);
});

test("TD07-TD09 are simplified-invoice codes, refused in a FatturaElettronica file (IT-008)", () => {
  for (const td of ["TD07", "TD08", "TD09"]) assert.ok(rules(clean.replace("<TipoDocumento>TD01", `<TipoDocumento>${td}`)).includes("IT-008"), td);
  assert.ok(!rules(clean.replace("<TipoDocumento>TD01", "<TipoDocumento>TD06")).includes("IT-008"));
});

test("1.2.3 allows several DatiRitenuta (withholding plus INPS); 1.2.1 allowed one", () => {
  assert.deepEqual(schemaRules(withRitenute(ritenuta("RT01", "A"), ritenuta("RT03", "A"))), []);
});

test("code lists 1.2.1 lacked are enforced: TipoRitenuta, CausalePagamento, ModalitaPagamento", () => {
  assert.deepEqual(schemaRules(withRitenute(ritenuta("RT06", "ZO"))), [], "RT06 and ZO are 1.2.3 codes");
  assert.deepEqual(schemaRules(pagamento("MP23")), [], "MP23 (PagoPA) is a 1.2.3 code");
  const rt = schemaRules(withRitenute(ritenuta("RT07", "A")));
  assert.equal(rt.length, 1);
  assert.match(rt[0].message, /TipoRitenuta is not one of RT01/);
  const mp = schemaRules(pagamento("MP24"));
  assert.equal(mp.length, 1);
  assert.match(mp[0].path, /ModalitaPagamento$/);
});

test("a code the schema keeps but retires is refused with its date: CausalePagamento Z, Natura N2", () => {
  const z = schemaRules(withRitenute(ritenuta("RT01", "Z")));
  assert.equal(z.length, 1);
  assert.match(z[0].message, /no longer valid for invoices issued from 2021-01-01/);
  assert.ok(!z[0].message.includes("Z,"), "the suggested list leaves Z out");
  const n2 = clean.replace(/<Natura>N2\.2<\/Natura>/g, "<Natura>N2</Natura>");
  assert.ok(rules(n2).includes("IT-011"));
  assert.ok(!schemaRules(n2).length, "the XSD itself still accepts N2, so only IT-011 speaks");
});

test("1.2.3 makes ImportoBollo optional (bollo virtuale with the amount left to SdI)", () => {
  const bollo = clean.replace(/(<Numero>[^<]*<\/Numero>)/, "$1<DatiBollo><BolloVirtuale>SI</BolloVirtuale></DatiBollo>");
  assert.deepEqual(schemaRules(bollo), []);
});
