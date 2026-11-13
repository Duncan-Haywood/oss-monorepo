import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkDsf, looksLikeDsf, tomCity, signatureString } from "./dsf.mjs";
import { sha1Hex } from "./sha1.mjs";
import { parseCfdiXml } from "./cfdi-xml.mjs";
import { looksLikeAbrasf } from "./abrasf.mjs";
import { preflightDocuments } from "./report.mjs";

const fixture = readFileSync(new URL("./fixtures/dsf-lote-rps.xml", import.meta.url), "utf8");
const rules = (text) => checkDsf(text).findings.map((f) => f.rule);
// Change one RPS value and re-sign every RPS, so only the rule under test fires.
function resign(text) {
  const doc = parseCfdiXml(text).root;
  const rps = doc.children.find((c) => c.name === "Lote").children.filter((c) => c.name === "RPS");
  let i = 0;
  return text.replace(/<Assinatura>[^<]*<\/Assinatura>/g, () => `<Assinatura>${sha1Hex(signatureString(rps[i++]))}</Assinatura>`);
}

test("sha1Hex matches node:crypto, including non-ASCII and block edges", () => {
  for (let n = 0; n < 140; n++) {
    const s = "Sé".repeat(n % 9) + "x".repeat(n);
    assert.equal(sha1Hex(s), createHash("sha1").update(s).digest("hex"));
  }
});

test("the Assinatura string reproduces a signature published in DSF's own sample", () => {
  // EnvioAssinado02.xml, RPS 2: 180.00 of services with a 10% deduction left at ValorDeduzir 0.00.
  assert.equal(sha1Hex("00000871834" + "NF   " + "000000000002" + "20091001" + "T " + "N" + "N" + "000000000016200" + "000000000001800" + "0431340000" + "00000000000191"), "fe694570a1fa918257114a42b346a699fcd2c418");
});

test("the synthetic batch is clean and read as DSF, not ABRASF", () => {
  assert.ok(looksLikeDsf(fixture));
  assert.ok(!looksLikeAbrasf(fixture));
  const r = checkDsf(fixture);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.root, "ReqEnvioLoteRPS");
  assert.equal(r.meta.version, "ISSDSF 1.00");
  assert.equal(r.meta.rps, 2);
  assert.ok(r.skipped.some((s) => /Campo Grande\/MS \(IBGE 5002704\)/.test(s)));
});

test("a value edited after signing breaks the Assinatura (DSF-010)", () => {
  const edited = fixture.replace("<ValorUnitario>1200.00</ValorUnitario>\n<ValorTotal>1200.00</ValorTotal>", "<ValorUnitario>1100.00</ValorUnitario>\n<ValorTotal>1100.00</ValorTotal>").replace("<ValorTotalServicos>2520.00", "<ValorTotalServicos>2420.00");
  const r = checkDsf(edited);
  assert.deepEqual(r.findings.map((f) => f.rule), ["DSF-010"]);
  assert.match(r.findings[0].message, /RPS NF 501/);
  assert.match(r.findings[0].path, /RPS\[1\]\/Assinatura$/);
  // Re-signed, it is clean again.
  assert.deepEqual(rules(resign(edited)), []);
});

test("the signature uses services less deductions, and the S/N of retained ISS", () => {
  const doc = parseCfdiXml(fixture).root;
  const [, second] = doc.children.find((c) => c.name === "Lote").children.filter((c) => c.name === "RPS");
  const s = signatureString(second);
  assert.equal(s.length, 11 + 5 + 12 + 8 + 2 + 1 + 1 + 15 + 15 + 10 + 14);
  assert.equal(s.slice(0, 11), "00001234567");
  assert.equal(s.slice(11, 16), "NF   ");
  assert.equal(s.slice(36, 38), "T ");
  assert.equal(s.slice(39, 40), "S"); // TipoRecolhimento R
  assert.equal(s.slice(40, 55), "000000000072000"); // 800.00 less 10%
  assert.equal(s.slice(55, 70), "000000000008000");
});

test("header totals: count, net services, deductions, dates (DSF-011..014)", () => {
  assert.deepEqual(rules(fixture.replace("<QtdRPS>2", "<QtdRPS>3")), ["DSF-011"]);
  const gross = checkDsf(fixture.replace("<ValorTotalServicos>2520.00", "<ValorTotalServicos>2600.00"));
  assert.deepEqual(gross.findings.map((f) => f.rule), ["DSF-012"]);
  assert.match(gross.findings[0].message, /= 2520\.00: the header holds the gross/);
  assert.deepEqual(rules(fixture.replace("<ValorTotalDeducoes>80.00", "<ValorTotalDeducoes>0.00")), ["DSF-013"]);
  assert.deepEqual(rules(fixture.replace("<dtInicio>2026-11-02", "<dtInicio>2026-11-03")), ["DSF-014"]);
  assert.deepEqual(rules(fixture.replace("<dtFim>2026-11-05", "<dtFim>2026-11-04")), ["DSF-014"]);
});

test("an item whose total is not quantity x unit price (DSF-015)", () => {
  const r = checkDsf(resign(fixture.replace("<Quantidade>4</Quantidade>", "<Quantidade>5</Quantidade>")));
  assert.deepEqual(r.findings.map((f) => f.rule), ["DSF-015"]);
  assert.match(r.findings[0].message, /5 x ValorUnitario 150\.00 = 750\.00/);
});

test("city codes: an IBGE code where DSF wants TOM is named with its TOM code (DSF-020)", () => {
  assert.deepEqual(tomCity("0009051"), { ibge: "5002704", name: "Campo Grande/MS" });
  assert.equal(tomCity("6291").name, "Campinas/SP");
  const head = checkDsf(fixture.replace("<CodCidade>9051", "<CodCidade>5002704"));
  assert.deepEqual(head.findings.map((f) => f.rule), ["DSF-020"]);
  assert.match(head.findings[0].message, /IBGE code of Campo Grande\/MS.*TOM \(SIAFI\) code, 9051/);
  const buyer = checkDsf(resign(fixture.replace("<CidadeTomador>0009051", "<CidadeTomador>5002704")));
  assert.deepEqual(buyer.findings.map((f) => f.rule), ["DSF-020"]);
  assert.match(buyer.findings[0].fix, /<CidadeTomador>0009051<\/CidadeTomador>/);
  assert.deepEqual(rules(resign(fixture.replace("<MunicipioPrestacao>0009051", "<MunicipioPrestacao>0001234"))), ["DSF-020"]);
});

test("a city listed on another system gets a note, not a finding", () => {
  const r = checkDsf(fixture.replace("<CodCidade>9051", "<CodCidade>6291"));
  assert.deepEqual(r.findings, []);
  assert.ok(r.skipped.some((s) => /Campinas\/SP .* runs ISSCampinas 2\.03 .* not DSF's system/.test(s)));
});

test("CPF and CNPJ check digits (DSF-021); zeros mean not identified", () => {
  assert.deepEqual(rules(fixture.replace("<CPFCNPJRemetente>12345678000195", "<CPFCNPJRemetente>12345678000194")), ["DSF-021"]);
  const r = checkDsf(resign(fixture.replace("<CPFCNPJTomador>98765432000198", "<CPFCNPJTomador>98765432000199")));
  assert.deepEqual(r.findings.map((f) => f.rule), ["DSF-021"]);
  assert.match(r.findings[0].fix, /part of the Assinatura/);
  assert.deepEqual(rules(resign(fixture.replace("<CPFCNPJTomador>98765432000198", "<CPFCNPJTomador>00000000000000"))), []);
});

test("a buyer abroad (CidadeTomador 0009999) needs DocTomadorEstrangeiro (DSF-022)", () => {
  const abroad = resign(fixture.replace("<CPFCNPJTomador>98765432000198", "<CPFCNPJTomador>77777777777").replace("<CidadeTomador>0009051", "<CidadeTomador>0009999"));
  const r = checkDsf(abroad);
  assert.deepEqual(r.findings.map((f) => f.rule), ["DSF-022"]);
  assert.ok(r.skipped.some((s) => /buyer is abroad/.test(s)));
  // With the document, after RazaoSocialTomador where the schema places it: clean.
  const withDoc = abroad.replace("<RazaoSocialTomador>CLIENTE EXEMPLO</RazaoSocialTomador>", "<RazaoSocialTomador>CLIENTE EXEMPLO</RazaoSocialTomador>\n<DocTomadorEstrangeiro>P1234567</DocTomadorEstrangeiro>");
  assert.deepEqual(rules(withDoc), []);
});

test("schema findings come out as DSF-002..006", () => {
  assert.deepEqual(rules(fixture.replace(/<MetodoEnvio>WS<\/MetodoEnvio>/, "")), ["DSF-004"]);
  assert.deepEqual(rules(fixture.replace("<MetodoEnvio>WS", "<MetodoEnvio>XX")), ["DSF-005"]);
  // An RPS element in the message's namespace instead of none: DSF-002.
  const r = checkDsf(fixture.replace("<Cabecalho>", '<Cabecalho xmlns="http://localhost:8080/WsNFe2/lote">'));
  assert.ok(r.findings.every((f) => f.rule === "DSF-002"));
  assert.ok(r.findings.length);
});

test("empty transacao takes the schema's default; text in an element-only type is refused", () => {
  assert.match(fixture, /<transacao><\/transacao>/);
  assert.deepEqual(rules(fixture.replace("<transacao></transacao>", "<transacao>talvez</transacao>")), ["DSF-005"]);
  const r = checkDsf(resign(fixture.replace("<Deducoes />", "<Deducoes>x</Deducoes>")));
  assert.deepEqual(r.findings.map((f) => f.rule), ["DSF-002"]);
  assert.match(r.findings[0].message, /holds text/);
});

test("libxml2's space rule: an unsignedInt with a space is reported, a union is trimmed", () => {
  const sp = checkDsf(fixture.replace("<CodCidade>9051", "<CodCidade> 9051"));
  assert.ok(sp.findings.some((f) => f.rule === "DSF-005" && /libxml2/.test(f.message)));
  assert.deepEqual(rules(fixture.replace("<DataEmissaoNFSeSubstituida>1900-01-01", "<DataEmissaoNFSeSubstituida> 1900-01-01")), []);
});

test("CodigoServico selects layout 1.01", () => {
  const v101 = fixture.replace(/<CodigoAtividade>620150100<\/CodigoAtividade>/g, "<CodigoAtividade>620150100</CodigoAtividade>\n<CodigoServico>0107</CodigoServico>");
  const r = checkDsf(v101);
  assert.equal(r.meta.version, "ISSDSF 1.01");
  assert.deepEqual(r.findings, []);
});

test("not XML, or no DSF message (DSF-001)", () => {
  assert.deepEqual(rules("<a><b></a"), ["DSF-001"]);
  assert.deepEqual(rules('<x xmlns="http://localhost:8080/WsNFe2/lote"/>'), ["DSF-001"]);
});

test("the report routes a DSF batch to its own check", async () => {
  const r = await preflightDocuments([{ name: "lote.xml", source: fixture }]);
  const one = r.reports[0];
  assert.ok(one, JSON.stringify(r).slice(0, 300));
  assert.match(one.envelope, /DSF's layout \(DSF 1\.00, ReqEnvioLoteRPS\).*a batch of 2 RPS/);
  assert.deepEqual(one.errors, []);
});
