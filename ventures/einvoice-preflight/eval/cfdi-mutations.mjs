// Planted-defect run for the CFDI 4.0 checker (cfdi.mjs). Each mutation edits a
// clean CFDI's text once and names the rule that should catch it. A mutation whose
// pattern is absent from a file is skipped, not counted.
//   node eval/cfdi-mutations.mjs [file.xml ...]   (default: fixtures/cfdi-4.0-invoice.xml)
// Prints, per file, clean findings (should be none) and each mutation's verdict.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCfdi } from "../cfdi.mjs";

const bump = (v, d) => (Number(v) + d).toFixed(v.includes(".") ? v.split(".")[1].length : 0);

// [name, expected rule, (text) => mutated text or null]
export const MUTATIONS = [
  ["SubTotal off by one cent", "MX-030", (t) => sub(t, / SubTotal="([\d.]+)"/, (m, v) => ` SubTotal="${bump(v, 0.01)}"`)],
  ["Total off by one peso", "MX-035", (t) => sub(t, /(<cfdi:Comprobante[^>]*?) Total="([\d.]+)"/, (m, pre, v) => `${pre} Total="${bump(v, 1)}"`)],
  ["line Importe doubled", "MX-020", (t) => sub(t, /(<cfdi:Concepto [^>]*?)Importe="([\d.]+)"/, (m, pre, v) => `${pre}Importe="${bump(v, Number(v) || 1)}"`)],
  ["line tax amount off by 1", "MX-024", (t) => sub(t, /(<cfdi:Traslado [^>]*TipoFactor="Tasa"[^>]*?)Importe="([\d.]+)"/, (m, pre, v) => `${pre}Importe="${bump(v, 1)}"`)],
  ["summary tax amount off by 1", "MX-034", (t) => subLast(t, /(<cfdi:Traslado [^>]*?)Importe="([\d.]+)"/g, (m, pre, v) => `${pre}Importe="${bump(v, 1)}"`)],
  ["Exportacion dropped", "MX-002", (t) => sub(t, / Exportacion="\d+"/, () => "")],
  ["FormaPago not in c_FormaPago", "MX-003", (t) => sub(t, / FormaPago="\d+"/, () => ' FormaPago="07"')],
  ["UsoCFDI not in c_UsoCFDI", "MX-003", (t) => sub(t, / UsoCFDI="[A-Z0-9]+"/, () => ' UsoCFDI="G09"')],
  ["ClaveUnidad not in c_ClaveUnidad", "MX-003", (t) => sub(t, / ClaveUnidad="[A-Z0-9]+"/, () => ' ClaveUnidad="ZZZ9"')],
  ["ClaveProdServ not in c_ClaveProdServ", "MX-003", (t) => sub(t, / ClaveProdServ="\d+"/, () => ' ClaveProdServ="99999999"')],
  ["LugarExpedicion not a postal code", "MX-003", (t) => sub(t, / LugarExpedicion="\d+"/, () => ' LugarExpedicion="8600"')],
  ["issuer RFC one digit changed", "MX-007", (t) => sub(t, /(<cfdi:Emisor [^>]*?Rfc="[A-Z&Ñ]{3,4}\d{5})(\d)/, (m, pre, d) => `${pre}${(Number(d) + 3) % 10}`)],
  ["Receptor before Emisor", "MX-005", (t) => sub(t, /(\s*<cfdi:Emisor [^>]*\/>)(\s*<cfdi:Receptor [^>]*\/>)/, (m, e, r) => `${r}${e}`)],
  ["MXN with an exchange rate", "MX-011", (t) => (/ TipoCambio=/.test(t) || !/ Moneda="MXN"/.test(t) ? null : t.replace(/ Moneda="MXN"/, ' Moneda="MXN" TipoCambio="17.50"'))],
  ["PPD with a real payment form", "MX-013", (t) => (!/ FormaPago="\d+"/.test(t) ? null : sub(t.replace(/ FormaPago="\d+"/, ' FormaPago="03"'), / MetodoPago="PUE"/, () => ' MetodoPago="PPD"'))],
  ["ObjetoImp 01 on a taxed line", "MX-022", (t) => sub(t, / ObjetoImp="02"/, () => ' ObjetoImp="01"')],
  ["tax summary removed", "MX-032", (t) => sub(t, /\s*<cfdi:Impuestos Total[\s\S]*?<\/cfdi:Impuestos>/, () => "")],
  ["Total with three decimals", "MX-010", (t) => sub(t, /(<cfdi:Comprobante[^>]*?) Total="(\d+\.\d{2})"/, (m, pre, v) => `${pre} Total="${v}0"`)],
  ["Version 3.3", "MX-001", (t) => sub(t, / Version="4\.0"/, () => ' Version="3.3"')],
  ["summary rate changed to 8%", "MX-034", (t) => subLast(t, /(<cfdi:Traslado [^>]*?)TasaOCuota="0\.160000"/g, (m, pre) => `${pre}TasaOCuota="0.080000"`)],
  ["misspelt attribute", "MX-004", (t) => sub(t, /<cfdi:Emisor Rfc=/, () => "<cfdi:Emisor RFC=")],
  ["general public with UsoCFDI G03", "MX-014", (t) => sub(t, /(<cfdi:Receptor [^>]*?)Rfc="[A-Z&Ñ0-9]+"/, (m, pre) => `${pre}Rfc="XAXX010101000"`)],
  ["exempt line with a rate", "MX-023", (t) => sub(t, /(<cfdi:Traslado [^>]*?)TipoFactor="Tasa"/, (m, pre) => `${pre}TipoFactor="Exento"`)],
  ["line discount above the amount", "MX-021", (t) => sub(t, /(<cfdi:Concepto [^>]*?Importe="([\d.]+)"[^>]*?)Descuento="[\d.]+"/, (m, pre, v) => `${pre}Descuento="${bump(v, 1)}"`)],
];

function sub(text, re, fn) {
  if (!re.test(text)) return null;
  return text.replace(re, fn);
}
// The last match: the summary rows follow the line rows.
function subLast(text, re, fn) {
  const all = [...text.matchAll(re)];
  if (!all.length) return null;
  const m = all[all.length - 1];
  return text.slice(0, m.index) + fn(...m) + text.slice(m.index + m[0].length);
}

export function runMutations(text) {
  const clean = checkCfdi(text).findings;
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
  if (!files.length) files.push(fileURLToPath(new URL("../fixtures/cfdi-4.0-invoice.xml", import.meta.url)));
  let caught = 0, ran = 0;
  for (const f of files) {
    const { clean, results } = runMutations(readFileSync(f, "utf8"));
    console.log(`\n${f}\n  clean: ${clean.length ? clean.map((x) => x.rule).join(", ") : "no findings"}`);
    for (const r of results) {
      console.log(`  ${r.status.padEnd(7)} ${r.rule}  ${r.name}${r.status === "missed" ? `  (got ${r.got.join(", ") || "nothing"})` : ""}`);
      if (r.status !== "skipped") { ran++; if (r.status === "caught") caught++; }
    }
  }
  console.log(`\n${caught} of ${ran} planted defects caught by the rule named for them`);
}
