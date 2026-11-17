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
  // The 0% line without Natura is SdI's 00400 (IT-011); its rate has a summary, so no 00443/00444 (IT-024).
  assert.deepEqual([...new Set(rules(bad))], ["IT-002", "IT-003", "IT-006", "IT-011", "IT-012", "IT-014", "IT-015", "IT-016", "IT-021"]);
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
  // A past leap day (a future one would now draw 00403, dated after receipt).
  const leap = clean.replace(/<Data>[^<]*<\/Data>/, "<Data>2024-02-29</Data>");
  assert.deepEqual(rules(leap), []);
});

test("IT-024: a line rate or Natura with no DatiRiepilogo is flagged (SdI 00443, 00444)", () => {
  const missing = clean
    .replace(/<DatiRiepilogo><AliquotaIVA>0\.00.*?<\/DatiRiepilogo>/s, "")
    .replace(/<ImportoTotaleDocumento>[^<]*<\/ImportoTotaleDocumento>/, "");
  assert.notEqual(missing, clean);
  const f = checkFatturaPa(missing).findings.filter((x) => x.rule === "IT-024");
  // SdI checks the rates (00443) and the Natura codes (00444) as two separate sets.
  assert.deepEqual(f.map((x) => x.sdi), ["00443", "00444"]);
  assert.match(f[0].message, /AliquotaIVA 0\.00/);
  assert.match(f[1].message, /Natura N2\.2/);
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

// Specification 1.9 (Allegato A, Agenzia delle Entrate, read 2026-11-13): tolerances and
// SdI error codes. eval/sdi-error-codes-2026-11-13.md lists every code and what covers it.
const sdiOf = (xml, rule) => checkFatturaPa(xml).findings.filter((f) => f.rule === rule).map((f) => f.sdi || null);
const blocking = (xml) => checkFatturaPa(xml).findings.filter((f) => f.severity !== "warning").map((f) => f.rule).sort();
const withLine1 = (xml, total, base, tax, docTotal) => xml
  .replace("<PrezzoTotale>1000.00", `<PrezzoTotale>${total}`)
  .replace("<ImponibileImporto>1000.00", `<ImponibileImporto>${base}`)
  .replace("<Imposta>220.00", `<Imposta>${tax}`)
  .replace("<ImportoTotaleDocumento>1320.00", `<ImportoTotaleDocumento>${docTotal}`);

test("00421: Imposta is checked against the rate times the base rounded half up, then one cent", () => {
  // 22% of 0.25 is 0.055, which rounds half up to 0.06. 0.07 is one cent off: accepted.
  // The old check compared against the unrounded 0.055 and flagged 0.07 (1.5 cents).
  const line = clean.replace("<Quantita>10.00</Quantita><PrezzoUnitario>100.00</PrezzoUnitario>", "<Quantita>1.00</Quantita><PrezzoUnitario>0.25</PrezzoUnitario>");
  assert.deepEqual(sdiOf(withLine1(line, "0.25", "0.25", "0.07", "100.32"), "IT-014"), []);
  assert.deepEqual(sdiOf(withLine1(line, "0.25", "0.25", "0.06", "100.31"), "IT-014"), []);
  assert.deepEqual(sdiOf(withLine1(line, "0.25", "0.25", "0.04", "100.29"), "IT-014"), ["00421"]);
  assert.deepEqual(sdiOf(withLine1(line, "0.25", "0.25", "0.08", "100.33"), "IT-014"), ["00421"]);
});

test("00422: a summary base within one euro of its lines is a warning, past one euro a rejection", () => {
  const cents50 = withLine1(clean, "1000.00", "1000.50", "220.11", "1320.61");
  assert.deepEqual(blocking(cents50), []);
  const w = checkFatturaPa(cents50).findings.filter((f) => f.rule === "IT-025");
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, "warning");
  assert.equal(w[0].sdi, "00422");
  assert.match(w[0].message, /0\.50/);
  // Exactly one euro is still inside the tolerance; 1.01 is not.
  assert.deepEqual(sdiOf(withLine1(clean, "1000.00", "1001.00", "220.22", "1321.22"), "IT-015"), []);
  assert.deepEqual(sdiOf(withLine1(clean, "1000.00", "1001.01", "220.22", "1321.23"), "IT-015"), ["00422"]);
});

test("00422: Arrotondamento and pension-fund contributions are part of the base, not a reason to skip", () => {
  // 22% base is 1000 of lines + 40 of cassa: summary at 1040.00 passes, 1000.00 is 40 euro short.
  const cassa = "<DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>40.00</ImportoContributoCassa><ImponibileCassa>1000.00</ImponibileCassa><AliquotaIVA>22.00</AliquotaIVA></DatiCassaPrevidenziale>";
  const withCassa = clean.replace("<ImportoTotaleDocumento>", `${cassa}<ImportoTotaleDocumento>`);
  assert.deepEqual(sdiOf(withCassa, "IT-015"), ["00422"]);
  const fixed = withCassa.replace("<ImponibileImporto>1000.00", "<ImponibileImporto>1040.00").replace("<Imposta>220.00", "<Imposta>228.80");
  assert.deepEqual(blocking(fixed), []);
  // A rounding line of 3 euro on the summary: base 1003.00 = 1000 + 3 passes; without it, a rejection.
  const rounded = clean.replace("<ImponibileImporto>1000.00", "<Arrotondamento>3.00</Arrotondamento><ImponibileImporto>1003.00").replace("<Imposta>220.00", "<Imposta>220.66");
  assert.deepEqual(blocking(rounded), []);
  assert.deepEqual(sdiOf(rounded.replace("<Arrotondamento>3.00</Arrotondamento>", ""), "IT-015"), ["00422"]);
});

test("00422 sums by AliquotaIVA, not by Natura: two 0% summaries share one sum", () => {
  // Lines: 100 at N2.2. Summaries: 60 at N2.2 and 40 at N3.1 (no line) -> 100 at 0.00: SdI accepts.
  const split = clean.replace(/<DatiRiepilogo><AliquotaIVA>0\.00.*?<\/DatiRiepilogo>/s,
    "<DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura><ImponibileImporto>60.00</ImponibileImporto><Imposta>0.00</Imposta><RiferimentoNormativo>x</RiferimentoNormativo></DatiRiepilogo>"
    + "<DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N3.1</Natura><ImponibileImporto>40.00</ImponibileImporto><Imposta>0.00</Imposta><RiferimentoNormativo>x</RiferimentoNormativo></DatiRiepilogo>");
  assert.deepEqual(rules(split), []);
});

test("SdI has no check on ImportoTotaleDocumento: IT-016 is a warning", () => {
  const off = clean.replace("<ImportoTotaleDocumento>1320.00", "<ImportoTotaleDocumento>1300.00");
  const f = checkFatturaPa(off).findings;
  assert.deepEqual(f.map((x) => [x.rule, x.severity]), [["IT-016", "warning"]]);
  assert.equal(f[0].sdi, undefined);
});

test("Natura on a taxed line or summary is allowed in a TD16 only (00401, 00430)", () => {
  const taxedWithNature = clean.replace("<AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>", "<AliquotaIVA>22.00</AliquotaIVA><Natura>N6.3</Natura></DettaglioLinee>")
    .replace("<AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>", "<AliquotaIVA>22.00</AliquotaIVA><Natura>N6.3</Natura><ImponibileImporto>");
  assert.deepEqual(sdiOf(taxedWithNature, "IT-011"), ["00401", "00430"]);
  assert.deepEqual(sdiOf(taxedWithNature.replace("<TipoDocumento>TD01", "<TipoDocumento>TD16"), "IT-011"), []);
  const zeroSummary = clean.replace("<AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura><ImponibileImporto>", "<AliquotaIVA>0.00</AliquotaIVA><ImponibileImporto>");
  assert.ok(sdiOf(zeroSummary, "IT-011").includes("00429"));
});

test("00420: reverse charge (N6.x) with split payment (S) is refused", () => {
  const n6 = clean.replace(/<Natura>N2\.2<\/Natura>/g, "<Natura>N6.3</Natura>")
    .replace("<RiferimentoNormativo>", "<EsigibilitaIVA>S</EsigibilitaIVA><RiferimentoNormativo>");
  assert.deepEqual(sdiOf(n6, "IT-026"), ["00420"]);
  assert.deepEqual(sdiOf(n6.replace("<EsigibilitaIVA>S</EsigibilitaIVA>", "<EsigibilitaIVA>I</EsigibilitaIVA>"), "IT-026"), []);
});

test("Ritenuta SI without DatiRitenuta (00411 line, 00415 cassa); with it, clean", () => {
  const line = clean.replace("<AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>", "<AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DettaglioLinee>");
  assert.deepEqual(sdiOf(line, "IT-027"), ["00411"]);
  const withRit = line.replace("<ImportoTotaleDocumento>", `${ritenuta("RT01", "A")}<ImportoTotaleDocumento>`);
  assert.deepEqual(sdiOf(withRit, "IT-027"), []);
  const cassa = clean.replace("<ImportoTotaleDocumento>", "<DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>40.00</ImportoContributoCassa><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DatiCassaPrevidenziale><ImportoTotaleDocumento>");
  assert.deepEqual(sdiOf(cassa, "IT-027"), ["00415"]);
});

test("a cassa at 0% needs a Natura (00413), a taxed one may not have one (00414), and its rate needs a summary (00443)", () => {
  const cassa = (rate, nature) => clean.replace("<ImportoTotaleDocumento>", `<DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>40.00</ImportoContributoCassa><AliquotaIVA>${rate}</AliquotaIVA>${nature ? `<Natura>${nature}</Natura>` : ""}</DatiCassaPrevidenziale><ImportoTotaleDocumento>`);
  assert.ok(sdiOf(cassa("0.00", ""), "IT-011").includes("00413"));
  assert.ok(sdiOf(cassa("22.00", "N4"), "IT-011").includes("00414"));
  assert.deepEqual(sdiOf(cassa("10.00", ""), "IT-024"), ["00443"]);
  assert.deepEqual(sdiOf(cassa("0.00", "N4"), "IT-024"), ["00444"]);
});

test("ScontoMaggiorazione with a Tipo needs a Percentuale or an Importo (00437 document, 00438 line)", () => {
  const line = clean.replace("<PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>1000.00", "<PrezzoUnitario>100.00</PrezzoUnitario><ScontoMaggiorazione><Tipo>SC</Tipo></ScontoMaggiorazione><PrezzoTotale>1000.00");
  assert.deepEqual(sdiOf(line, "IT-028"), ["00438"]);
  const doc = clean.replace("<ImportoTotaleDocumento>", "<ScontoMaggiorazione><Tipo>SC</Tipo></ScontoMaggiorazione><ImportoTotaleDocumento>");
  assert.deepEqual(sdiOf(doc, "IT-028"), ["00437"]);
  assert.deepEqual(sdiOf(doc.replace("<Tipo>SC</Tipo>", "<Tipo>SC</Tipo><Importo>5.00</Importo>"), "IT-028"), []);
});

test("00418: a linked invoice dated after the document", () => {
  const linked = (d) => clean.replace("</DatiGeneraliDocumento>", `</DatiGeneraliDocumento><DatiFattureCollegate><IdDocumento>2026/000</IdDocumento><Data>${d}</Data></DatiFattureCollegate>`);
  assert.deepEqual(sdiOf(linked("2026-10-02"), "IT-033"), ["00418"]);
  assert.deepEqual(sdiOf(linked("2026-10-01"), "IT-033"), []);
  assert.deepEqual(sdiOf(linked("2026-09-30"), "IT-033"), []);
});

test("document-type rules: 00473, 00475, 00471, 00472, 00474", () => {
  const seller = '<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678903</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Esempio Servizi';
  const foreignSeller = clean.replace(seller, seller.replace("<IdPaese>IT</IdPaese><IdCodice>12345678903", "<IdPaese>DE</IdPaese><IdCodice>123456789"));
  // TD17 (reverse charge on services bought abroad): an Italian seller is refused, a German one is not.
  assert.deepEqual(sdiOf(clean.replace("<TipoDocumento>TD01", "<TipoDocumento>TD17"), "IT-023"), ["00473"]);
  assert.deepEqual(sdiOf(foreignSeller.replace("<TipoDocumento>TD01", "<TipoDocumento>TD17"), "IT-023"), []);
  // TD17 needs the buyer's IdFiscaleIVA (00475).
  const cfBuyer = foreignSeller.replace("<TipoDocumento>TD01", "<TipoDocumento>TD17")
    .replace("<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567897</IdCodice></IdFiscaleIVA>", "<CodiceFiscale>RSSMRA85T10A562S</CodiceFiscale>");
  assert.deepEqual(sdiOf(cfBuyer, "IT-029"), ["00475"]);
  // Same subject on both sides: a TD01 is refused (00471), a TD27 needs it (00472).
  const self = clean.replace("<IdCodice>01234567897</IdCodice>", "<IdCodice>12345678903</IdCodice>");
  assert.deepEqual(sdiOf(self, "IT-031"), ["00471"]);
  assert.deepEqual(sdiOf(self.replace("<TipoDocumento>TD01", "<TipoDocumento>TD27"), "IT-031"), []);
  assert.deepEqual(sdiOf(clean.replace("<TipoDocumento>TD01", "<TipoDocumento>TD27"), "IT-031"), ["00472"]);
  // TD21 (plafond self-invoice): every line must charge VAT (00474).
  assert.deepEqual(sdiOf(self.replace("<TipoDocumento>TD01", "<TipoDocumento>TD21"), "IT-032"), ["00474"]);
});

test("header rules: 00313, 00330, 00427, 00428, 00476", () => {
  assert.deepEqual(sdiOf(clean.replace("<CodiceDestinatario>ABCDEF1", "<CodiceDestinatario>XXXXXXX"), "IT-002"), ["00313"]);
  assert.deepEqual(sdiOf(clean.replace("</CodiceDestinatario>", "</CodiceDestinatario><PECDestinatario>sdi01@pec.fatturapa.it</PECDestinatario>"), "IT-002"), ["00330"]);
  assert.deepEqual(sdiOf(clean.replace("</CodiceDestinatario>", "</CodiceDestinatario><PECDestinatario>fatture@pec.cliente.it</PECDestinatario>"), "IT-002"), []);
  assert.deepEqual(sdiOf(clean.replace("<CodiceDestinatario>ABCDEF1", "<CodiceDestinatario>ABCDEF"), "IT-002"), ["00427"]);
  assert.deepEqual(sdiOf(clean.replace("<FormatoTrasmissione>FPR12", "<FormatoTrasmissione>FPA12"), "IT-001"), ["00428"]);
  const bothForeign = clean.replace(/<IdPaese>IT<\/IdPaese><IdCodice>12345678903<\/IdCodice><\/IdFiscaleIVA>\n        <Anagrafica><Denominazione>Esempio/, "<IdPaese>DE</IdPaese><IdCodice>123456789</IdCodice></IdFiscaleIVA>\n        <Anagrafica><Denominazione>Esempio")
    .replace("<IdPaese>IT</IdPaese><IdCodice>01234567897", "<IdPaese>FR</IdPaese><IdCodice>12345678901");
  assert.deepEqual(sdiOf(bothForeign, "IT-030"), ["00476"]);
});

test("00403: an invoice dated after today (Italian time) is refused", () => {
  assert.deepEqual(sdiOf(clean.replace("<Data>2026-10-01</Data>", "<Data>2099-01-01</Data>"), "IT-009"), ["00403"]);
  assert.deepEqual(sdiOf(clean, "IT-009"), []);
});
