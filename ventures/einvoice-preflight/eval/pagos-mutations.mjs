// Planted-defect run for the Pagos 2.0 checks (pagos20.mjs, MX-040..MX-049). Each
// mutation edits a clean type P CFDI once and names the rule that should catch it; a
// mutation whose pattern is absent from a file is skipped, not counted. Only findings
// MX-040..MX-049 count as the clean baseline, since some public sample files have
// their RFCs and UUIDs blanked (schema findings that are not this layer's concern).
//   node eval/pagos-mutations.mjs [file.xml ...]   (default: fixtures/cfdi-4.0-pago.xml)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCfdi } from "../cfdi.mjs";

const bump = (v, d) => (Number(v) + d).toFixed(v.includes(".") ? Math.max(2, v.split(".")[1].length) : 2);
const PAGOS_RULE = /^MX-04\d$/;

// [name, expected rule, (text) => mutated text or null]
export const MUTATIONS = [
  ["MontoTotalPagos off by one cent", "MX-049", (t) => sub(t, / MontoTotalPagos="([\d.]+)"/, (m, v) => ` MontoTotalPagos="${bump(v, 0.01)}"`)],
  ["TotalTrasladosImpuestoIVA16 off by one cent", "MX-049", (t) => sub(t, / TotalTrasladosImpuestoIVA16="([\d.]+)"/, (m, v) => ` TotalTrasladosImpuestoIVA16="${bump(v, 0.01)}"`)],
  ["TotalTrasladosBaseIVA16 dropped", "MX-049", (t) => sub(t, / TotalTrasladosBaseIVA16="[\d.]+"/, () => "")],
  ["TotalTrasladosBaseIVA8 added with no 8% payment", "MX-049", (t) => (/TasaOCuotaP="0\.080000"/.test(t) ? null : sub(t, /<pago20:Totales /, () => '<pago20:Totales TotalTrasladosBaseIVA8="100.00" '))],
  ["ImpSaldoInsoluto off by one cent", "MX-045", (t) => sub(t, / ImpSaldoInsoluto="([\d.]+)"/, (m, v) => ` ImpSaldoInsoluto="${bump(v, 0.01)}"`)],
  ["ImpPagado above the previous balance", "MX-045", (t) => sub(t, / ImpSaldoAnt="([\d.]+)" ImpPagado="[\d.]+"/, (m, v) => ` ImpSaldoAnt="${v}" ImpPagado="${bump(v, 1)}"`)],
  ["Monto one unit short", "MX-043", (t) => sub(t, /(<pago20:Pago [^>]*?)Monto="([\d.]+)"/, (m, pre, v) => `${pre}Monto="${bump(v, -1)}"`)],
  ["EquivalenciaDR 1.5 in the payment's own currency", "MX-044", (t) => sub(t, /(<pago20:Pago [^>]*?MonedaP="([A-Z]{3})"[^>]*>\s*<pago20:DoctoRelacionado [^>]*?MonedaDR="\2" )EquivalenciaDR="1"/, (m, pre) => `${pre}EquivalenciaDR="1.5"`)],
  ["EquivalenciaDR dropped across currencies", "MX-044", (t) => {
    const m = [...t.matchAll(/<pago20:Pago [^>]*?MonedaP="([A-Z]{3})"[\s\S]*?<\/pago20:Pago>/g)].find((p) => new RegExp(`MonedaDR="(?!${p[1]})[A-Z]{3}" EquivalenciaDR="[\\d.]+"`).test(p[0]));
    if (!m) return null;
    const fixed = m[0].replace(new RegExp(`(MonedaDR="(?!${m[1]})[A-Z]{3}") EquivalenciaDR="[\\d.]+"`), "$1");
    return t.slice(0, m.index) + fixed + t.slice(m.index + m[0].length);
  }],
  ["TrasladoP ImporteP off by one cent", "MX-048", (t) => sub(t, /(<pago20:TrasladoP [^>]*?)ImporteP="([\d.]+)"/, (m, pre, v) => `${pre}ImporteP="${bump(v, 0.01)}"`)],
  ["TrasladoP BaseP off by one unit", "MX-048", (t) => sub(t, /(<pago20:TrasladoP [^>]*?)BaseP="([\d.]+)"/, (m, pre, v) => `${pre}BaseP="${bump(v, 1)}"`)],
  ["RetencionP ImporteP off by one unit", "MX-048", (t) => sub(t, /(<pago20:RetencionP [^>]*?)ImporteP="([\d.]+)"/, (m, pre, v) => `${pre}ImporteP="${bump(v, 1)}"`)],
  ["TrasladoP rate 16% written as 8%", "MX-048", (t) => sub(t, /(<pago20:TrasladoP [^>]*?)TasaOCuotaP="0\.160000"/, (m, pre) => `${pre}TasaOCuotaP="0.080000"`)],
  ["ImpuestosP removed", "MX-048", (t) => sub(t, /\s*<pago20:ImpuestosP>[\s\S]*?<\/pago20:ImpuestosP>/, () => "")],
  ["TrasladoDR ImporteDR doubled", "MX-047", (t) => sub(t, /(<pago20:TrasladoDR [^>]*?TipoFactorDR="Tasa"[^>]*?TasaOCuotaDR="0\.160000"[^>]*?)ImporteDR="([\d.]+)"/, (m, pre, v) => `${pre}ImporteDR="${bump(v, Number(v))}"`)],
  ["FormaDePagoP 99", "MX-042", (t) => sub(t, / FormaDePagoP="\d+"/, () => ' FormaDePagoP="99"')],
  ["MXN payment with rate 17", "MX-042", (t) => sub(t, / MonedaP="MXN" TipoCambioP="1"/, () => ' MonedaP="MXN" TipoCambioP="17"')],
  ["ObjetoImpDR 01 with taxes", "MX-046", (t) => sub(t, /(<pago20:DoctoRelacionado [^>]*?)ObjetoImpDR="02"(>\s*<pago20:ImpuestosDR)/, (m, pre, post) => `${pre}ObjetoImpDR="01"${post}`)],
  ["UsoCFDI G03 on a payment", "MX-040", (t) => sub(t, / UsoCFDI="CP01"/, () => ' UsoCFDI="G03"')],
  ["payment concept with a product key", "MX-040", (t) => sub(t, / ClaveProdServ="84111506"/, () => ' ClaveProdServ="01010101"')],
  ["Moneda MXN on a payment", "MX-040", (t) => sub(t, /(<cfdi:Comprobante[^>]*?) Moneda="XXX"/, (m, pre) => `${pre} Moneda="MXN"`)],
  ["Pagos in an income CFDI", "MX-040", (t) => sub(t, / TipoDeComprobante="P"/, () => ' TipoDeComprobante="I"')],
  ["Pagos complement removed", "MX-040", (t) => sub(t, /\s*<pago20:Pagos\b[\s\S]*<\/pago20:Pagos>/, () => "")],
];

function sub(text, re, fn) {
  if (!re.test(text)) return null;
  return text.replace(re, fn);
}

export function runMutations(text) {
  const clean = checkCfdi(text).findings.filter((f) => PAGOS_RULE.test(f.rule));
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
  if (!files.length) files.push(fileURLToPath(new URL("../fixtures/cfdi-4.0-pago.xml", import.meta.url)));
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
  console.log(`${caught} of ${ran} planted defects caught by the rule named for them over ${files.length} files; ${cleanTotal} Pagos findings on the clean files`);
}
