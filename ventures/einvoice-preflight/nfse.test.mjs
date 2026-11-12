import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNfse, looksLikeNfse } from "./nfse.mjs";
import { COMPLEX, PACKAGE } from "./nfse-xsd-data.mjs";
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
  // a stated reduction is skipped and said
  const red = swap("<pIBSUF>0.10</pIBSUF>", "<pIBSUF>0.10</pIBSUF><pRedAliqUF>60.00</pRedAliqUF>");
  assert.match(checkNfse(red).skipped.join(" "), /rate reduction/);
});

test("the report routes a national NFS-e to its own rules", async () => {
  const out = await preflightDocuments([{ name: "nota.xml", source: clean }]);
  const r = out.reports[0];
  assert.match(r.envelope, /national NFS-e/);
  assert.deepEqual(r.errors, []);
  const bad = await preflightDocuments([{ name: "nota.xml", source: swap("<vLiq>1309.00</vLiq>", "<vLiq>1400.00</vLiq>") }]);
  assert.ok(bad.reports[0].errors.some((e) => e.rule === "NFSE-023"));
});
