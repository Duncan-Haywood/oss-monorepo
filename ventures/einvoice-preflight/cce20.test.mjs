import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";
import { productLimits, dollarLimits, fracciones, fraccionVigente, cpEstado } from "./cce20.mjs";
import { show } from "./pagos20.mjs";
import { runMutations, MUTATIONS, SEEDS } from "./eval/cce20-mutations.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const seeds = SEEDS.map((f) => [f, read(f)]);
const rules = (t) => checkCfdi(t).findings.map((f) => f.rule);
const lim = (pair) => pair.map((v) => show(v, 2));

test("the guide's four worked examples and a transfer draw no finding", () => {
  for (const [f, t] of seeds) {
    const r = checkCfdi(t);
    assert.deepEqual(r.findings, [], f);
    assert.equal(r.meta.exports, 1);
    // Only what an offline check cannot see is skipped: Banxico's rate and the postal code's municipality.
    assert.ok(r.skipped.every((s) => /^CCE1(21|30) /.test(s)), `${f}: ${r.skipped.join(" | ")}`);
  }
});

test("every planted export defect is caught by the rule named for it", () => {
  const ran = new Set();
  for (const [f, t] of seeds) {
    const { clean, results } = runMutations(t);
    assert.deepEqual(clean, [], f);
    for (const r of results) {
      assert.notEqual(r.status, "missed", `${f}: ${r.name}: got ${r.got}`);
      if (r.status === "caught") ran.add(r.name);
    }
  }
  assert.equal(ran.size, MUTATIONS.length);
});

test("the customs-value limits reproduce the guide's Apéndice 4 numbers", () => {
  // Escenarios 1, 2 and 4: 482,605.940 kg at 2.118550 USD/kg, limits 1,022,424.57 to 1,022,425.06.
  assert.deepEqual(lim(productLimits("482605.940", "2.118550")), ["1022424.57", "1022425.06"]);
  // Escenario 3: 0.500 l at 200.00 USD/l, limits 99.89 to 100.11.
  assert.deepEqual(lim(productLimits("0.500", "200.00")), ["99.89", "100.11"]);
});

test("a line's Importe in dollars: pesos, euros, and a dollar invoice at an agreed rate", () => {
  // Escenario 1: 19,548,966.93 MXN / 19.1202 = 1,022,424.814...
  const mxn = dollarLimits(["19548966.93"], undefined, "19.1202");
  assert.ok(show(mxn[0], 2) <= "1022424.81" && show(mxn[1], 2) >= "1022424.82");
  // Escenario 4: 846,311.16 EUR x 23.09903 / 19.1202 = 1,022,424.811...
  const [lo, hi] = lim(dollarLimits(["846311.16"], "23.09903", "19.1202"));
  assert.ok(Number(lo) <= 1022424.81 && Number(hi) >= 1022424.82);
  // A CFDI in dollars: the Importe itself, give or take half a cent.
  assert.deepEqual(lim(dollarLimits(["100.00"], undefined, undefined)), ["99.99", "100.01"]);
  // Escenario 2 at the agreed rate of 18 is right as written, and 10% off is not.
  const usd = read("cfdi-4.0-cce20-usd.xml");
  assert.deepEqual(rules(usd), []);
  assert.ok(rules(usd.replace(' ValorDolares="1022424.81"', ' ValorDolares="962500.00"').replace(' TotalUSD="1022424.81"', ' TotalUSD="962500.00"')).includes("MX-069"));
});

test("ValorDolares 0 or 1 skips the limits; 0 is for services only", () => {
  const mxn = read("cfdi-4.0-cce20-mxn.xml").replace(' TotalUSD="1022424.81"', ' TotalUSD="1.00"');
  assert.deepEqual(rules(mxn.replace(' ValorDolares="1022424.8141"', ' ValorDolares="1"')), []);
  assert.ok(rules(mxn.replace(' ValorDolares="1022424.8141"', ' ValorDolares="0"').replace(' TotalUSD="1.00"', ' TotalUSD="0.00"')).includes("MX-069"));
});

test("the tariff catalogue: 10-digit codes in force, their unit, and the March 2024 replacements", () => {
  assert.equal(fracciones().size, 11519);
  assert.equal(fracciones().get("7801100100"), "01"); // refined lead, kilos (the guide's example)
  assert.equal(fracciones().get("2202100100"), "08"); // a drink, litres (the guide's example)
  assert.equal(fracciones().get("78011001"), undefined); // an 8-digit CCE 1.1 code
  assert.ok(fraccionVigente("9503002300", "2024-03-01"));
  assert.ok(!fraccionVigente("9503002300", "2026-11-10"));
  assert.ok(!fraccionVigente("9503002301", "2024-02-01"));
  assert.ok(fraccionVigente("9503002301", "2026-11-10"));
});

test("postal codes map to their state", () => {
  assert.equal(cpEstado("86000"), "TAB");
  assert.equal(cpEstado("64000"), "NLE");
  assert.equal(cpEstado("01000"), "CMX");
  assert.equal(cpEstado("8600"), null);
});

test("a receiver's address in Mexico is checked against the catalogues, abroad against c_Pais", () => {
  const mxn = read("cfdi-4.0-cce20-mxn.xml");
  const mexican = mxn.replace('Municipio="Laredo" Estado="TX" Pais="USA" CodigoPostal="78045"', 'Municipio="039" Estado="NLE" Pais="MEX" CodigoPostal="64000"');
  // A Mexican address with a foreign tax id is wrong (CCE134), the address itself fine.
  assert.ok(checkCfdi(mexican).findings.some((f) => f.rule === "MX-065" && /CCE134/.test(f.message)));
  assert.ok(!checkCfdi(mexican).findings.some((f) => /CCE13[6-9]|CCE141/.test(f.message)));
  assert.ok(rules(mexican.replace('CodigoPostal="64000"', 'CodigoPostal="99999"')).includes("MX-065"));
  // Canada: postal code A1A 1A1 and a nine-digit business number.
  const can = mxn.replace('Municipio="Laredo" Estado="TX" Pais="USA" CodigoPostal="78045"', 'Municipio="Toronto" Estado="ON" Pais="CAN" CodigoPostal="M5V 2T6"');
  assert.deepEqual(rules(can), []);
  assert.ok(rules(can.replace('CodigoPostal="M5V 2T6"', 'CodigoPostal="M5V2T6"')).includes("MX-065"));
  // Germany: no state list and no patterns, so free text passes.
  const deu = mxn.replace('Municipio="Laredo" Estado="TX" Pais="USA" CodigoPostal="78045"', 'Municipio="Hamburg" Estado="Hamburg" Pais="DEU" CodigoPostal="20095"').replace('NumRegIdTrib="121585958">', 'NumRegIdTrib="DE123456789">');
  assert.deepEqual(rules(deu.replace(' ResidenciaFiscal="USA"', ' ResidenciaFiscal="DEU"')), []);
});

test("an approved-exporter number is accepted for an EU destination", () => {
  const mxn = read("cfdi-4.0-cce20-mxn.xml").replace(' CertificadoOrigen="0"', ' CertificadoOrigen="0" NumeroExportadorConfiable="MXREX0123456"');
  assert.ok(rules(mxn).includes("MX-062"));
  const eu = mxn.replace('Municipio="Laredo" Estado="TX" Pais="USA" CodigoPostal="78045"', 'Municipio="Madrid" Estado="Madrid" Pais="ESP" CodigoPostal="28001"').replace(' ResidenciaFiscal="USA"', ' ResidenciaFiscal="ESP"');
  assert.ok(!rules(eu).includes("MX-062"));
});

test("Exportacion 01 without the complement draws nothing from these rules", () => {
  assert.ok(!rules(read("cfdi-4.0-invoice.xml")).some((r) => /^MX-06\d$/.test(r)));
});
