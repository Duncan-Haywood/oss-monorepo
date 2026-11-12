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

test("reform groups (IBSCBS) are skipped and named", () => {
  const t = swap("<COFINS><COFINSAliq><CST>01</CST><vBC>260.00</vBC>", "<COFINS><COFINSAliq><CST>01</CST><vBC>260.00</vBC>")
    .replace("</COFINS>\n      </imposto>", "</COFINS><IBSCBS><CST>000</CST></IBSCBS>\n      </imposto>");
  const r = checkNfe(t);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /IBSCBS/);
});
