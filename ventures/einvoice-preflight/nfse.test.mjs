import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNfse, looksLikeNfse } from "./nfse.mjs";
import { COMPLEX, PACKAGE } from "./nfse-xsd-data.mjs";
import { CODES } from "./cclasstrib-data.mjs";
import { preflightDocuments } from "./report.mjs";

const clean = readFileSync(new URL("./fixtures/nfse-nacional.xml", import.meta.url), "utf8");
const dps = readFileSync(new URL("./fixtures/nfse-dps.xml", import.meta.url), "utf8");
const rules = (text) => checkNfse(text).findings.map((f) => f.rule);
const swap = (from, to, base = clean) => { assert.ok(base.includes(from), from); return base.replace(from, to); };

test("the made-up NFS-e and its DPS are clean (both accepted by xmllint)", () => {
  const r = checkNfse(clean);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.meta.kind, "NFSe");
  assert.equal(r.meta.ambGer, "2");
  assert.equal(r.meta.key, "35503082211222333000181000000000012326110000045673");
  const d = checkNfse(dps);
  assert.deepEqual(d.findings, []);
  assert.match(d.skipped.join(" "), /sums are checked on an NFSe file/);
  assert.ok(looksLikeNfse(clean) && looksLikeNfse(dps));
  assert.ok(!looksLikeNfse("<NFe xmlns='http://www.portalfiscal.inf.br/nfe'/>"));
});

test("schema table: the 2026-10-20 package, DPS and NFSe roots", () => {
  assert.equal(PACKAGE, "NFSe-ESQUEMAS_XSD-RTC-v1.02-20261020");
  assert.equal(COMPLEX.TCNFSe.model, "(?:<infNFSe><Signature>)");
  assert.equal(COMPLEX.TCDPS.model, "(?:<infDPS>(?:<Signature>)?)");
  assert.ok(Object.keys(COMPLEX).length >= 70);
});

test("schema: missing, unknown and out-of-order elements, bad values and attributes", () => {
  assert.deepEqual(rules(swap("<xLocEmi>São Paulo</xLocEmi>", "")), ["NFSE-002"]);
  assert.deepEqual(rules(swap("<nNFSe>123</nNFSe>", "<nNFSe>123</nNFSe><xExtra>1</xExtra>")), ["NFSE-002"]);
  assert.deepEqual(rules(swap("<tpAmb>2</tpAmb>", "<tpAmb>3</tpAmb>", dps)), ["NFSE-004"]);
  assert.deepEqual(rules(swap('<NFSe versao="1.01"', '<NFSe versao="2.00"')), ["NFSE-004"]);
  assert.deepEqual(rules(swap('<NFSe versao="1.01"', "<NFSe")), ["NFSE-003"]);
  assert.deepEqual(rules(swap("<vServ>1500.00</vServ>", "<vServ>1500.001</vServ>", dps)), ["NFSE-004"]);
  assert.deepEqual(rules(swap("<xNome>CLIENTE EXEMPLO</xNome>", `<xNome>${"X".repeat(301)}</xNome>`, dps)), ["NFSE-004"]);
});

test("an NFS-e without its signature is skipped and said, not a finding", () => {
  const unsigned = clean.replace(/<Signature[\s\S]*<\/Signature>/, "");
  const r = checkNfse(unsigned);
  assert.deepEqual(r.findings.map((f) => f.rule), []);
  assert.match(r.skipped.join(" "), /no ds:Signature/);
});

test("layout drift: files from before the 2026-10-20 package are told what moved", () => {
  const old = swap("<finNFSe>0</finNFSe>", "", dps);
  const f = checkNfse(old).findings;
  assert.equal(f.length, 1);
  assert.match(f[0].fix, /leiaute 1\.04\.01/);
  const order = checkNfse(swap("<cNBS>115022000</cNBS>\n\t\t\t\t\t\t<xDescServ>Desenvolvimento de sistema sob encomenda</xDescServ>", "<xDescServ>Desenvolvimento de sistema sob encomenda</xDescServ><cNBS>115022000</cNBS>", dps)).findings;
  assert.equal(order.length, 1);
  assert.match(order[0].fix, /xDescServ now comes after cNBS/);
  const rtc = checkNfse(swap("<indDest>0</indDest>", "<finNFSe>0</finNFSe><indDest>0</indDest>", dps)).findings;
  assert.match(rtc.map((x) => x.fix).join(" "), /finNFSe moved out of IBSCBS/);
});

test("a bare & is not well-formed XML", () => {
  const r = checkNfse(swap("CLIENTE EXEMPLO", "CLIENTE & FILHOS", dps));
  assert.deepEqual(r.findings.map((f) => f.rule), ["NFSE-001"]);
  assert.match(r.findings[0].message, /line \d+/);
  assert.deepEqual(rules(swap("CLIENTE EXEMPLO", "CLIENTE &amp; FILHOS", dps)), []);
});

test("DPS Id against cLocEmi, the issuer, serie and nDPS (NFSE-010)", () => {
  assert.deepEqual(rules(swap("<nDPS>17</nDPS>", "<nDPS>18</nDPS>", dps)), ["NFSE-010"]);
  assert.deepEqual(rules(swap("<serie>1</serie>", "<serie>2</serie>", dps)), ["NFSE-010"]);
  assert.deepEqual(rules(swap("<cLocEmi>3550308</cLocEmi>", "<cLocEmi>3304557</cLocEmi>", dps)), ["NFSE-010"]);
  // the issuer is the provider (tpEmit 1): a CPF-typed Id does not fit a CNPJ issuer
  assert.deepEqual(rules(swap('Id="DPS35503082', 'Id="DPS35503081', dps)), ["NFSE-010"]);
});

test("NFS-e access key: check digit (NFSE-011) and parts (NFSE-012)", () => {
  assert.deepEqual(rules(swap('Id="NFS35503082211222333000181000000000012326110000045673"', 'Id="NFS35503082211222333000181000000000012326110000045674"')), ["NFSE-011"]);
  assert.deepEqual(rules(swap("<nNFSe>123</nNFSe>", "<nNFSe>124</nNFSe>")), ["NFSE-012"]);
  assert.deepEqual(rules(swap("<ambGer>2</ambGer>", "<ambGer>1</ambGer>")), ["NFSE-012"]);
  const month = swap("<dhProc>2026-11-10T10:00:05-03:00</dhProc>", "<dhProc>2026-12-01T10:00:05-03:00</dhProc>")
    .replace("<dhEmi>2026-11-10T10:00:00-03:00</dhEmi>", "<dhEmi>2026-12-01T10:00:00-03:00</dhEmi>");
  assert.deepEqual(rules(month), ["NFSE-012"]);
});

test("CNPJ and CPF check digits (NFSE-013)", () => {
  assert.deepEqual(rules(swap("<CPF>11144477735</CPF>", "<CPF>11144477736</CPF>", dps)), ["NFSE-013"]);
  const r = rules(swap("<CNPJ>11222333000181</CNPJ>\n\t\t\t<IM>", "<CNPJ>11222333000182</CNPJ>\n\t\t\t<IM>"));
  assert.deepEqual(r, ["NFSE-013"]);
});

test("ISSQN sums: base, tax, retentions and net (NFSE-020..023)", () => {
  assert.deepEqual(rules(swap("<vBC>1400.00</vBC>", "<vBC>1500.00</vBC>")), ["NFSE-020", "NFSE-021"]);
  assert.deepEqual(rules(swap("<pAliqAplic>5.00</pAliqAplic>", "<pAliqAplic>2.00</pAliqAplic>")), ["NFSE-021"]);
  assert.deepEqual(rules(swap("<vTotalRet>91.00</vTotalRet>", "<vTotalRet>21.00</vTotalRet>")), ["NFSE-022", "NFSE-023"]);
  assert.deepEqual(rules(swap("<vLiq>1309.00</vLiq>", "<vLiq>1400.00</vLiq>")), ["NFSE-023", "NFSE-033"]);
  // ISSQN not retained: vTotalRet should drop to 21.00 and vLiq to 1379.00
  assert.deepEqual(rules(swap("<tpRetISSQN>2</tpRetISSQN>", "<tpRetISSQN>1</tpRetISSQN>")), ["NFSE-022"]);
  // a municipal benefit in R$ lowers the base
  const bm = swap("<tpRetISSQN>2</tpRetISSQN>", "<BM><nBM>35503080100001</nBM><vRedBCBM>400.00</vRedBCBM></BM><tpRetISSQN>2</tpRetISSQN>");
  assert.deepEqual(rules(bm), ["NFSE-020"]);
});

test("PIS/COFINS retained: a vTotalRet with or without them is accepted", () => {
  const ret = swap("<tpRetPisCofins>2</tpRetPisCofins>", "<tpRetPisCofins>1</tpRetPisCofins>");
  assert.deepEqual(rules(ret), []);
  const withPc = ret.replace("<vTotalRet>91.00</vTotalRet>", "<vTotalRet>142.10</vTotalRet>").replace("<vLiq>1309.00</vLiq>", "<vLiq>1257.90</vLiq>").replace("<vTotNF>1309.00</vTotNF>", "<vTotNF>1257.90</vTotNF>");
  assert.deepEqual(rules(withPc), []);
});

test("IBS/CBS sums (NFSE-030..033)", () => {
  assert.deepEqual(rules(swap("<vBC>1278.90</vBC>", "<vBC>1400.00</vBC>")), ["NFSE-030", "NFSE-031", "NFSE-031"]);
  assert.deepEqual(rules(swap("<vCBS>11.51</vCBS>", "<vCBS>12.51</vCBS>")), ["NFSE-031"]);
  assert.deepEqual(rules(swap("<pAliqEfetUF>0.10</pAliqEfetUF>", "<pAliqEfetUF>0.05</pAliqEfetUF>")), ["NFSE-031", "NFSE-031"]);
  assert.deepEqual(rules(swap("<vIBSTot>1.28</vIBSTot>", "<vIBSTot>1.30</vIBSTot>")), ["NFSE-032"]);
  assert.deepEqual(rules(swap("<vTotNF>1309.00</vTotNF>", "<vTotNF>1321.79</vTotNF>")), ["NFSE-033"]);
  // from 2027 IBS and CBS are charged on top, and PIS/COFINS leave the base
  const y27 = clean.replaceAll("2026-11-10", "2027-01-11").replace("2611", "2701");
  const r = checkNfse(y27).findings.map((f) => f.rule);
  assert.ok(r.includes("NFSE-030") && r.includes("NFSE-033"), r.join());
  // a stated reduction is a percentage: 0.10 less 60% is 0.04, and cClassTrib 000001 has none
  const red = swap("<pIBSUF>0.10</pIBSUF>", "<pIBSUF>0.10</pIBSUF><pRedAliqUF>60.00</pRedAliqUF>");
  assert.deepEqual(rules(red).sort(), ["NFSE-031", "NFSE-036"]);
  assert.match(checkNfse(red).findings.find((f) => f.rule === "NFSE-031").message, /less the pRedAliqUF 60\.00% reduction is 0\.04%/);
});

test("classification against the cClassTrib table (NFSE-034..036)", () => {
  // a 60% reduction code of CST 200 that the table marks for NFS-e, written as Unimake's sample writes it
  const e200 = Object.entries(CODES).find(([, c]) => c.cst === "200" && c.nfse && c.pRedIBS === 60 && c.pRedCBS === 60)[0];
  const ok = clean.replace(/<CST>000<\/CST>(\s*)<cClassTrib>000001</, `<CST>200</CST>$1<cClassTrib>${e200}<`)
    .replace(/<pIBSUF>0\.10<\/pIBSUF>(\s*)<pAliqEfetUF>0\.10</, "<pIBSUF>0.10</pIBSUF>$1<pRedAliqUF>60.00</pRedAliqUF><pAliqEfetUF>0.04<")
    .replace("<pIBSMun>0.00</pIBSMun>", "<pIBSMun>0.00</pIBSMun><pRedAliqMun>60.00</pRedAliqMun>")
    .replace(/<pCBS>0\.90<\/pCBS>(\s*)<pAliqEfetCBS>0\.90</, "<pCBS>0.90</pCBS>$1<pRedAliqCBS>60.00</pRedAliqCBS><pAliqEfetCBS>0.36<");
  assert.ok(ok.includes(e200) && ok.includes("<pAliqEfetCBS>0.36"));
  const r = rules(ok).filter((x) => /NFSE-03[4-6]/.test(x));
  assert.deepEqual(r, []);
  // the reduction left off the CBS: the table wants 60%
  const noCbs = ok.replace("<pRedAliqCBS>60.00</pRedAliqCBS><pAliqEfetCBS>0.36<", "<pAliqEfetCBS>0.90<");
  assert.ok(rules(noCbs).includes("NFSE-036"));
  // CST 101 (Unimake's NACIONAL sample) is not a CST of the table: 000001 is CST 000's
  const c101 = clean.replace("<CST>000</CST>", "<CST>101</CST>");
  assert.deepEqual(rules(c101), ["NFSE-034"]);
  assert.match(checkNfse(c101).findings[0].message, /belongs to CST 000/);
  // a code the table does not have, and one it does not allow on an NFS-e
  assert.deepEqual(rules(clean.replace("<cClassTrib>000001</cClassTrib>", "<cClassTrib>000099</cClassTrib>")), ["NFSE-034"]);
  const notNfse = Object.entries(CODES).find(([, c]) => c.cst === "000" && !c.nfse)[0];
  assert.deepEqual(rules(clean.replace("<cClassTrib>000001</cClassTrib>", `<cClassTrib>${notNfse}</cClassTrib>`)), ["NFSE-035"]);
});

test("the report routes a national NFS-e to its own rules", async () => {
  const out = await preflightDocuments([{ name: "nota.xml", source: clean }]);
  const r = out.reports[0];
  assert.match(r.envelope, /national NFS-e/);
  assert.deepEqual(r.errors, []);
  const bad = await preflightDocuments([{ name: "nota.xml", source: swap("<vLiq>1309.00</vLiq>", "<vLiq>1400.00</vLiq>") }]);
  assert.ok(bad.reports[0].errors.some((e) => e.rule === "NFSE-023"));
});
