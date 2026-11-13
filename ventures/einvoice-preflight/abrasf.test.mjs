import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAbrasf, looksLikeAbrasf, municipioProblem, ibgeCheckDigit } from "./abrasf.mjs";
import { CHECK_DIGIT_EXCEPTIONS, COUNT } from "./ibge-municipios-data.mjs";
import { rootsOf, VERSIONS } from "./abrasf-xsd.mjs";
import { preflightDocuments } from "./report.mjs";

const rps = readFileSync(new URL("./fixtures/abrasf-gerar-nfse-204.xml", import.meta.url), "utf8");
const nfse = readFileSync(new URL("./fixtures/abrasf-compnfse-204.xml", import.meta.url), "utf8");
const rules = (text) => checkAbrasf(text).findings.map((f) => f.rule);
const swap = (from, to, base = nfse) => { assert.ok(base.includes(from), from); return base.replace(from, to); };

test("both made-up files are clean (both validated by xmllint against nfse_v204.xsd)", () => {
  assert.deepEqual(checkAbrasf(nfse), { findings: [], skipped: [], meta: checkAbrasf(nfse).meta });
  const m = checkAbrasf(nfse).meta;
  assert.equal(m.root, "CompNfse");
  assert.equal(m.version, "2.04");
  assert.equal(m.issued, true);
  const r = checkAbrasf(rps);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /states none \(no versao\); checked against ABRASF 2\.04/);
  assert.ok(looksLikeAbrasf(rps) && looksLikeAbrasf(nfse));
  assert.ok(!looksLikeAbrasf('<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"/>'));
});

test("both layouts are compiled with their document elements", () => {
  assert.deepEqual(VERSIONS, ["2.00", "2.01", "2.02", "2.03", "2.04"]);
  for (const v of VERSIONS) for (const r of ["GerarNfseEnvio", "EnviarLoteRpsEnvio", "CompNfse", "ConsultarNfseRpsResposta"]) assert.ok(rootsOf(v).includes(r), `${v} ${r}`);
});

test("schema layer: unknown, missing, out-of-order elements, bad values, attributes", () => {
  assert.deepEqual(rules(swap("<Numero>77</Numero>", "<Numero>77</Numero><Nota>x</Nota>")), ["ABR-002"]);
  assert.deepEqual(rules(swap("<CodigoVerificacao>AB12CD34</CodigoVerificacao>", "")), ["ABR-004"]);
  const order = swap("<Numero>77</Numero>\n      <CodigoVerificacao>AB12CD34</CodigoVerificacao>", "<CodigoVerificacao>AB12CD34</CodigoVerificacao><Numero>77</Numero>");
  assert.deepEqual(rules(order), ["ABR-003"]);
  assert.deepEqual(rules(swap("<ItemListaServico>01.07</ItemListaServico>", "<ItemListaServico>1.07</ItemListaServico>")), ["ABR-005"]);
  assert.deepEqual(rules(swap("<Aliquota>5.00</Aliquota>\n        <ValorIss>42.50", "<Aliquota>5,00</Aliquota>\n        <ValorIss>42.50")), ["ABR-005"]);
  assert.deepEqual(rules(swap('<Nfse versao="2.04">', '<Nfse versao="2.04" lote="1">')), ["ABR-006"]);
  // A space around an xs:date: XSD trims it, libxml2 (xmllint, PHP) does not.
  const f = checkAbrasf(swap("<Competencia>2026-11-10</Competencia>", "<Competencia> 2026-11-10</Competencia>")).findings;
  assert.deepEqual(f.map((x) => x.rule), ["ABR-005"]);
  assert.match(f[0].message, /libxml2/);
});

test("a dropped or mistyped namespace is named, and values are still checked", () => {
  const typo = swap('xmlns="http://www.abrasf.org.br/nfse.xsd"', 'xmlns="http:/www.abrasf.org.br/nfse.xsd"');
  assert.ok(looksLikeAbrasf(typo));
  const r = checkAbrasf(typo);
  assert.deepEqual(r.findings.map((x) => x.rule), ["ABR-002"]);
  assert.match(r.findings[0].message, /not in the ABRASF namespace.*http:\/www/);
  const bad = checkAbrasf(swap("<BaseCalculo>850.00</BaseCalculo>", "<BaseCalculo>900.00</BaseCalculo>", typo));
  assert.deepEqual(bad.findings.map((x) => x.rule), ["ABR-002", "ABR-020"]);
});

test("IBGE municipality codes: list, check digit, the nine codes off the rule, state", () => {
  assert.equal(COUNT, 5571);
  assert.equal(municipioProblem("3550308"), "");
  assert.equal(municipioProblem("9999999"), "");
  assert.equal(ibgeCheckDigit("355030"), 8);
  assert.equal(CHECK_DIGIT_EXCEPTIONS.length, 9);
  for (const c of CHECK_DIGIT_EXCEPTIONS) { assert.notEqual(ibgeCheckDigit(String(c)), Number(String(c)[6])); assert.equal(municipioProblem(String(c)), ""); }
  assert.match(municipioProblem("3550307"), /check digit 7, but its first six digits give 8/);
  assert.match(municipioProblem("9950308"), /no state's IBGE code/);
  assert.match(municipioProblem("3550300"), /check digit|not in IBGE's list/);
  assert.match(municipioProblem("355030"), /7-digit/);
  assert.deepEqual(rules(swap("<CodigoMunicipio>3550308</CodigoMunicipio><Uf>SP</Uf><Cep>", "<CodigoMunicipio>3550307</CodigoMunicipio><Uf>SP</Uf><Cep>")), ["ABR-011"]);
  const wrongUf = checkAbrasf(swap("<CodigoMunicipio>3304557</CodigoMunicipio><Uf>RJ</Uf>", "<CodigoMunicipio>3304557</CodigoMunicipio><Uf>SP</Uf>")).findings;
  assert.deepEqual(wrongUf.map((x) => x.rule), ["ABR-011"]);
  assert.match(wrongUf[0].message, /is in RJ .* but Uf beside it is SP/);
});

test("CNPJ and CPF check digits", () => {
  assert.deepEqual(rules(swap("<Cnpj>11222333000181</Cnpj>", "<Cnpj>11222333000182</Cnpj>")), ["ABR-010"]);
  assert.deepEqual(rules(swap("<Cpf>52998224725</Cpf>", "<Cpf>52998224726</Cpf>")), ["ABR-010"]);
});

test("values: base, ISS, net amount, deductions over the service value", () => {
  assert.deepEqual(rules(swap("<BaseCalculo>850.00</BaseCalculo>", "<BaseCalculo>900.00</BaseCalculo>")), ["ABR-020"]);
  // The issued ISS and the RPS's own are both checked.
  assert.deepEqual(rules(swap("<ValorIss>42.50</ValorIss>\n        <ValorLiquidoNfse>", "<ValorIss>45.00</ValorIss>\n        <ValorLiquidoNfse>")), ["ABR-021"]);
  assert.deepEqual(rules(swap("<ValorIss>42.50</ValorIss>", "<ValorIss>40.00</ValorIss>", rps)), ["ABR-021"]);
  assert.deepEqual(rules(swap("<ValorLiquidoNfse>913.50</ValorLiquidoNfse>", "<ValorLiquidoNfse>871.00</ValorLiquidoNfse>")), ["ABR-022"]);
  // ISS retained: the net amount deducts it.
  const ret = swap("<ValorLiquidoNfse>913.50</ValorLiquidoNfse>", "<ValorLiquidoNfse>871.00</ValorLiquidoNfse>", swap("<IssRetido>2</IssRetido>", "<IssRetido>1</IssRetido>"));
  assert.deepEqual(rules(ret), []);
  assert.deepEqual(rules(swap("<ValorDeducoes>100.00</ValorDeducoes>", "<ValorDeducoes>990.00</ValorDeducoes>", rps)), ["ABR-023", "ABR-021"]);
  // A conditional discount does not lower the base, but does lower the net amount.
  const cond = swap("<DescontoCondicionado>0.00</DescontoCondicionado>", "<DescontoCondicionado>10.00</DescontoCondicionado>");
  assert.deepEqual(rules(cond), ["ABR-022"]);
  assert.deepEqual(rules(swap("<ValorLiquidoNfse>913.50</ValorLiquidoNfse>", "<ValorLiquidoNfse>903.50</ValorLiquidoNfse>", cond)), []);
});

test("a zero ISS beside a rate on an RPS is read as not computed and said, not flagged", () => {
  const r = checkAbrasf(swap("<ValorIss>42.50</ValorIss>", "<ValorIss>0.00</ValorIss>", rps));
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /ValorIss: 0\.00 beside Aliquota 5\.00 on an RPS/);
});

test("1.00 files (fraction rates, InfRps) skip the schema and still check values", () => {
  const old = `<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse><InfNfse versao="1.00"><Numero>1</Numero><Servico><Valores><ValorServicos>200.00</ValorServicos><ValorDeducoes>0</ValorDeducoes><IssRetido>2</IssRetido><ValorIss>4.00</ValorIss><BaseCalculo>200.00</BaseCalculo><Aliquota>0.02</Aliquota><ValorLiquidoNfse>200.00</ValorLiquidoNfse></Valores></Servico></InfNfse></Nfse></CompNfse>`;
  const r = checkAbrasf(old);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /states layout 1\.00; only ABRASF 2\.00 to 2\.04 are read/);
  assert.deepEqual(rules(old.replace("<ValorIss>4.00", "<ValorIss>5.00")), ["ABR-021"]);
});

test("an RPS escaped inside a SOAP parameter is found and checked", () => {
  const inner = rps.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/, "");
  const esc = inner.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const soap = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GerarNfse xmlns="http://nfse.abrasf.org.br"><nfseDadosMsg>${esc}</nfseDadosMsg></GerarNfse></soap:Body></soap:Envelope>`;
  assert.ok(looksLikeAbrasf(soap));
  const r = checkAbrasf(soap);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /escaped text \(a SOAP parameter\)/);
  assert.deepEqual(rules(soap.replace("&lt;ValorIss&gt;42.50", "&lt;ValorIss&gt;40.00")), ["ABR-021"]);
});

test("not well-formed or not ABRASF", () => {
  assert.deepEqual(rules(swap("Prestador Exemplo Ltda", "Prestador A & B")), ["ABR-001"]);
  assert.deepEqual(rules('<?xml version="1.0"?><x xmlns="urn:other"/>'), ["ABR-001"]);
});

test("the report reads an ABRASF file as a municipal NFS-e, not EN 16931", async () => {
  const out = await preflightDocuments([{ name: "nota.xml", source: nfse }]);
  assert.match(out.reports[0].envelope, /municipal NFS-e \(ABRASF 2\.04, CompNfse\).*issued/);
  assert.deepEqual(out.reports[0].errors, []);
  const bad = await preflightDocuments([{ name: "nota.xml", source: swap("<BaseCalculo>850.00</BaseCalculo>", "<BaseCalculo>900.00</BaseCalculo>") }]);
  assert.deepEqual(bad.reports[0].errors.map((e) => e.rule), ["ABR-020"]);
});

const lote202 = readFileSync(new URL("./fixtures/abrasf-lote-202.xml", import.meta.url), "utf8");

test("layouts 2.00-2.02: a 2.02 batch is checked against the 2.02 schema (validated by xmllint)", () => {
  const r = checkAbrasf(lote202);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.version, "2.02");
  assert.equal(r.meta.stated, "2.02");
  assert.deepEqual(r.skipped, []);
  // The 2.04 name for the buyer is not allowed in 2.02, and 2.02's is not allowed in 2.04.
  const renamed = lote202.replace(/<Tomador>/, "<TomadorServico>").replace(/<\/Tomador>/, "</TomadorServico>");
  assert.deepEqual(rules(renamed), ["ABR-002"]);
  // 2.04 also moved the batch's provider into a Prestador group.
  assert.ok(checkAbrasf(lote202.replace('versao="2.02"', 'versao="2.04"')).findings.some((f) => /Tomador is not allowed/.test(f.message)));
  // 2.00 writes DataEmissao and Competencia as date-times; 2.01 onward as dates.
  const as200 = checkAbrasf(lote202.replace('versao="2.02"', 'versao="2.00"')).findings;
  assert.ok(as200.some((f) => f.rule === "ABR-005" && /DataEmissao is not a date and time/.test(f.message)));
});

test("a provider's known extension keeps its finding and says whose it is", () => {
  const f = checkAbrasf(lote202.replace("<Competencia>", "<DataPagamento>2026-11-10</DataPagamento><Competencia>")).findings;
  assert.deepEqual(f.map((x) => x.rule), ["ABR-002"]);
  assert.match(f[0].fix, /Fintel extension/);
  const tok = checkAbrasf(lote202.replace("<NumeroLote>", "<Token>abc</Token><NumeroLote>")).findings;
  assert.match(tok[0].fix, /AVMB extension/);
  // An unknown element gets the plain fix.
  assert.doesNotMatch(checkAbrasf(lote202.replace("<Competencia>", "<Nota>x</Nota><Competencia>")).findings[0].fix, /extension/);
});

test("a stated layout the file does not follow is named beside the findings", () => {
  // The 2.04 NFS-e fixture relabelled 2.01: 2.01 has no TomadorServico and wants
  // IdentificacaoPrestador; under 2.04 it is clean.
  const stale = nfse.replaceAll('versao="2.04"', 'versao="2.01"');
  const r = checkAbrasf(stale);
  assert.deepEqual(r.findings.map((x) => x.rule).sort(), ["ABR-002", "ABR-004"]);
  assert.ok(r.skipped.some((x) => /states 2\.01 and draws 2 schema findings under it, but none under ABRASF 2\.04/.test(x)), r.skipped.join("\n"));
  // A clean file gets no such note.
  assert.ok(!checkAbrasf(nfse).skipped.some((x) => /^layout:/.test(x)));
  // A file no other layout fits better gets none either.
  const both = stale.replace("<Numero>77</Numero>", "<Numero>77</Numero><Nota>x</Nota>");
  const b = checkAbrasf(both);
  assert.equal(b.findings.length, 3);
  assert.ok(!b.skipped.some((x) => /^layout:/.test(x)), b.skipped.join("\n"));
});
