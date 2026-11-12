// Reads SAT's CFDI 4.0 schema (cfdv40.xsd), its data types (tdCFDI.xsd), its
// catalogues (catCFDI.xsd), the Pagos 2.0 complement (Pagos20.xsd, catPagos.xsd) and the
// Nómina 1.2 complement (nomina12.xsd, catNomina.xsd) and the Comercio Exterior 2.0
// complement (ComercioExterior20.xsd, catComExt.xsd) and the Carta Porte 3.1 complement
// (CartaPorte31.xsd, catCartaPorte.xsd) into cfdi-xsd-data.mjs, the table
// cfdi.mjs checks files against:
//   node build-cfdi-schema.mjs [dir holding the eleven .xsd files]
// Without a directory it downloads the eleven files from the phpcfdi/resources-sat-xml
// mirror on GitHub (public domain, a byte copy of www.sat.gob.mx/sitio_internet/cfd/,
// which did not answer from the build host on 2026-11-12). The XSDs are not copied into
// the tree: the data module holds facts read from them (element order and occurrence,
// attribute use, length, pattern, digit facets and catalogue codes). The two largest
// catalogues are stored as runs of consecutive numbers: c_ClaveProdServ (52,747 codes)
// and c_CodigoPostal (95,777 codes in 15 runs). catComExt's c_FraccionArancelaria (26,092
// codes of 8 and 10 digits, most of them retired) is not stored: cce20.mjs checks the
// tariff code against the codes in force on the CFDI's date, from cce20-data.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCfdiXml } from "./cfdi-xml.mjs";

const MIRROR = "https://raw.githubusercontent.com/phpcfdi/resources-sat-xml/master/resources/www.sat.gob.mx/sitio_internet/cfd";
const FILES = { cfdv40: "4/cfdv40.xsd", tdCFDI: "tipoDatos/tdCFDI/tdCFDI.xsd", catCFDI: "catalogos/catCFDI.xsd",
  pagos20: "Pagos/Pagos20.xsd", catPagos: "catalogos/Pagos/catPagos.xsd",
  nomina12: "nomina/nomina12.xsd", catNomina: "catalogos/Nomina/catNomina.xsd",
  cce20: "ComercioExterior20/ComercioExterior20.xsd", catComExt: "catalogos/ComExt/catComExt.xsd",
  cp31: "CartaPorte/CartaPorte31.xsd", catCartaPorte: "catalogos/CartaPorte/catCartaPorte.xsd" };

async function load(name) {
  const dir = process.argv[2];
  if (dir) return readFileSync(join(dir, FILES[name].split("/").pop()), "utf8");
  const res = await fetch(`${MIRROR}/${FILES[name]}`);
  if (!res.ok) throw new Error(`${FILES[name]}: HTTP ${res.status}`);
  return res.text();
}

const kids = (n, name) => n.children.filter((c) => c.name === name);
const kid = (n, name) => n.children.find((c) => c.name === name);
const local = (t) => (t || "").replace(/^.*:/, "");

// A simple type as plain facts: {base, pattern, length, minLength, maxLength,
// fractionDigits, minInclusive, maxInclusive, collapse, enum | runs | ref}.
function simple(node) {
  const r = kid(node, "restriction");
  if (!r) return { base: "string" };
  const out = { base: local(r.attrs.base) };
  const en = [];
  for (const f of r.children) {
    const v = f.attrs.value;
    if (f.name === "enumeration") en.push(v);
    else if (f.name === "pattern") out.pattern = v;
    else if (f.name === "whiteSpace") { if (v === "collapse") out.collapse = true; }
    else if (["length", "minLength", "maxLength", "fractionDigits", "totalDigits"].includes(f.name)) out[f.name] = Number(v);
    else if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(f.name)) out[f.name] = v;
  }
  if (en.length) {
    if (en.length > 3000 && en.every((x) => /^\d+$/.test(x)) && new Set(en.map((x) => x.length)).size === 1) {
      out.width = en[0].length;
      out.runs = runs(en.map(Number));
    } else if (en.length > 3000 && en.filter((x) => CODE_RE.test(x)).length > en.length * 0.9) {
      // Prefix + digits, maybe a decimal part (c_Estaciones EA0001 and VC117.2,
      // c_MaterialPeligroso M0004): runs per groupKey(), so "EF552" and "EF0552" stay
      // distinct codes; codes of any other shape are kept as written in `extra`.
      const g = {}, extra = [];
      for (const x of en) {
        const k = groupKey(x);
        if (!k) { extra.push(x); continue; }
        (g[k[0]] ||= []).push(k[1]);
      }
      out.groups = Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, packRuns(runs(v))]));
      if (extra.length) out.extra = extra;
    } else out.enum = en;
  }
  return out;
}

// A code's run group and number: "A1769.8" is group "A|4|1", number 17698. Mirrors
// cfdi.mjs's groupKey.
const CODE_RE = /^(\D*?)(\d+)(?:\.(\d+))?$/u;
function groupKey(x) {
  const m = x.match(CODE_RE);
  if (!m || m[2].length + (m[3] || "").length > 15) return null;
  return [`${m[1]}|${m[2].length}|${(m[3] || "").length}`, Number(m[2] + (m[3] || ""))];
}

// Sorted integers as [start, length] runs.
function runs(nums) {
  const n = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (const x of n) {
    const last = out[out.length - 1];
    if (last && last[0] + last[1] === x) last[1]++;
    else out.push([x, 1]);
  }
  return out;
}

// Runs as one string: per run, the gap from the previous run's end and, when above 1, the
// run's length, both base 36 ("gap" or "gap.len"), comma-separated. cfdi.mjs unpacks it.
function packRuns(rs) {
  let end = 0;
  return rs.map(([start, len]) => {
    const t = (start - end).toString(36) + (len > 1 ? "." + len.toString(36) : "");
    end = start + len;
    return t;
  }).join(",");
}

function typeRef(attrType, inline) {
  if (inline) return simple(inline);
  const t = local(attrType);
  if (!t) return { base: "string" };
  if (/^(string|decimal|int|short|date|dateTime)$/.test(t)) return { base: t };
  return { ref: t };
}

// An element: {attrs: [{n, req, type}], seq: [{el, min, max}], any: bool}.
function element(node, out, path) {
  const ct = kid(node, "complexType");
  const def = { attrs: [], seq: [], any: false };
  out[path] = def;
  if (!ct) return;
  for (const a of kids(ct, "attribute")) {
    def.attrs.push({ n: a.attrs.name, req: a.attrs.use === "required", type: typeRef(a.attrs.type, kid(a, "simpleType")),
      ...(a.attrs.fixed !== undefined && { fixed: a.attrs.fixed }) });
  }
  const seq = kid(ct, "sequence") || kid(ct, "choice");
  if (seq) {
    if (seq.name === "choice") def.choice = true;
    for (const c of seq.children) {
      if (c.name === "any") { def.any = true; continue; }
      if (c.name !== "element") continue;
      const max = c.attrs.maxOccurs === "unbounded" ? -1 : Number(c.attrs.maxOccurs ?? 1);
      def.seq.push({ el: c.attrs.name, min: Number(c.attrs.minOccurs ?? 1), max });
      element(c, out, `${path}/${c.attrs.name}`);
    }
  }
}

const cfdv40 = parseCfdiXml(await load("cfdv40")).root;
const td = parseCfdiXml(await load("tdCFDI")).root;
const cat = parseCfdiXml(await load("catCFDI")).root;

const pagos20 = parseCfdiXml(await load("pagos20")).root;
const catPagos = parseCfdiXml(await load("catPagos")).root;

const nomina12 = parseCfdiXml(await load("nomina12")).root;
const catNomina = parseCfdiXml(await load("catNomina")).root;

const cce20 = parseCfdiXml(await load("cce20")).root;
const catComExt = parseCfdiXml(await load("catComExt")).root;

const cp31 = parseCfdiXml(await load("cp31")).root;
const catCartaPorte = parseCfdiXml(await load("catCartaPorte")).root;

const types = {};
for (const s of [...kids(td, "simpleType"), ...kids(cat, "simpleType"), ...kids(catPagos, "simpleType"), ...kids(catNomina, "simpleType"), ...kids(catComExt, "simpleType"), ...kids(catCartaPorte, "simpleType")]) {
  if (types[s.attrs.name]) throw new Error(`two catalogues define ${s.attrs.name}`);
  types[s.attrs.name] = s.attrs.name === "c_FraccionArancelaria" ? { base: "string", collapse: true } : simple(s);
}
const elements = {};
element(kids(cfdv40, "element").find((e) => e.attrs.name === "Comprobante"), elements, "Comprobante");
// The Pagos 2.0 complement (Complemento para recepción de pagos), keyed under "Pagos".
element(kids(pagos20, "element").find((e) => e.attrs.name === "Pagos"), elements, "Pagos");
// The Nómina 1.2 complement (recibo de pago de nómina), keyed under "Nomina".
element(kids(nomina12, "element").find((e) => e.attrs.name === "Nomina"), elements, "Nomina");
// The Comercio Exterior 2.0 complement (exports), keyed under "ComercioExterior".
element(kids(cce20, "element").find((e) => e.attrs.name === "ComercioExterior"), elements, "ComercioExterior");
// The Carta Porte 3.1 complement (goods in transit by road, sea, air or rail), keyed under "CartaPorte".
element(kids(cp31, "element").find((e) => e.attrs.name === "CartaPorte"), elements, "CartaPorte");

const body = `// Generated by build-cfdi-schema.mjs from SAT's cfdv40.xsd, tdCFDI.xsd, catCFDI.xsd,
// Pagos20.xsd, catPagos.xsd, nomina12.xsd, catNomina.xsd, ComercioExterior20.xsd, catComExt.xsd, CartaPorte31.xsd and catCartaPorte.xsd (phpcfdi/resources-sat-xml mirror, public domain). Do not edit by hand; rebuild.
export const ELEMENTS = ${JSON.stringify(elements)};
export const TYPES = ${JSON.stringify(types)};
`;
writeFileSync(new URL("./cfdi-xsd-data.mjs", import.meta.url), body);
console.log(`elements ${Object.keys(elements).length}, types ${Object.keys(types).length}, ${body.length} bytes`);
