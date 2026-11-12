import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";
import { curpDigit, clabeDigit, seniorityFits } from "./nomina12.mjs";
import { runMutations, MUTATIONS } from "./eval/nomina-mutations.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const ordinary = read("cfdi-4.0-nomina.xml");
const finiquito = read("cfdi-4.0-nomina-finiquito.xml");
const rules = (t) => checkCfdi(t).findings.map((f) => f.rule);

test("the two example payroll CFDIs draw no finding and nothing skipped", () => {
  for (const t of [ordinary, finiquito]) {
    const r = checkCfdi(t);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.skipped, []);
    assert.equal(r.meta.tipo, "N");
    assert.equal(r.meta.payrolls, 1);
  }
});

test("every planted payroll defect is caught by the rule named for it, on both files", () => {
  for (const t of [ordinary, finiquito]) {
    const { clean, results } = runMutations(t);
    assert.deepEqual(clean, []);
    assert.equal(results.length, MUTATIONS.length);
    for (const r of results) assert.notEqual(r.status, "missed", `${r.name}: got ${r.got}`);
  }
  // Between them the two files exercise every mutation.
  const ran = new Set();
  for (const t of [ordinary, finiquito]) for (const r of runMutations(t).results) if (r.status === "caught") ran.add(r.name);
  assert.equal(ran.size, MUTATIONS.length);
});

test("check digits: CURP as python-stdnum computes it, CLABE the published examples", () => {
  assert.equal(curpDigit("XEXX010101HNEXXXA4"), "4");
  // SAT's generic woman's CURP does not fit the digit rule, so the checker exempts both generics.
  assert.equal(curpDigit("XEXX010101MNEXXXA8"), "4");
  assert.deepEqual(rules(ordinary.replace('Curp="XOJI740919MSRDMN00"', 'Curp="XEXX010101MNEXXXA8"')), []);
  assert.equal(curpDigit("CABL840215MDFSRS01"), "1");
  for (const c of ["032180000118359719", "002010077777777771", "014027000005555558"]) assert.equal(clabeDigit(c), c[17]);
  assert.equal(clabeDigit("12345"), null);
});

test("seniority: weeks and calendar periods counted inclusively from the start date", () => {
  assert.ok(seniorityFits("P1W", "2026-01-01", "2026-01-07"));
  assert.ok(!seniorityFits("P2W", "2026-01-01", "2026-01-07"));
  assert.ok(seniorityFits("P1Y0D", "2025-01-01", "2026-01-01"));
  assert.ok(seniorityFits("P29D", "2016-02-01", "2016-02-29")); // the guide's February 2016 example
  assert.ok(!seniorityFits("P1M5D", "2026-01-01", "2026-02-01"));
});

test("a CFDI with two payroll complements ties the concept to their combined totals", () => {
  const nom = /<nomina12:Nomina\b[\s\S]*<\/nomina12:Nomina>/.exec(ordinary)[0];
  const doubled = ordinary.replace(nom, nom + nom)
    .replaceAll('"9100.00"', '"18200.00"').replaceAll('Descuento="908.55"', 'Descuento="1817.10"').replace('Total="8191.45"', 'Total="16382.90"');
  const r = checkCfdi(doubled);
  assert.deepEqual(r.findings, []);
  assert.equal(r.meta.payrolls, 2);
  // Left at one complement's value, the concept is now short.
  const half = ordinary.replace(nom, nom + nom);
  assert.ok(rules(half).includes("MX-050"));
});

test("a wrong subtotal draws its own rule, not a derived Nomina-total finding", () => {
  assert.deepEqual(rules(ordinary.replace('TotalSueldos="8100.00"', 'TotalSueldos="8000.00"')), ["MX-052"]);
  assert.deepEqual(rules(ordinary.replace('TotalOtrasDeducciones="210.35"', 'TotalOtrasDeducciones="200.35"')), ["MX-053"]);
});

test("a company receiver and a company employer's CURP are named", () => {
  const company = ordinary.replace('Rfc="XOJI740919U48" Nombre="INGRID XODAR JIMENEZ"', 'Rfc="URE180429TM6" Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA"');
  assert.ok(rules(company).includes("MX-050"));
  const curp = ordinary.replace('<nomina12:Emisor RegistroPatronal="B5510768108"/>', '<nomina12:Emisor Curp="XEXX010101HNEXXXA4" RegistroPatronal="B5510768108"/>');
  assert.deepEqual(rules(curp), ["MX-056"]);
});

test("no RegistroPatronal: fees under contract 09 and regime 09 pass without the social-security fields", () => {
  const fees = ordinary
    .replace('<nomina12:Emisor RegistroPatronal="B5510768108"/>', "")
    .replace(/ NumSeguridadSocial="\d+" FechaInicioRelLaboral="[\d-]+" Antigüedad="\w+"/, "")
    .replace(' TipoContrato="01"', ' TipoContrato="09"').replace(' TipoRegimen="02"', ' TipoRegimen="09"')
    .replace(' RiesgoPuesto="1"', "").replace(' SalarioDiarioIntegrado="520.00"', "");
  assert.deepEqual(rules(fees), []);
  // ...but keeping an SDI without a RegistroPatronal is named.
  assert.deepEqual(rules(fees.replace(' ClaveEntFed="SON"', ' SalarioDiarioIntegrado="520.00" ClaveEntFed="SON"')), ["MX-056"]);
});

test("a disability deduction (006) is tied to the Incapacidad amounts; both 014 and 006 together are skipped", () => {
  const withDed = ordinary
    .replace('<nomina12:Deduccion TipoDeduccion="001" Clave="00301" Concepto="Seguridad social" Importe="210.35"/>', '<nomina12:Deduccion TipoDeduccion="006" Clave="00306" Concepto="Descuento por incapacidad" Importe="210.35"/>')
    .replace("</nomina12:OtrosPagos>", '</nomina12:OtrosPagos><nomina12:Incapacidades><nomina12:Incapacidad DiasIncapacidad="3" TipoIncapacidad="02" ImporteMonetario="210.35"/></nomina12:Incapacidades>');
  assert.deepEqual(rules(withDed), []);
  assert.deepEqual(rules(withDed.replace('ImporteMonetario="210.35"', 'ImporteMonetario="200.00"')), ["MX-057"]);
  const both = finiquito.replace('<nomina12:Deduccion TipoDeduccion="004" Clave="00304" Concepto="Préstamo de la empresa"', '<nomina12:Deduccion TipoDeduccion="006" Clave="00304" Concepto="Descuento por incapacidad"');
  const r = checkCfdi(both);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped.join(" "), /MX-057/);
});

test("an unreadable amount skips the sums it feeds and is left to the schema check", () => {
  const r = checkCfdi(ordinary.replace('ImporteGravado="7500.00"', 'ImporteGravado="7,500.00"'));
  assert.deepEqual([...new Set(r.findings.map((f) => f.rule))], ["MX-003"]);
  assert.match(r.skipped.join(" "), /MX-052/);
});

test("an invoice (type I) is untouched by the payroll rules, and an old Nómina 1.1 is named", () => {
  const inv = readFileSync(new URL("./fixtures/cfdi-4.0-invoice.xml", import.meta.url), "utf8");
  assert.ok(!rules(inv).some((r) => /^MX-05/.test(r)));
  const old = ordinary.replaceAll("http://www.sat.gob.mx/nomina12", "http://www.sat.gob.mx/nomina");
  assert.ok(rules(old).includes("MX-050"));
});
