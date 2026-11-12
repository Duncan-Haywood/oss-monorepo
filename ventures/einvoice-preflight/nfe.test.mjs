import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNfe, keyCheckDigit, looksLikeNfe, valueProblem } from "./nfe.mjs";
import { COMPLEX } from "./nfe-xsd-data.mjs";

const clean = readFileSync(new URL("./fixtures/nfe-4.00-invoice.xml", import.meta.url), "utf8");
const rules = (text) => checkNfe(text).findings.map((f) => f.rule);
const swap = (from, to) => { assert.ok(clean.includes(from), from); return clean.replace(from, to); };

test("the made-up fixture is clean apart from the missing signature", () => {
  const r = checkNfe(clean);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.mod, "55");
  assert.equal(r.meta.items, 2);
  assert.match(r.skipped.join(" "), /not signed yet/);
  assert.ok(looksLikeNfe(clean));
  assert.ok(!looksLikeNfe("<Invoice xmlns='urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'/>"));
});

test("schema table: TNFe and infNFe compiled with their content models", () => {
  assert.equal(COMPLEX.TNFe.model, "(?:<infNFe>(?:<infNFeSupl>)?<Signature>)");
  assert.ok(Object.keys(COMPLEX).length > 100);
});

test("access key check digit: mod 11, weights 2 to 9 from the right", () => {
  // the key of the fixture, built by the same rule, and two keys from sped-nfe's tests
  assert.equal(keyCheckDigit("4318090692938300016355001000000026100001030"), 1);
  assert.equal(keyCheckDigit("3517035871652300011955001000000030100000030"), 0);
  assert.match(rules(swap("314159261\" versao", "314159262\" versao")).join(), /BR-011/);
});

test("access key parts must match ide and emit (cStat 502)", () => {
  assert.deepEqual(rules(swap("<nNF>4217</nNF>", "<nNF>4218</nNF>")), ["BR-012"]);
  assert.deepEqual(rules(swap("<cNF>31415926</cNF>", "<cNF>31415927</cNF>")), ["BR-012"]);
  assert.match(rules(swap('Id="NFe', 'Id="NF')).join(), /BR-010/);
});

test("schema: unknown, missing and out-of-order elements, bad values", () => {
  assert.ok(rules(swap("<natOp>VENDA DE MERCADORIA</natOp>", "")).includes("BR-002"));
  assert.ok(rules(swap("<cProd>P-001</cProd>", "<cProd>P-001</cProd><xFoo>1</xFoo>")).includes("BR-002"));
  assert.ok(rules(swap("<tpAmb>2</tpAmb>", "<tpAmb>3</tpAmb>")).includes("BR-004"));
  assert.ok(rules(swap("<NCM>84834010</NCM>", "<NCM>8483401</NCM>")).includes("BR-004"));
  assert.ok(rules(swap("<infCpl>EXEMPLO", "<infCpl>\nEXEMPLO")).includes("BR-004"));
  assert.ok(rules(swap('<det nItem="2">', '<det nItem="1">')).includes("BR-002"));
  assert.match(valueProblem("@TCnpj", "12ABC34501DE35", "CNPJ"), /^$/); // alphanumeric CNPJ shape accepted
});

test("CNPJ and CPF check digits (cStat 207, 208)", () => {
  const f = checkNfe(swap("<CNPJ>98765432000198</CNPJ>", "<CNPJ>98765432000199</CNPJ>")).findings;
  assert.deepEqual(f.map((x) => x.rule), ["BR-013"]);
  assert.match(f[0].message, /cStat 208/);
});

test("item vProd against qCom x vUnCom (cStat 629)", () => {
  const t = swap("<vProd>255.00</vProd>", "<vProd>255.02</vProd>");
  assert.ok(rules(t).includes("BR-020"));
  // a cent of rounding is tolerated
  const near = swap("<vUnCom>19.9900000000</vUnCom>", "<vUnCom>19.9930000000</vUnCom>");
  assert.ok(!rules(near).includes("BR-020"));
});

test("ICMSTot against the items, vNF against its parts", () => {
  for (const [from, to, code] of [
    ["<vBC>319.97</vBC>", "<vBC>319.96</vBC>", "531"], ["<vICMS>38.40</vICMS>", "<vICMS>38.41</vICMS>", "532"],
    ["<vIPI>15.75</vIPI>", "<vIPI>15.70</vIPI>", "538"], ["<vPIS>5.28</vPIS>", "<vPIS>5.29</vPIS>", "602"],
    ["<vCOFINS>24.32</vCOFINS>", "<vCOFINS>24.33</vCOFINS>", "603"], ["<vFrete>10.00</vFrete><vSeg>", "<vFrete>11.00</vFrete><vSeg>", "535"],
  ]) {
    const f = checkNfe(swap(from, to)).findings.filter((x) => x.rule === "BR-021");
    assert.equal(f.length, 1, from);
    assert.match(f[0].message, new RegExp(`cStat ${code}`));
  }
  assert.deepEqual(rules(swap("<vNF>335.72</vNF>", "<vNF>335.73</vNF>")), ["BR-030"]);
  // a wrong vProd total draws its own rule and a vNF mismatch, since vNF is built from it
  assert.deepEqual(rules(swap("<vProd>314.97</vProd>", "<vProd>314.98</vProd>")), ["BR-021", "BR-030"]);
});

test("NFC-e payments less change equal vNF (cStat 767)", () => {
  const nfce = clean.replace("<mod>55</mod>", "<mod>65</mod>").replace("<vPag>335.72</vPag>", "<vPag>340.00</vPag>");
  assert.ok(rules(nfce).includes("BR-031"));
  const withChange = nfce.replace("</detPag>", "</detPag><vTroco>4.28</vTroco>");
  assert.ok(!rules(withChange).includes("BR-031"));
});

test("state codes and CFOP direction", () => {
  assert.ok(rules(swap("<UF>SP</UF>", "<UF>MG</UF>")).includes("BR-040"));
  assert.ok(rules(swap("<cMunFG>3550308</cMunFG>", "<cMunFG>3304557</cMunFG>")).includes("BR-040"));
  assert.deepEqual(rules(swap("<CFOP>6101</CFOP>", "<CFOP>2101</CFOP>")), ["BR-041"]);
  assert.deepEqual(rules(swap("<CFOP>6101</CFOP>", "<CFOP>5101</CFOP>")), ["BR-042"]);
});

test("old layouts and non-NF-e roots are named, not read", () => {
  assert.deepEqual(rules(clean.replace('versao="4.00"', 'versao="3.10"')), ["BR-001"]);
  assert.deepEqual(rules("<foo/>"), ["BR-001"]);
});

const reform = readFileSync(new URL("./fixtures/nfe-4.00-reform.xml", import.meta.url), "utf8");
const rswap = (from, to) => { assert.ok(reform.includes(from), from); return reform.replace(from, to); };

test("schema: PL_010_V1.30, the reform layout, is the table read", async () => {
  const { PACKAGE } = await import("./nfe-xsd-data.mjs");
  assert.equal(PACKAGE, "PL_010_V1.30");
  assert.ok(COMPLEX.TTribNFe && COMPLEX.TCIBS_NFe && COMPLEX.TIBSCBSMonoTot);
});

test("the made-up reform fixture (IBS 0.1%, CBS 0.9%, the 2026 test rates) is clean", () => {
  const r = checkNfe(reform);
  assert.deepEqual(r.findings, []);
  assert.doesNotMatch(r.skipped.join(" "), /IBSCBS|reform/);
});

test("reform groups are read against the schema now, not skipped", () => {
  // CST of IBS/CBS is three digits; an out-of-order group is a schema error.
  assert.deepEqual(rules(rswap("<IBSCBS><CST>000</CST>", "<IBSCBS><CST>00</CST>")), ["BR-004"]);
  assert.deepEqual(rules(rswap("<vIBS>0.26</vIBS><gCBS>", "<gCBS>")), ["BR-002"]);
  assert.deepEqual(rules(rswap("</gIBSCBS></IBSCBS>", "</gIBSCBS><gFoo/></IBSCBS>")), ["BR-002"]);
});

test("BR-050: an item's vIBS is vIBSUF + vIBSMun", () => {
  // the total is still right, so only the item is named
  const t = rswap("<vIBS>0.26</vIBS>", "<vIBS>0.27</vIBS>");
  assert.deepEqual(rules(t), ["BR-050"]);
  assert.match(checkNfe(t).findings[0].message, /0\.26/);
});

test("BR-051: every IBSCBSTot field is the sum of the items", () => {
  for (const [from, to, path] of [
    ["<vBCIBSCBS>319.97", "<vBCIBSCBS>319.98", "vBCIBSCBS"],
    ["<vIBSUF>0.32</vIBSUF>", "<vIBSUF>0.33</vIBSUF>", "gIBS/gIBSUF/vIBSUF"],
    ["<vIBS>0.32</vIBS>", "<vIBS>0.31</vIBS>", "gIBS/vIBS"],
    ["<vCBS>2.88</vCBS>", "<vCBS>2.87</vCBS>", "gCBS/vCBS"],
    ["<gIBSMun><vDif>0.00</vDif>", "<gIBSMun><vDif>0.01</vDif>", "gIBS/gIBSMun/vDif"],
  ]) {
    const f = checkNfe(rswap(from, to)).findings;
    assert.deepEqual(f.map((x) => x.rule), ["BR-051"], path);
    assert.equal(f[0].path, `/NFe/infNFe/total/IBSCBSTot/${path}`);
  }
  // an item that is off is caught at the total too
  assert.deepEqual(rules(rswap("<vCBS>0.54</vCBS>", "<vCBS>0.55</vCBS>")), ["BR-051"]);
});

test("BR-051: ISTot is the sum of the items' Imposto Seletivo", () => {
  const is = "<IS><CSTIS>000</CSTIS><cClassTribIS>000001</cClassTribIS><vBCIS>59.97</vBCIS><pIS>10.0000</pIS><vIS>6.00</vIS></IS>";
  const t = reform.replace("</COFINS>\n        <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>59.97", `</COFINS>\n        ${is}<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>59.97`);
  assert.notEqual(t, reform);
  const withTot = (v) => t.replace("<IBSCBSTot>", `<ISTot><vIS>${v}</vIS></ISTot><IBSCBSTot>`);
  // vItem and vNFTot are left as they were: IS is not added to vItem in 2026 here
  assert.deepEqual(rules(withTot("6.00")), []);
  assert.deepEqual(rules(withTot("6.01")), ["BR-051"]);
});

test("BR-052: vNFTot is the sum of vItem over the items with indTot 1", () => {
  assert.deepEqual(rules(rswap("<vNFTot>335.72", "<vNFTot>335.71")), ["BR-052"]);
  assert.deepEqual(rules(rswap("<vItem>62.97", "<vItem>62.98")), ["BR-052"]);
  // an item outside the total (indTot 0) leaves vNFTot alone; vProd/vNF then disagree (BR-021/BR-030)
  const off = rswap("<vProd>59.97</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>3.0000</qTrib><vUnTrib>19.9900000000</vUnTrib><indTot>1", "<vProd>59.97</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>3.0000</qTrib><vUnTrib>19.9900000000</vUnTrib><indTot>0");
  assert.ok(rules(off).includes("BR-052"));
});

test("the main report routes an NF-e to these checks", async () => {
  const { preflightDocuments } = await import("./report.mjs");
  const bad = clean.replace("<vNF>335.72</vNF>", "<vNF>335.73</vNF>");
  const r = await preflightDocuments([{ name: "nota.xml", source: bad }]);
  assert.equal(r.reports.length, 1);
  assert.match(r.reports[0].envelope, /Brazilian NF-e 4\.00/);
  assert.deepEqual(r.reports[0].errors.map((f) => f.rule), ["BR-030"]);
});

test("an authorised import NF-e whose vNF leaves the duty inside vProd passes (eval/nfe-corpus)", () => {
  const sc = readFileSync(new URL("./eval/nfe-corpus/nfelib/42210775277525000178550030000266631762885493-procNFe.xml", import.meta.url), "utf8");
  assert.deepEqual(checkNfe(sc).findings, []);
  // Make.php's reading, with vII added, passes too; anything else is BR-030.
  assert.deepEqual(rules(sc.replace("<vNF>95700.68", "<vNF>109621.95")), []);
  assert.deepEqual(rules(sc.replace("<vNF>95700.68", "<vNF>95700.69")), ["BR-030"]);
});

test("the open-source corpus: 17 clean files, every seeded fault caught", async () => {
  const { execFileSync } = await import("node:child_process");
  const out = JSON.parse(execFileSync(process.execPath, [new URL("./eval/nfe-corpus.mjs", import.meta.url).pathname, "--json"], { encoding: "utf8" }));
  assert.equal(out.files.length, 35);
  assert.equal(out.files.filter((f) => !f.rules.length).length, 17);
  for (const m of out.mutations) assert.equal(m.caught, m.applied, m.mutation);
  assert.equal(out.mutations.reduce((s, m) => s + m.caught, 0), 153);
});
