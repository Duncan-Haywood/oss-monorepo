// Planted-defect run for the Nómina 1.2 checks (nomina12.mjs, MX-050..MX-057). Each
// mutation edits a clean type N CFDI once and names the rule that should catch it; a
// mutation whose pattern is absent from a file is skipped, not counted. Every defect is
// one SAT's payroll guide (GuiaNomina11102019.pdf) describes as wrong.
//   node eval/nomina-mutations.mjs [file.xml ...]
//   (default: fixtures/cfdi-4.0-nomina.xml and fixtures/cfdi-4.0-nomina-finiquito.xml)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCfdi } from "../cfdi.mjs";

const bump = (v, d) => (Number(v) + d).toFixed(2);
const NOMINA_RULE = /^MX-05\d$/;

// [name, expected rule, (text) => mutated text or null]
export const MUTATIONS = [
  // MX-050: the type N shell
  ["FormaPago 03 on a payroll", "MX-050", (t) => sub(t, / FormaPago="99"/, () => ' FormaPago="03"')],
  ["MetodoPago PPD on a payroll", "MX-050", (t) => sub(t, / MetodoPago="PUE"/, () => ' MetodoPago="PPD"')],
  ["UsoCFDI G03 on a payroll", "MX-050", (t) => sub(t, / UsoCFDI="CN01"/, () => ' UsoCFDI="G03"')],
  ["concept with an invoice product key", "MX-050", (t) => sub(t, / ClaveProdServ="84111505"/, () => ' ClaveProdServ="84111506"')],
  ["concept description changed", "MX-050", (t) => sub(t, / Descripcion="Pago de nómina"/, () => ' Descripcion="Sueldo"')],
  ["concept Descuento not TotalDeducciones", "MX-050", (t) => moveDiscount(t, 1)],
  ["Nomina in an income CFDI", "MX-050", (t) => sub(t, / TipoDeComprobante="N"/, () => ' TipoDeComprobante="I"')],
  ["Nomina complement removed", "MX-050", (t) => sub(t, /\s*<nomina12:Nomina\b[\s\S]*<\/nomina12:Nomina>/, () => "")],
  // MX-051: the Nomina totals
  ["TotalPercepciones off by one cent", "MX-051", (t) => sub(t, / TotalPercepciones="([\d.]+)"/, (m, v) => ` TotalPercepciones="${bump(v, 0.01)}"`)],
  ["TotalDeducciones off by one peso", "MX-051", (t) => sub(t, / TotalDeducciones="([\d.]+)"/, (m, v) => ` TotalDeducciones="${bump(v, 1)}"`)],
  ["TotalOtrosPagos dropped", "MX-051", (t) => sub(t, / TotalOtrosPagos="[\d.]+"/, () => "")],
  // MX-052: Percepciones
  ["TotalSueldos off by one cent", "MX-052", (t) => sub(t, / TotalSueldos="([\d.]+)"/, (m, v) => ` TotalSueldos="${bump(v, 0.01)}"`)],
  ["TotalGravado and TotalExento swapped", "MX-052", (t) => sub(t, / TotalGravado="([\d.]+)" TotalExento="([\d.]+)"/, (m, g, e) => (g === e ? m : ` TotalGravado="${e}" TotalExento="${g}"`))],
  ["indemnity counted as wages", "MX-052", (t) => sub(t, / TipoPercepcion="025"/, () => ' TipoPercepcion="038"')],
  ["overtime without HorasExtra", "MX-052", (t) => sub(t, /\s*<nomina12:HorasExtra [^>]*\/>/, () => "")],
  ["SeparacionIndemnizacion removed", "MX-052", (t) => sub(t, /\s*<nomina12:SeparacionIndemnizacion [^>]*\/>/, () => "")],
  ["a perception of 0 and 0", "MX-052", (t) => sub(t, /(<nomina12:Percepcion [^>]*?)ImporteGravado="[\d.]+" ImporteExento="[\d.]+"\/>/, (m, pre) => `${pre}ImporteGravado="0.00" ImporteExento="0.00"/>`)],
  // MX-053: Deducciones
  ["TotalImpuestosRetenidos off by one cent", "MX-053", (t) => sub(t, / TotalImpuestosRetenidos="([\d.]+)"/, (m, v) => ` TotalImpuestosRetenidos="${bump(v, 0.01)}"`)],
  ["TotalOtrasDeducciones dropped", "MX-053", (t) => sub(t, / TotalOtrasDeducciones="[\d.]+"/, () => "")],
  ["ISR coded as another deduction", "MX-053", (t) => sub(t, / TipoDeduccion="002"/, () => ' TipoDeduccion="004"')],
  // MX-054: OtrosPagos
  ["subsidy without SubsidioAlEmpleo", "MX-054", (t) => sub(t, /\s*<nomina12:SubsidioAlEmpleo [^>]*\/>/, () => "")],
  ["subsidy paid above the subsidy owed", "MX-054", (t) => sub(t, / SubsidioCausado="[\d.]+"/, () => ' SubsidioCausado="0.00"')],
  ["refund balance from two years back", "MX-054", (t) => sub(t, / Año="(\d{4})"/, (m, y) => ` Año="${Number(y) - 1}"`)],
  ["remainder above the balance", "MX-054", (t) => sub(t, / SaldoAFavor="[\d.]+"/, () => ' SaldoAFavor="100.00"')],
  ["an other payment of 0", "MX-054", (t) => sub(t, /(<nomina12:OtroPago [^>]*?)Importe="[\d.]+"/, (m, pre) => `${pre}Importe="0.00"`)],
  // MX-055: dates and periods
  ["period start after its end", "MX-055", (t) => sub(t, / FechaInicialPago="(\d{4})-/, (m, y) => ` FechaInicialPago="${Number(y) + 1}-`)],
  ["ordinary payroll with periodicity 99", "MX-055", (t) => (/ TipoNomina="O"/.test(t) ? sub(t, / PeriodicidadPago="\d+"/, () => ' PeriodicidadPago="99"') : null)],
  ["extraordinary payroll with a fortnightly periodicity", "MX-055", (t) => (/ TipoNomina="E"/.test(t) ? sub(t, / PeriodicidadPago="\d+"/, () => ' PeriodicidadPago="04"') : null)],
  ["seniority longer than the job", "MX-055", (t) => sub(t, / Antigüedad="[^"]+"/, () => ' Antigüedad="P9999W"')],
  // MX-056: employment data
  ["RegistroPatronal dropped on an employment contract", "MX-056", (t) => sub(t, /<nomina12:Emisor RegistroPatronal="[^"]*"\/>/, () => "<nomina12:Emisor/>")],
  ["employment contract with regime 09 (fees)", "MX-056", (t) => sub(t, / TipoRegimen="02"/, () => ' TipoRegimen="09"')],
  ["CURP one character changed", "MX-056", (t) => sub(t, /(<nomina12:Receptor Curp="[A-Z]{4}\d{5})(\d)/, (m, pre, d) => `${pre}${(Number(d) + 1) % 10}`)],
  ["CLABE one digit changed", "MX-056", (t) => sub(t, / CuentaBancaria="(\d{17})(\d)"/, (m, a, d) => ` CuentaBancaria="${a}${(Number(d) + 1) % 10}"`)],
  ["11-digit account without Banco", "MX-056", (t) => sub(t, / Banco="\d+"( CuentaBancaria="\d{11}")/, (m, c) => c)],
  ["SubContratacion shares add to 90%", "MX-056", (t) => sub(t, / PorcentajeTiempo="40\.000"/, () => ' PorcentajeTiempo="30.000"')],
  ["NumSeguridadSocial dropped with a RegistroPatronal", "MX-056", (t) => sub(t, / NumSeguridadSocial="\d+"/, () => "")],
  // MX-057: disability
  ["Incapacidades removed with a disability subsidy", "MX-057", (t) => sub(t, /\s*<nomina12:Incapacidades>[\s\S]*?<\/nomina12:Incapacidades>/, () => "")],
  ["disability amount off by one peso", "MX-057", (t) => sub(t, / ImporteMonetario="([\d.]+)"/, (m, v) => ` ImporteMonetario="${bump(v, 1)}"`)],
];

function sub(text, re, fn) {
  if (!re.test(text)) return null;
  return text.replace(re, fn);
}

// Move the header and concept Descuento by `d` together, so only the tie to
// TotalDeducciones breaks (MX-031 and MX-035 still hold if Total moves too).
function moveDiscount(text, d) {
  const m = / Descuento="([\d.]+)"/.exec(text);
  if (!m) return null;
  const v = m[1], nv = bump(v, d);
  const total = / Total="([\d.]+)"/.exec(text)[1];
  return text.replaceAll(` Descuento="${v}"`, ` Descuento="${nv}"`).replace(` Total="${total}"`, ` Total="${bump(total, -d)}"`);
}

export function runMutations(text) {
  const clean = checkCfdi(text).findings.filter((f) => NOMINA_RULE.test(f.rule));
  const results = [];
  for (const [name, rule, mutate] of MUTATIONS) {
    const mutated = mutate(text);
    if (mutated === null || mutated === text) { results.push({ name, rule, status: "skipped" }); continue; }
    const got = checkCfdi(mutated).findings.map((f) => f.rule);
    results.push({ name, rule, status: got.includes(rule) ? "caught" : "missed", got: [...new Set(got)] });
  }
  return { clean, results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) files.push(...["cfdi-4.0-nomina.xml", "cfdi-4.0-nomina-finiquito.xml"].map((f) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url))));
  let caught = 0, ran = 0, cleanTotal = 0;
  for (const f of files) {
    const { clean, results } = runMutations(readFileSync(f, "utf8"));
    cleanTotal += clean.length;
    console.log(`${f.split("/").pop()}: clean findings ${clean.length ? clean.map((c) => c.rule).join(",") : "none"}`);
    for (const r of results) {
      if (r.status === "skipped") continue;
      ran++;
      if (r.status === "caught") caught++;
      else console.log(`  MISSED ${r.name} (${r.rule}); got ${r.got.join(",") || "nothing"}`);
    }
  }
  console.log(`${caught} of ${ran} planted defects caught by the rule named for them over ${files.length} files; ${cleanTotal} Nómina findings on the clean files`);
}
