import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";
import { dec, roundD, truncD, show } from "./pagos20.mjs";
import { runMutations, MUTATIONS } from "./eval/pagos-mutations.mjs";

const good = readFileSync(new URL("./fixtures/cfdi-4.0-pago.xml", import.meta.url), "utf8");

test("the example payment CFDI draws no finding and is read as two payments, three documents", () => {
  const r = checkCfdi(good);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.meta.tipo, "P");
  assert.equal(r.meta.payments, 2);
  assert.equal(r.meta.documents, 3);
});

test("every planted Pagos defect is caught by the rule named for it", () => {
  const { clean, results } = runMutations(good);
  assert.deepEqual(clean, []);
  assert.equal(results.length, MUTATIONS.length);
  for (const r of results) assert.equal(r.status, "caught", `${r.name}: got ${r.got}`);
});

test("exact decimals: round half away from zero and truncate, as CfdiUtils' bcmath Decimal", () => {
  assert.equal(show(roundD(dec("0.1234565"), 6), 6), "0.123457");
  assert.equal(show(truncD(dec("0.1234569"), 6), 6), "0.123456");
  assert.equal(show(roundD(dec("-2.5"), 0), 0), "-3");
  // 237.931034 / 17.25 = 13.793103420..., and 500 + 1487.068966 / 17.25 rounds to 586.206897
  const q = (dec("1487.068966") * 10n ** 24n) / dec("17.25");
  assert.equal(show(roundD(dec("500") + q, 6), 6), "586.206897");
  assert.equal(dec("abc"), null);
});

test("a payment to a foreign receiver keeps UsoCFDI CP01 without an MX-014", () => {
  const f = good.replace('Rfc="URE180429TM6" Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA" DomicilioFiscalReceptor="86991"', 'Rfc="XEXX010101000" Nombre="ACME INC" DomicilioFiscalReceptor="86000" ResidenciaFiscal="USA" NumRegIdTrib="123456789"')
    .replace('RegimenFiscalReceptor="601"', 'RegimenFiscalReceptor="616"');
  assert.deepEqual(checkCfdi(f).findings.map((x) => x.rule), []);
});

test("a Pagos 1.0 complement in a CFDI 4.0 is named, not read", () => {
  const f = good.replace(/xmlns:pago20="http:\/\/www\.sat\.gob\.mx\/Pagos20"/, 'xmlns:pago20="http://www.sat.gob.mx/Pagos"');
  const r = checkCfdi(f).findings;
  assert.ok(r.some((x) => x.rule === "MX-040" && /not version 2\.0/.test(x.message)));
});

test("Pagos schema faults name Pagos20.xsd and carry the complement's path", () => {
  const f = good.replace(' FormaDePagoP="03" MonedaP="MXN"', ' MonedaP="MXN"');
  const r = checkCfdi(f).findings;
  assert.deepEqual(r.map((x) => x.rule), ["MX-002"]);
  assert.match(r[0].fix, /Pagos20\.xsd/);
  assert.equal(r[0].path, "/Comprobante/Complemento/Pagos/Pago/@FormaDePagoP");
});

test("a fee-sized overpayment is allowed: Monto may exceed what the documents record", () => {
  const f = good.replace('Monto="11475.00"', 'Monto="11475.50"').replace('MontoTotalPagos="23205.00"', 'MontoTotalPagos="23205.50"');
  assert.deepEqual(checkCfdi(f).findings, []);
});

// Red-team guards (2026-11-12): each test below fails with a code mutant that the suite let through.
test("tax group labels name the tax: ISR and IVA, not the SAT code", () => {
  const f = good.replace('ImpuestoDR="001"', 'ImpuestoDR="002"').replace('ImpuestoP="001"', 'ImpuestoP="002"');
  const r = checkCfdi(f).findings;
  assert.deepEqual(r.map((x) => x.rule), ["MX-049", "MX-049"]);
  assert.match(r[0].message, /IVA withheld/);
  assert.match(r[1].message, /ISR withheld/);
});

test("a peso payment with no TipoCambioP counts at 1 toward MontoTotalPagos", () => {
  const f = good.replace(' MonedaP="MXN" TipoCambioP="1"', ' MonedaP="MXN"');
  assert.deepEqual(checkCfdi(f).findings, []);
  const r = checkCfdi(f.replace('MontoTotalPagos="23205.00"', 'MontoTotalPagos="23300.00"')).findings;
  assert.deepEqual(r.map((x) => x.rule), ["MX-049"]);
  assert.match(r[0].message, /23205\.00/);
});

test("a payment with no Monto is a schema fault, not a crash or a MontoTotalPagos guess", () => {
  const r = checkCfdi(good.replace(' Monto="11475.00"', ""));
  assert.deepEqual(r.findings.map((x) => x.rule), ["MX-002"]);
});

test("Totales tax sums come from the documents too, when ImpuestosP leaves a group out", () => {
  // Payment 1 drops its IVA row: MX-048 says so, and Totales (which still counts that IVA) is right.
  const f = good.replace(/<pago20:TrasladosP>\s*<pago20:TrasladoP BaseP="10000\.00"[^>]*\/>\s*<\/pago20:TrasladosP>/, "");
  const r = checkCfdi(f).findings;
  assert.deepEqual(r.map((x) => x.rule), ["MX-048"]);
  assert.match(r[0].message, /leaves out/);
});

test("an unreadable TipoCambioP skips the Totales tax sums instead of blaming correct totals", () => {
  for (const tc of ["", ' TipoCambioP="abc"']) {
    const r = checkCfdi(good.replace(' TipoCambioP="17.25"', tc));
    assert.deepEqual(r.findings.map((x) => x.rule), [tc ? "MX-003" : "MX-042"], tc);
    assert.ok(r.skipped.some((s) => /MX-049/.test(s) && /TipoCambioP/.test(s)), tc);
  }
});

// Red team 2026-11-12: three mutants of pagos20.mjs escaped this suite; one test each.
test("EquivalenciaDR 0 is a schema fault, not a division by zero", () => {
  const r = checkCfdi(good.replace('EquivalenciaDR="17.25"', 'EquivalenciaDR="0"'));
  assert.deepEqual(r.findings.map((f) => f.rule), ["MX-003"]);
});

test("a TrasladoDR ImporteDR on the lower rounding bound is accepted", () => {
  // 9999.995 x 0.16 = 1599.9992, floored to 1599.99: the bound itself is valid.
  const r = checkCfdi(good.replace('TasaOCuotaDR="0.160000" ImporteDR="1600.00"', 'TasaOCuotaDR="0.160000" ImporteDR="1599.99"'));
  assert.deepEqual(r.findings.filter((f) => f.rule === "MX-047"), []);
});

test("an ImporteP written with 2 decimals is compared at 2, even when the documents' sum has a third", () => {
  const f = good
    .replace('BaseDR="10000.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="1600.00"', 'BaseDR="10000.025" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="1600.004"')
    .replace('BaseP="10000.00"', 'BaseP="10000.03"');
  assert.deepEqual(checkCfdi(f).findings.filter((x) => x.rule === "MX-048"), []);
});
