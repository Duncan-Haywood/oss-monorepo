// Reads the Hungarian NAV Online Számla 3.0 invoice data schema into nav-xsd-data.mjs, the
// table nav-xsd.mjs checks InvoiceData files against:
//   node build-nav-schema.mjs [dir holding common.xsd, invoiceBase.xsd and invoiceData.xsd]
// Without a directory it downloads the three files from GitHub at pinned commits:
//   - invoiceData.xsd and invoiceBase.xsd from nav-gov-hu/Online-Invoice (src/schemas/nav/gov/hu/OSA/);
//   - common.xsd (namespace http://schemas.nav.gov.hu/NTCA/1.0/common) from nav-gov-hu/Common at
//     its common-1.0.0 tag. invoiceData.xsd imports that namespace without a schemaLocation, and
//     the Common repository's main branch holds 2.0, which is why earlier runs could not validate.
// Both repositories are MIT, (c) 2019 Nemzeti Adó- és Vámhivatal. The XSDs are not copied into
// the tree: the data module holds facts read from them (content models with occurrence counts,
// the namespace each element is declared in, attributes, fixed values, and each simple type's
// length, pattern, range, digit and enumeration facets). It throws on any construct it does not
// model rather than dropping it.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXmlTree } from "./ubl.mjs";

const OSA_COMMIT = "cc7a775d6dce361311e409abb9934eb755f2749c";
const COMMON_COMMIT = "ab8d7887967492e5f6d6e25447be853fd767add8"; // tag common-1.0.0
const SOURCES = {
  "common.xsd": `https://raw.githubusercontent.com/nav-gov-hu/Common/${COMMON_COMMIT}/schemas/src/main/resources/xsd/hu/gov/nav/schemas/NTCA/1.0/common/common.xsd`,
  "invoiceBase.xsd": `https://raw.githubusercontent.com/nav-gov-hu/Online-Invoice/${OSA_COMMIT}/src/schemas/nav/gov/hu/OSA/invoiceBase.xsd`,
  "invoiceData.xsd": `https://raw.githubusercontent.com/nav-gov-hu/Online-Invoice/${OSA_COMMIT}/src/schemas/nav/gov/hu/OSA/invoiceData.xsd`,
};
const NS = {
  common: "http://schemas.nav.gov.hu/NTCA/1.0/common",
  base: "http://schemas.nav.gov.hu/OSA/3.0/base",
  data: "http://schemas.nav.gov.hu/OSA/3.0/data",
};
const PREFIX_OF_FILE = { "common.xsd": "common", "invoiceBase.xsd": "base", "invoiceData.xsd": "data" };

async function load(name) {
  const dir = process.argv[2];
  if (dir) return readFileSync(join(dir, name), "utf8");
  const res = await fetch(SOURCES[name]);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const UNSUPPORTED = new Set(["any", "group", "list", "union", "key", "unique", "keyref", "all", "attributeGroup", "anyAttribute"]);
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "integer", "nonNegativeInteger", "positiveInteger", "int", "long", "date", "dateTime", "boolean", "base64Binary", "anyURI"]);

let ns = "data";
// "xs:string" -> "string"; "common:Foo" stays; an unprefixed name is this file's own type.
const qual = (q) => {
  if (!q) return q;
  if (q.startsWith("xs:")) return q.slice(3);
  return q.includes(":") ? q : `${ns}:${q}`;
};
const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
const complex = {};
const simple = {};
const roots = {};

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
  const s = { base: qual(r.attrs.base) };
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
  let type = qual(a.attrs.type);
  const inline = a.children.find((c) => c.name === "simpleType");
  if (inline) { type = `#attr${++anon}`; simple[type] = simpleDef(inline); }
  return { name: a.attrs.name, type: type ?? "string", use: a.attrs.use ?? "optional", ...(a.attrs.fixed !== undefined && { fixed: a.attrs.fixed }) };
}

function particle(node, path) {
  if (node.name === "element") {
    let type = qual(node.attrs.type);
    const inlineC = node.children.find((c) => c.name === "complexType");
    const inlineS = node.children.find((c) => c.name === "simpleType");
    if (inlineC) { type = `#${path}/${node.attrs.name}`; complexDef(inlineC, type); }
    else if (inlineS) { type = `#${path}/${node.attrs.name}`; simple[type] = simpleDef(inlineS); }
    // elementFormDefault="qualified" in all three files: a local element is in its schema's namespace.
    return { k: "e", name: node.attrs.name, ns, type, ...occurs(node), ...(node.attrs.fixed !== undefined && { fixed: node.attrs.fixed }) };
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
    if (sc) def.text = qual(ext.attrs.base);
    else def.extends = qual(ext.attrs.base);
    body = ext;
  }
  const model = body.children.find((c) => c.name === "sequence" || c.name === "choice");
  if (model) def.model = particle(model, name);
  def.attrs = body.children.filter((c) => c.name === "attribute").map(attrDef);
  complex[name] = def;
}

for (const file of ["common.xsd", "invoiceBase.xsd", "invoiceData.xsd"]) {
  const tree = parseXmlTree((await load(file)).replace(/^﻿/, ""));
  const schema = tree.children.find((n) => n.name === "schema");
  if (schema.attrs.targetNamespace !== NS[PREFIX_OF_FILE[file]]) throw new Error(`${file}: unexpected targetNamespace ${schema.attrs.targetNamespace}`);
  if (schema.attrs.elementFormDefault !== "qualified") throw new Error(`${file}: elementFormDefault is not qualified`);
  noUnsupported(schema);
  ns = PREFIX_OF_FILE[file];
  for (const n of schema.children) {
    if (n.name === "import" || n.name === "annotation") continue;
    const key = `${ns}:${n.attrs?.name}`;
    if (n.name === "complexType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      complexDef(n, key);
    } else if (n.name === "simpleType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      simple[key] = simpleDef(n);
    } else if (n.name === "element") {
      const inline = n.children.find((c) => c.name === "complexType");
      const type = inline ? `#${ns}:${n.attrs.name}` : qual(n.attrs.type);
      if (inline) complexDef(inline, type);
      roots[n.attrs.name] = { ns, type };
    } else throw new Error(`unexpected top-level <${n.name}> in ${file}`);
  }
}
// complexContent extensions: the base's content first, then the extension's.
const resolving = new Set();
function resolve(name) {
  const def = complex[name];
  if (!def.extends) return def;
  if (resolving.has(name)) throw new Error(`circular extension at ${name}`);
  resolving.add(name);
  const base = complex[def.extends] && resolve(def.extends);
  if (!base) throw new Error(`${name} extends unknown ${def.extends}`);
  const items = [base.model, def.model].filter(Boolean);
  def.model = items.length > 1 ? { k: "s", min: 1, max: 1, items } : items[0] ?? null;
  def.attrs = [...base.attrs, ...def.attrs];
  if (base.text && !def.text) def.text = base.text;
  delete def.extends;
  return def;
}
Object.keys(complex).forEach(resolve);
// Every referenced type must exist, and every pattern must compile as a JS regex.
const missing = new Set();
const seeType = (t) => { if (t && !complex[t] && !simple[t] && !BUILTIN.has(t)) missing.add(t); };
const walk = (p) => { if (!p) return; if (p.k === "e") seeType(p.type); else p.items.forEach(walk); };
for (const d of Object.values(complex)) { walk(d.model); seeType(d.text); d.attrs.forEach((a) => seeType(a.type)); }
for (const s of Object.values(simple)) { seeType(s.base); for (const p of s.pattern ?? []) new RegExp(`^(?:${p})$`, "u"); }
if (missing.size) throw new Error(`unknown types: ${[...missing].join(", ")}`);
if (!roots.InvoiceData) throw new Error("no InvoiceData element");

const out = {
  source: `NAV Online Számla 3.0 invoiceData.xsd and invoiceBase.xsd (nav-gov-hu/Online-Invoice ${OSA_COMMIT.slice(0, 7)}) with NTCA common 1.0 common.xsd (nav-gov-hu/Common, tag common-1.0.0); MIT, (c) 2019 Nemzeti Adó- és Vámhivatal`,
  namespaces: NS,
  root: roots.InvoiceData,
  complex,
  simple,
};
writeFileSync(new URL("./nav-xsd-data.mjs", import.meta.url), `// Generated by build-nav-schema.mjs; do not edit by hand, rebuild.\nexport default ${JSON.stringify(out)};\n`);
console.log(`${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types`);
