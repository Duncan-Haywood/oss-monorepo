// Reads NAV's Online Számla 3.0 invoice data schema (invoiceData.xsd, the
// invoiceBase.xsd it imports, and the NTCA common 1.0 schema common.xsd that both
// import) into hu-xsd-data.mjs, the table hu-xsd.mjs checks InvoiceData files against:
//   node build-hu-schema.mjs [dir holding invoiceData.xsd, invoiceBase.xsd, common.xsd]
// Without a path it clones nav-gov-hu/Online-Invoice (MIT, (c) 2019 NAV) for the two
// OSA files. NAV's repository does not carry common.xsd (the NTCA common schema,
// "v1.0 2020/11/23"); it is fetched from a public mirror and must match the SHA-256
// below, which three independent mirrors agreed on (CRLF line ends normalised) on
// 2026-11-15: B-D-S-C-Kft/navservice v3.0/original, robser77/e_invoice_check and
// pzs/nav-online-invoice (the last with LF line ends).
// The XSD is not copied into the tree: the data module holds only facts read from it
// (content models with occurrence counts, attributes, and the length, pattern, range,
// digit and enumeration facets). Types are keyed by namespace: "data:", "base:" and
// "common:"; each element carries `ns`, the namespace its name must be written in. It throws on any construct it does not model rather than dropping it.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlTree } from "./ubl.mjs";

const COMMON_SHA256 = "0860ed0475c9c8c35bc31206c5ed2128542236d32b640f0000a80523ff557005"; // after CRLF -> LF
const COMMON_URL = "https://raw.githubusercontent.com/B-D-S-C-Kft/navservice/c59a61f3e12d25651475166d0235f0c07327c921/v3.0/original/common.xsd";
const NS = {
  "http://schemas.nav.gov.hu/OSA/3.0/data": "data",
  "http://schemas.nav.gov.hu/OSA/3.0/base": "base",
  "http://schemas.nav.gov.hu/NTCA/1.0/common": "common",
  "http://www.w3.org/2001/XMLSchema": "xs",
};

let dir = process.argv[2];
let source = "local copy";
if (!dir) {
  const tmp = mkdtempSync(join(tmpdir(), "nav-xsd-"));
  execFileSync("git", ["clone", "-q", "--depth", "1", "https://github.com/nav-gov-hu/Online-Invoice.git", join(tmp, "oi")]);
  dir = join(tmp, "oi/src/schemas/nav/gov/hu/OSA");
  execFileSync("curl", ["-sSfL", "-o", join(dir, "common.xsd"), COMMON_URL]);
  const sha = execFileSync("git", ["-C", join(tmp, "oi"), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  source = `nav-gov-hu/Online-Invoice ${sha.slice(0, 12)}`;
}
const read = (f) => readFileSync(join(dir, f), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const commonText = read("common.xsd");
const got = createHash("sha256").update(commonText).digest("hex");
if (got !== COMMON_SHA256) throw new Error(`common.xsd SHA-256 ${got} is not the NTCA common 1.0 file this table was checked against`);

const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
const UNSUPPORTED = new Set(["any", "group", "list", "union", "key", "unique", "keyref", "all", "attributeGroup", "anyAttribute", "include", "redefine"]);
const complex = {};
const simple = {};
const roots = [];
let prefixes = {}; // this file's prefix -> our key ("" is the default namespace)
let own = "";

const q = (name) => {
  if (!name) return name;
  const i = name.indexOf(":");
  const p = i < 0 ? "" : name.slice(0, i);
  const local = i < 0 ? name : name.slice(i + 1);
  const key = prefixes[p];
  if (!key) throw new Error(`unknown prefix in ${name}`);
  return key === "xs" ? local : `${key}:${local}`;
};

function noUnsupported(node) {
  for (const c of node.children) {
    if (UNSUPPORTED.has(c.name)) throw new Error(`XSD construct <${c.name}> is not modelled`);
    if (c.attrs?.ref) throw new Error("XSD ref= is not modelled");
    noUnsupported(c);
  }
}

function simpleDef(node) {
  const r = node.children.find((c) => c.name === "restriction");
  if (!r) throw new Error("only <restriction> simple types are modelled");
  const s = { base: q(r.attrs.base) };
  const patterns = [];
  const enums = [];
  for (const f of r.children) {
    const v = f.attrs?.value;
    if (f.name === "pattern") patterns.push(v);
    else if (f.name === "enumeration") enums.push(v);
    else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits"].includes(f.name)) s[f.name] = Number(v);
    else if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(f.name)) s[f.name] = /^\d{4}-/.test(v) ? v : Number(v);
    else if (f.name === "whiteSpace") s.whiteSpace = v;
    else if (f.name !== "annotation") throw new Error(`facet <${f.name}> is not modelled`);
  }
  if (patterns.length) s.pattern = patterns;
  if (enums.length) s.enum = enums;
  return s;
}

let anon = 0;
function attrDef(a) {
  let type = q(a.attrs.type);
  const inline = a.children.find((c) => c.name === "simpleType");
  if (inline) { type = `#attr${++anon}`; simple[type] = simpleDef(inline); }
  return { name: a.attrs.name, type: type ?? "string", use: a.attrs.use ?? "optional", ...(a.attrs.fixed !== undefined && { fixed: a.attrs.fixed }) };
}

function particle(node, path) {
  if (node.name === "element") {
    let type = q(node.attrs.type);
    const inlineC = node.children.find((c) => c.name === "complexType");
    const inlineS = node.children.find((c) => c.name === "simpleType");
    if (inlineC) { type = `#${path}/${node.attrs.name}`; complexDef(inlineC, type); }
    else if (inlineS) { type = `#${path}/${node.attrs.name}`; simple[type] = simpleDef(inlineS); }
    return { k: "e", name: node.attrs.name, type, ns: own, ...occurs(node), ...(node.attrs.fixed !== undefined && { fixed: node.attrs.fixed }), ...(node.attrs.default !== undefined && { default: node.attrs.default }) }; // elementFormDefault="qualified" in all three files
  }
  if (node.name === "sequence" || node.name === "choice") {
    const items = node.children.filter((c) => ["element", "sequence", "choice"].includes(c.name)).map((c) => particle(c, path));
    return { k: node.name === "sequence" ? "s" : "c", ...occurs(node), items };
  }
  throw new Error(`unexpected <${node.name}> in a content model`);
}

function complexDef(node, name) {
  const def = { model: null, attrs: [], text: null };
  let body = node;
  const cc = node.children.find((c) => c.name === "complexContent");
  const sc = node.children.find((c) => c.name === "simpleContent");
  if (cc || sc) {
    const ext = (cc || sc).children.find((c) => c.name === "extension");
    if (!ext) throw new Error("only <extension> is modelled in complex/simpleContent");
    if (sc) def.text = q(ext.attrs.base);
    else def.extends = q(ext.attrs.base);
    body = ext;
  }
  const model = body.children.find((c) => c.name === "sequence" || c.name === "choice");
  if (model) def.model = particle(model, name);
  def.attrs = body.children.filter((c) => c.name === "attribute").map(attrDef);
  complex[name] = def;
}

for (const f of ["common.xsd", "invoiceBase.xsd", "invoiceData.xsd"]) {
  const text = f === "common.xsd" ? commonText : read(f);
  const head = text.match(/<xs:schema\b[^>]*>/)[0];
  prefixes = {};
  for (const m of head.matchAll(/xmlns(?::([\w.-]+))?="([^"]+)"/g)) {
    if (!NS[m[2]]) throw new Error(`${f}: unknown namespace ${m[2]}`);
    prefixes[m[1] ?? ""] = NS[m[2]];
  }
  own = NS[head.match(/targetNamespace="([^"]+)"/)[1]];
  if (!/elementFormDefault="qualified"/.test(head)) throw new Error(`${f}: local elements are not qualified; the ns field would be wrong`);
  const schema = parseXmlTree(text).children.find((n) => n.name === "schema");
  noUnsupported(schema);
  for (const n of schema.children) {
    const key = `${own}:${n.attrs?.name}`;
    if (n.name === "complexType" || n.name === "simpleType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      if (n.name === "complexType") complexDef(n, key);
      else simple[key] = simpleDef(n);
    } else if (n.name === "element") {
      const inline = n.children.find((c) => c.name === "complexType");
      const type = inline ? `#${n.attrs.name}` : q(n.attrs.type);
      if (inline) complexDef(inline, type);
      roots.push({ name: n.attrs.name, type });
    }
  }
}
// complexContent extensions: the base's content first, the extension's after it.
const resolve = (name) => {
  const def = complex[name];
  if (!def.extends) return;
  const base = complex[def.extends];
  if (!base) throw new Error(`${name} extends unknown ${def.extends}`);
  resolve(def.extends);
  const items = [base.model, def.model].filter(Boolean);
  def.model = items.length > 1 ? { k: "s", min: 1, max: 1, items } : items[0] ?? null;
  def.attrs = [...base.attrs, ...def.attrs];
  delete def.extends;
};
Object.keys(complex).forEach(resolve);
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "integer", "nonNegativeInteger", "int", "long", "date", "dateTime", "boolean", "base64Binary", "anyURI"]);
const missing = new Set();
const seeType = (t) => { if (t && !complex[t] && !simple[t] && !BUILTIN.has(t)) missing.add(t); };
const walk = (p) => { if (!p) return; if (p.k === "e") seeType(p.type); else p.items.forEach(walk); };
for (const d of Object.values(complex)) { walk(d.model); seeType(d.text); d.attrs.forEach((a) => seeType(a.type)); }
for (const s of Object.values(simple)) { seeType(s.base); for (const p of s.pattern ?? []) new RegExp(`^(?:${p})$`, "u"); }
if (missing.size) throw new Error(`unknown types: ${[...missing].join(", ")}`);

const root = roots.find((r) => r.name === "InvoiceData");
if (!root) throw new Error("no InvoiceData element");
const out = { source: `NAV Online Számla 3.0 invoiceData.xsd + invoiceBase.xsd (${source}) and NTCA common 1.0 common.xsd (sha256 ${COMMON_SHA256.slice(0, 12)})`, namespace: "http://schemas.nav.gov.hu/OSA/3.0/data", root: root.type, complex, simple };
writeFileSync(new URL("./hu-xsd-data.mjs", import.meta.url), `// Generated by build-hu-schema.mjs; do not edit.\nexport default ${JSON.stringify(out)};\n`);
console.log(`${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types`);
