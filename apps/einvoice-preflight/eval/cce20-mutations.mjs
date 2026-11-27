// Planted-defect run for the Comercio Exterior 2.0 checks (cce20.mjs, MX-060..MX-069). Each
// mutation edits a clean export CFDI once and names the rule that should catch it; a
// mutation whose pattern is absent from a file is skipped, not counted. Every defect is a
// case SAT's error matrix (Matriz_de_Errores_CCE_v2.0.xls) gives a CCE code for; the code
// is in the mutation's name.
//   node eval/cce20-mutations.mjs [file.xml ...]
//   (default: the five fixtures/cfdi-4.0-cce20-*.xml files)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCfdi } from "../cfdi.mjs";

const CCE_RULE = /^MX-06\d$/;
const sub = (t, re, fn) => (re.test(t) ? t.replace(re, fn) : null);
const isT = (t) => / TipoDeComprobante="T"/.test(t);
const onlyIE = (t, fn) => (isT(t) ? null : fn(t));
const onlyT = (t, fn) => (isT(t) ? fn(t) : null);
const cents = (v, d) => {
  const [i, f = ""] = v.split(".");
  const n = BigInt(i + f.padEnd(2, "0").slice(0, 2)) + BigInt(d);
  const s = n.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
};

// [name, expected rule, (text) => mutated text or null]
export const MUTATIONS = [
  // MX-060: the document
  ["CCE101 complement on a payment-type CFDI", "MX-060", (t) => sub(t, / TipoDeComprobante="[IT]"/, () => ' TipoDeComprobante="P"')],
  ["CCE104 Exportacion 02 without the complement", "MX-060", (t) => sub(t, /\s*<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, () => "")],
  ["CCE105 Exportacion 03 with the complement", "MX-060", (t) => sub(t, / Exportacion="02"/, () => ' Exportacion="03"')],
  ["CCE113 the complement twice", "MX-060", (t) => sub(t, /(<cce20:ComercioExterior [\s\S]*<\/cce20:ComercioExterior>)/, (m) => m + m)],
  ["CCE115 a payroll complement beside it", "MX-060", (t) => sub(t, /<\/cce20:ComercioExterior>/, (m) => `${m}<nomina12:Nomina xmlns:nomina12="http://www.sat.gob.mx/nomina12" Version="1.2"/>`)],
  // MX-061: the CFDI under an export
  ["CCE106 InformacionGlobal on an export", "MX-061", (t) => sub(t, /(<cfdi:Emisor )/, (m) => `<cfdi:InformacionGlobal Periodicidad="01" Meses="11" Año="2026"/>${m}`)],
  ["CCE108 transfer to someone else", "MX-061", (t) => onlyT(t, (x) => sub(x, /<cfdi:Receptor Rfc="[^"]+"/, () => '<cfdi:Receptor Rfc="URE180429TM6"'))],
  ["CCE110 transfer line subject to tax", "MX-061", (t) => onlyT(t, (x) => sub(x, / ObjetoImp="01"/, () => ' ObjetoImp="02"'))],
  ["CCE111 ACuentaTerceros on an export line", "MX-061", (t) => sub(t, /(<cfdi:Concepto [^>]*?)(\/?)>/, (m, open, self) => `${open}><cfdi:ACuentaTerceros RfcACuentaTerceros="URE180429TM6" NombreACuentaTerceros="UNIVERSIDAD ROBOTICA ESPAÑOLA" RegimenFiscalACuentaTerceros="601" DomicilioFiscalACuentaTerceros="86991"/>${self ? "</cfdi:Concepto>" : ""}`)],
  ["CCE112 CuentaPredial on an export line", "MX-061", (t) => sub(t, /(<cfdi:Concepto [^>]*?)(\/?)>/, (m, open, self) => `${open}><cfdi:CuentaPredial Numero="123456"/>${self ? "</cfdi:Concepto>" : ""}`)],
  // MX-062: the header
  ["CCE102 transfer without MotivoTraslado", "MX-062", (t) => sub(t, / MotivoTraslado="\d+"/, () => "")],
  ["CCE103 MotivoTraslado on an invoice", "MX-062", (t) => onlyIE(t, (x) => sub(x, / ClaveDePedimento=/, () => ' MotivoTraslado="02" ClaveDePedimento='))],
  ["CCE117 MotivoTraslado 05 without Propietario", "MX-062", (t) => sub(t, / MotivoTraslado="\d+"/, () => ' MotivoTraslado="05"')],
  ["CCE116 MotivoTraslado 01 without the sale's UUID", "MX-062", (t) => sub(t, / MotivoTraslado="\d+"/, () => ' MotivoTraslado="01"')],
  ["CCE118 certificate of origin without its number", "MX-062", (t) => sub(t, / CertificadoOrigen="0"/, () => ' CertificadoOrigen="1"')],
  ["CCE118 certificate number with CertificadoOrigen 0", "MX-062", (t) => sub(t, / CertificadoOrigen="0"/, () => ' CertificadoOrigen="0" NumCertificadoOrigen="MX-2026-000123"')],
  ["CCE119 EU approved-exporter number to the US", "MX-062", (t) => sub(t, / CertificadoOrigen="0"/, (m) => `${m} NumeroExportadorConfiable="MXREX0123456"`)],
  ["CCE120 definitive export without Incoterm", "MX-062", (t) => sub(t, / Incoterm="[A-Z]+"/, () => "")],
  // MX-063: TotalUSD
  ["CCE122 TotalUSD off by one cent", "MX-063", (t) => sub(t, / TotalUSD="([\d.]+)"/, (m, v) => ` TotalUSD="${cents(v, 1)}"`)],
  // MX-064: the issuer
  ["CCE123 a company with a CURP", "MX-064", (t) => sub(t, /<cce20:Emisor>/, () => '<cce20:Emisor Curp="CABL840215MDFSRS01">')],
  ["CCE124 a person without a CURP", "MX-064", (t) => sub(t, /<cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"\/>/, () => '<cfdi:Emisor Rfc="CACX7605101P8" Nombre="XOCHILT CASAS CHAVEZ" RegimenFiscal="612"/>')],
  ["CCE125 issuer's address abroad", "MX-064", (t) => sub(t, /(<cce20:Emisor[^>]*><cce20:Domicilio [^>]*?)Pais="MEX"/, (m, pre) => `${pre}Pais="USA"`)],
  ["CCE126 issuer's state a US state", "MX-064", (t) => sub(t, /(<cce20:Emisor[^>]*><cce20:Domicilio [^>]*?)Estado="TAB"/, (m, pre) => `${pre}Estado="TX"`)],
  ["CCE127 municipality of another state", "MX-064", (t) => sub(t, /(<cce20:Emisor[^>]*><cce20:Domicilio [^>]*?)Municipio="004"/, (m, pre) => `${pre}Municipio="099"`)],
  ["CCE128 locality of another state", "MX-064", (t) => sub(t, /(<cce20:Emisor[^>]*><cce20:Domicilio [^>]*?)Municipio="004"/, (m, pre) => `${pre}Municipio="004" Localidad="06"`)],
  ["CCE130 postal code of another state", "MX-064", (t) => sub(t, /(<cce20:Emisor[^>]*><cce20:Domicilio [^>]*?)CodigoPostal="86000"/, (m, pre) => `${pre}CodigoPostal="64000"`)],
  // MX-065: the receiver
  ["CCE133 foreign receiver without NumRegIdTrib", "MX-065", (t) => sub(t, /<cce20:Receptor NumRegIdTrib="\d+">/, () => "<cce20:Receptor>")],
  ["CCE133 NumRegIdTrib for a Mexican receiver", "MX-065", (t) => onlyT(t, (x) => sub(x, /<cce20:Destinatario /, () => '<cce20:Receptor NumRegIdTrib="121585958"/><cce20:Destinatario '))],
  ["CCE135 US tax id with a dash", "MX-065", (t) => sub(t, /<cce20:Receptor NumRegIdTrib="(\d{2})(\d{7})">/, (m, a, b) => `<cce20:Receptor NumRegIdTrib="${a}-${b}">`)],
  ["CCE139 receiver's state spelled out", "MX-065", (t) => sub(t, /(<cce20:Receptor[^>]*><cce20:Domicilio [^>]*?)Estado="TX"/, (m, pre) => `${pre}Estado="Texas"`)],
  ["CCE140 receiver's ZIP code with four digits", "MX-065", (t) => sub(t, /(<cce20:Receptor[^>]*><cce20:Domicilio [^>]*?)CodigoPostal="\d+"/, (m, pre) => `${pre}CodigoPostal="7804"`)],
  // MX-066: owners and addressees
  ["CCE132 owner's US tax id too short", "MX-066", (t) => onlyT(t, (x) => sub(x, / MotivoTraslado="\d+"([\s\S]*?)(<cce20:Destinatario )/, (m, mid, d) => ` MotivoTraslado="05"${mid}<cce20:Propietario NumRegIdTrib="12345678" ResidenciaFiscal="USA"/>${d}`))],
  ["CCE142 transfer to two addressees", "MX-066", (t) => sub(t, /(<cce20:Destinatario [\s\S]*?<\/cce20:Destinatario>)/, (m) => m + m)],
  ["CCE144 addressee's US tax id with letters", "MX-066", (t) => sub(t, /<cce20:Destinatario NumRegIdTrib="\d+"/, () => '<cce20:Destinatario NumRegIdTrib="US98765432"')],
  ["CCE148 addressee's state spelled out", "MX-066", (t) => sub(t, /(<cce20:Destinatario[^>]*><cce20:Domicilio [^>]*?)Estado="TX"/, (m, pre) => `${pre}Estado="Texas"`)],
  ["CCE149 addressee's ZIP code with letters", "MX-066", (t) => sub(t, /(<cce20:Destinatario[^>]*><cce20:Domicilio [^>]*?)CodigoPostal="[^"]+"/, (m, pre) => `${pre}CodigoPostal="TX 78205"`)],
  // MX-067: goods against lines
  ["CCE151 line without NoIdentificacion", "MX-067", (t) => sub(t, /(<cfdi:Concepto [^>]*?) NoIdentificacion="[^"]+"/, (m, pre) => pre)],
  ["CCE152 Mercancia matching no line", "MX-067", (t) => sub(t, /<cce20:Mercancia NoIdentificacion="([^"]+)"/, (m, id) => `<cce20:Mercancia NoIdentificacion="${id}-X"`)],
  ["CCE153 Mercancia repeated", "MX-067", (t) => sub(t, /(<cce20:Mercancia [^>]*\/>)/, (m) => m + m)],
  ["CCE154 transfer quantity with 4 decimals", "MX-067", (t) => onlyT(t, (x) => sub(x, / Cantidad="12\.000"/, () => ' Cantidad="12.0000"'))],
  ["CCE155 transfer unit spelled out", "MX-067", (t) => onlyT(t, (x) => sub(x, / Unidad="06"/, () => ' Unidad="Pieza"'))],
  ["CCE156 transfer unit value with 3 decimals", "MX-067", (t) => onlyT(t, (x) => sub(x, / ValorUnitario="15240\.50"/, () => ' ValorUnitario="15240.500"'))],
  ["CCE165 CantidadAduana without the other two", "MX-067", (t) => sub(t, / UnidadAduana="\d+" ValorUnitarioAduana="[\d.]+"/, () => "")],
  ["CCE166 one Mercancia with customs fields, one without", "MX-067", (t) => sub(t, /(<cce20:Mercancia NoIdentificacion="([^"]+)" FraccionArancelaria="(\d+)" CantidadAduana[^>]*\/>)/, (m, whole, id, fr) => `${whole}<cce20:Mercancia NoIdentificacion="${id}" FraccionArancelaria="9801000100" ValorDolares="1"/>`)],
  // MX-068: tariff code and customs unit
  ["CCE160 goods without FraccionArancelaria", "MX-068", (t) => sub(t, / FraccionArancelaria="\d+"/, () => "")],
  ["CCE170 service unit with a FraccionArancelaria", "MX-068", (t) => sub(t, / UnidadAduana="\d+"/, () => ' UnidadAduana="99"')],
  ["CCE159 service line (E48) with a FraccionArancelaria", "MX-068", (t) => sub(t, / ClaveUnidad="[A-Z0-9]+"/, () => ' ClaveUnidad="E48"')],
  ["CCE161 an 8-digit tariff code from CCE 1.1", "MX-068", (t) => sub(t, / FraccionArancelaria="(\d{8})\d{2}"/, (m, f) => ` FraccionArancelaria="${f}"`)],
  ["CCE161 a tariff code retired on 2024-03-22", "MX-068", (t) => sub(t, / FraccionArancelaria="\d+"/, () => ' FraccionArancelaria="9503002300"')],
  ["CCE161 UnidadAduana not the tariff's unit", "MX-068", (t) => sub(t, / UnidadAduana="(\d+)"/, (m, u) => ` UnidadAduana="${u === "06" ? "01" : "06"}"`)],
  ["CCE162 transfer line unit not the tariff's", "MX-068", (t) => onlyT(t, (x) => sub(x, / Unidad="06"/, () => ' Unidad="01"'))],
  ["CCE168 goods with unit customs value 0", "MX-068", (t) => sub(t, / ValorUnitarioAduana="[\d.]+"/, () => ' ValorUnitarioAduana="0.00"')],
  // MX-069: dollar values
  ["CCE171 ValorDolares off by one dollar against the customs quantity", "MX-069", (t) => sub(t, /( CantidadAduana="[^"]+"[^>]* ValorDolares=")([\d.]+)"/, (m, pre, v) => `${pre}${cents(v, 100)}"`)],
  ["CCE158 ValorDolares off by 10% against the line", "MX-069", (t) => onlyIE(t, (x) => sub(x, / CantidadAduana="([\d.]+)"/, (m, v) => ` CantidadAduana="${(Number(v) * 1.1).toFixed(3)}"`) && sub(sub(x, / CantidadAduana="([\d.]+)"/, (m, v) => ` CantidadAduana="${(Number(v) * 1.1).toFixed(3)}"`), / ValorDolares="([\d.]+)"/, (m, v) => ` ValorDolares="${(Number(v) * 1.1).toFixed(4)}"`))],
  ["CCE172 transfer ValorDolares off by one dollar", "MX-069", (t) => onlyT(t, (x) => sub(x, / ValorDolares="([\d.]+)"/, (m, v) => ` ValorDolares="${cents(v, 100)}"`))],
  ["CCE172 ValorDolares 0 on goods", "MX-069", (t) => sub(t, /(<cce20:Mercancia [^>]*?)ValorDolares="[\d.]+"/, (m, pre) => `${pre}ValorDolares="0"`)],
  ["CCE164 samples worth more than their discount", "MX-069", (t) => onlyIE(t, (x) => sub(x, / FraccionArancelaria="\d+"/, () => ' FraccionArancelaria="9801000100"'))],
];

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

export const SEEDS = ["cfdi-4.0-cce20-mxn.xml", "cfdi-4.0-cce20-usd.xml", "cfdi-4.0-cce20-litre.xml", "cfdi-4.0-cce20-eur.xml", "cfdi-4.0-cce20-traslado.xml"];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) files.push(...SEEDS.map((f) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url))));
  let caught = 0, ran = 0, cleanTotal = 0;
  const hit = new Set();
  for (const f of files) {
    const { clean, results } = runMutations(readFileSync(f, "utf8"));
    cleanTotal += clean.length;
    console.log(`${f.split("/").pop()}: clean findings ${clean.length ? clean.map((c) => c.rule).join(",") : "none"}`);
    for (const r of results) {
      if (r.status === "skipped") continue;
      ran++;
      if (r.status === "caught") { caught++; hit.add(r.name); } else console.log(`  MISSED ${r.name} (${r.rule}); got ${r.got.join(",") || "nothing"}`);
    }
  }
  console.log(`${caught} of ${ran} planted defects caught by the rule named for them over ${files.length} files (${hit.size} of ${MUTATIONS.length} mutations ran and were caught somewhere); ${cleanTotal} findings on the clean files`);
}
