// Reads the UN/CEFACT Cross Industry Invoice D16B schema, the EN 16931 subset
// that CEN publishes with its validation artefacts ("D16B SCRDM (Subset)",
// uncoupled code lists), into cii-xsd-data.mjs, the table cii-xsd.mjs checks
// XRechnung CII and Factur-X / ZUGFeRD EN 16931 files against:
//   node build-cii-schema.mjs [dir holding CrossIndustryInvoice_100pD16B.xsd and its three imports]
// Without a path it clones ConnectingEurope/eInvoicing-EN16931 at SOURCE_COMMIT
// (the same repository build-schematron.mjs reads the EN 16931 rules from).
//
// The XSD is not copied into the tree: the data module holds only facts read
// from it (content models with their occurrence counts, attributes with their
// fixed values, and the length facets). The uncoupled variant is used on
// purpose: its code-list types are plain tokens, so a code newer than the 2016
// lists (a currency, a unit) is not refused here; the EN 16931 Schematron
// checks codes against the current lists.
//
// UN/CEFACT's notice on the schema files permits derivative works that "assist
// in its implementation" provided the notice is kept; the generated module
// carries it. It throws on any construct it does not model (ref, any, group,
// list, union, restriction in complex content) rather than dropping it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlTree } from "./ubl.mjs";

export const SOURCE_REPO = "https://github.com/ConnectingEurope/eInvoicing-EN16931";
export const SOURCE_COMMIT = "b17b2695e5e3e021945c38658326b78a76f80f84";
const SUBDIR = "cii/schema/D16B SCRDM (Subset)/uncoupled clm/CII/uncefact/data/standard";

let dir = process.argv[2];
if (!dir) {
  const tmp = mkdtempSync(join(tmpdir(), "cii-"));
  execFileSync("git", ["init", "-q", tmp]);
  execFileSync("git", ["-C", tmp, "fetch", "-q", "--depth", "1", SOURCE_REPO, SOURCE_COMMIT]);
  execFileSync("git", ["-C", tmp, "checkout", "-q", "FETCH_HEAD"]);
  dir = join(tmp, SUBDIR);
}

const FILES = [
  ["rsm", "CrossIndustryInvoice_100pD16B.xsd"],
  ["ram", "CrossIndustryInvoice_ReusableAggregateBusinessInformationEntity_100pD16B.xsd"],
  ["qdt", "CrossIndustryInvoice_QualifiedDataType_100pD16B.xsd"],
  ["udt", "CrossIndustryInvoice_UnqualifiedDataType_100pD16B.xsd"],
];
const NAMESPACES = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

// Each file declares its own prefixes; map them to ours by namespace URI so "ram:X" means the same everywhere.
let prefixMap = {};
let currentNs = "";
const qname = (q) => {
  if (!q) return q;
  const [p, n] = q.includes(":") ? q.split(":") : ["", q];
  const ours = prefixMap[p];
  if (ours === "xsd") return n;
  if (!ours) throw new Error(`unknown prefix in ${q}`);
  return `${ours}:${n}`;
};
const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
const UNSUPPORTED = new Set(["any", "group", "list", "union", "key", "unique", "keyref", "all", "attributeGroup", "anyAttribute", "include", "redefine"]);

const complex = {};
const simple = {};
const roots = [];
let anon = 0;

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
  const s = { base: qname(r.attrs.base) };
  const patterns = [];
  const enums = [];
  for (const f of r.children) {
    const v = f.attrs?.value;
    if (f.name === "pattern") patterns.push(v);
    else if (f.name === "enumeration") enums.push(v);
    else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits"].includes(f.name)) s[f.name] = Number(v);
    else if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(f.name)) s[f.name] = Number(v);
    else if (f.name === "whiteSpace") s.whiteSpace = v;
    else if (f.name !== "annotation") throw new Error(`facet <${f.name}> is not modelled`);
  }
  if (patterns.length) s.pattern = patterns;
  if (enums.length) s.enum = enums;
  return s;
}

function attrDef(a) {
  let type = qname(a.attrs.type);
  const inline = a.children.find((c) => c.name === "simpleType");
  if (inline) { type = `#attr${++anon}`; simple[type] = simpleDef(inline); }
  return { name: a.attrs.name, type: type ?? "string", use: a.attrs.use ?? "optional", ...(a.attrs.fixed !== undefined && { fixed: a.attrs.fixed }) };
}

function particle(node, path) {
  if (node.name === "element") {
    let type = qname(node.attrs.type);
    const inlineC = node.children.find((c) => c.name === "complexType");
    const inlineS = node.children.find((c) => c.name === "simpleType");
    if (inlineC) { type = `#${path}/${node.attrs.name}`; complexDef(inlineC, type); }
    else if (inlineS) { type = `#${path}/${node.attrs.name}`; simple[type] = simpleDef(inlineS); }
    // elementFormDefault="qualified" in all four files: a local element is in its file's namespace.
    return { k: "e", name: node.attrs.name, ns: currentNs, type, ...occurs(node), ...(node.attrs.fixed !== undefined && { fixed: node.attrs.fixed }), ...(node.attrs.default !== undefined && { default: node.attrs.default }) };
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
    if (sc) def.text = qname(ext.attrs.base);
    else def.extends = qname(ext.attrs.base);
    body = ext;
  }
  const model = body.children.find((c) => c.name === "sequence" || c.name === "choice");
  if (model) def.model = particle(model, name);
  def.attrs = body.children.filter((c) => c.name === "attribute").map(attrDef);
  complex[name] = def;
}

for (const [ours, file] of FILES) {
  const text = readFileSync(join(dir, file), "utf8").replace(/^\uFEFF/, "");
  const tree = parseXmlTree(text);
  const schema = tree.children.find((n) => n.name === "schema");
  if (schema.attrs.targetNamespace !== NAMESPACES[ours]) throw new Error(`${file}: unexpected target namespace ${schema.attrs.targetNamespace}`);
  prefixMap = {};
  currentNs = ours;
  if (schema.attrs.elementFormDefault !== "qualified") throw new Error(`${file}: elementFormDefault is not qualified`);
  // parseXmlTree keeps attribute local names only, so the xmlns:prefix declarations are read from the start tag.
  const start = text.match(/<(?:\w+:)?schema\b[^>]*>/)[0];
  for (const [, k, v] of start.matchAll(/xmlns:([\w.-]+)\s*=\s*"([^"]*)"/g)) {
    const found = Object.entries(NAMESPACES).find(([, uri]) => uri === v);
    if (found) prefixMap[k] = found[0];
    else if (v === "http://www.w3.org/2001/XMLSchema") prefixMap[k] = "xsd";
  }
  noUnsupported(schema);
  for (const n of schema.children) {
    const key = `${ours}:${n.attrs?.name}`;
    if (n.name === "complexType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      complexDef(n, key);
    } else if (n.name === "simpleType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      simple[key] = simpleDef(n);
    } else if (n.name === "element") {
      const inline = n.children.find((c) => c.name === "complexType");
      const type = inline ? `#${n.attrs.name}` : qname(n.attrs.type);
      if (inline) complexDef(inline, type);
      roots.push({ name: n.attrs.name, type });
    } else if (n.name !== "import" && n.name !== "annotation") {
      throw new Error(`top-level <${n.name}> is not modelled`);
    }
  }
}
// Resolve complexContent extensions: the base's content comes first, the extension's after it.
for (const [name, def] of Object.entries(complex)) {
  if (!def.extends) continue;
  const base = complex[def.extends];
  if (!base) throw new Error(`${name} extends unknown ${def.extends}`);
  const items = [base.model, def.model].filter(Boolean);
  def.model = items.length > 1 ? { k: "s", min: 1, max: 1, items } : items[0] ?? null;
  def.attrs = [...base.attrs, ...def.attrs];
  delete def.extends;
}
// A simpleContent extension of a complex type takes that type's text and attributes.
for (const def of Object.values(complex)) {
  for (let guard = 0; def.text && complex[def.text]; guard++) {
    if (guard > 10) throw new Error("simpleContent chain too deep");
    const base = complex[def.text];
    def.attrs = [...base.attrs.filter((a) => !def.attrs.some((b) => b.name === a.name)), ...def.attrs];
    def.text = base.text;
  }
}
// Every referenced type must exist, and every pattern must compile as a JS regex.
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "integer", "nonNegativeInteger", "boolean", "date", "dateTime", "base64Binary", "anyURI"]);
const missing = new Set();
const seeType = (t) => { if (t && !complex[t] && !simple[t] && !BUILTIN.has(t)) missing.add(t); };
const walk = (p) => { if (!p) return; if (p.k === "e") seeType(p.type); else p.items.forEach(walk); };
for (const d of Object.values(complex)) { walk(d.model); seeType(d.text); d.attrs.forEach((a) => seeType(a.type)); }
for (const s of Object.values(simple)) { seeType(s.base); for (const p of s.pattern ?? []) new RegExp(`^(?:${p})$`, "u"); }
if (missing.size) throw new Error(`unknown types: ${[...missing].join(", ")}`);

const root = roots.find((r) => r.name === "CrossIndustryInvoice");
if (!root) throw new Error("no CrossIndustryInvoice element");
const NOTICE = "Copyright (C) UN/CEFACT (2016). All Rights Reserved. This document and translations of it may be copied and furnished to others, and derivative works that comment on or otherwise explain it or assist in its implementation may be prepared, copied, published and distributed, in whole or in part, without restriction of any kind, provided that the above copyright notice and this paragraph are included on all such copies and derivative works.";
const out = {
  source: `UN/CEFACT CrossIndustryInvoice 100.D16B, EN 16931 subset (D16B SCRDM (Subset), uncoupled clm), from ${SOURCE_REPO} at ${SOURCE_COMMIT}`,
  notice: NOTICE,
  namespace: NAMESPACES.rsm,
  namespaces: NAMESPACES,
  root: root.type,
  complex,
  simple,
};
writeFileSync(new URL("./cii-xsd-data.mjs", import.meta.url), `// Generated by build-cii-schema.mjs; do not edit.\n// Facts read from the UN/CEFACT D16B schema. ${NOTICE}\nexport default ${JSON.stringify(out)};\n`);
console.log(`${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types`);
