// Reads the Polish KSeF FA(3) schema (schemat_FA(3)_v1-0E.xsd and the three
// "bazowe" base files it imports) into fa3-xsd-data.mjs, the table fa3-xsd.mjs
// checks files against:
//   node build-fa3-schema.mjs [dir holding FA(3) xsd and bazowe/]
// Without a path it runs `npm pack ksef-client-ts` (the package carries the
// schemas under docs/schemas/FA; crd.gov.pl was not reachable from the build
// host). The XSD is not copied into the tree: the data module holds only facts
// read from it (content models with their occurrence counts, attributes, and the
// length, pattern, range, digit and enumeration facets). Unlike the FatturaPA
// reader, enumerations are enforced: FA(3) v1-0E is the schema in force.
// It throws on any construct it does not model (ref, any, group, list, union)
// rather than dropping it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlTree } from "./ubl.mjs";

let dir = process.argv[2];
let version = "";
if (!dir) {
  const tmp = mkdtempSync(join(tmpdir(), "fa3-"));
  execFileSync("npm", ["pack", "ksef-client-ts", "--silent"], { cwd: tmp });
  execFileSync("sh", ["-c", "tar xzf *.tgz"], { cwd: tmp });
  dir = join(tmp, "package/docs/schemas/FA");
  version = JSON.parse(readFileSync(join(tmp, "package/package.json"), "utf8")).version;
}
const files = ["schemat_FA(3)_v1-0E.xsd", "bazowe/StrukturyDanych_v10-0E.xsd", "bazowe/ElementarneTypyDanych_v10-0E.xsd", "bazowe/KodyKrajow_v10-0E.xsd"];
// Types are keyed "tns:Name" (the FA(3) file) or "etd:Name" (the shared base files): both define a TAdres.
const local = (q) => (q ? (q.startsWith("xsd:") ? q.slice(4) : q) : q);
let ns = "tns";
const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
const UNSUPPORTED = new Set(["any", "group", "list", "key", "unique", "keyref", "all", "attributeGroup", "anyAttribute"]);

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
  const union = node.children.find((c) => c.name === "union");
  if (union) {
    // Only a union of string restrictions that differ by pattern (TNrREGON: 9 or 14 digits) is modelled.
    const members = union.children.filter((c) => c.name === "simpleType").map(simpleDef);
    if (members.some((m) => m.base !== "string" || !m.pattern || Object.keys(m).length !== 2)) throw new Error("this <union> is not modelled");
    return { base: "string", pattern: members.flatMap((m) => m.pattern) };
  }
  const r = node.children.find((c) => c.name === "restriction");
  const s = { base: local(r.attrs.base) };
  const patterns = [];
  const enums = [];
  for (const f of r.children) {
    const v = f.attrs?.value;
    if (f.name === "pattern") patterns.push(v);
    else if (f.name === "enumeration") enums.push(v);
    else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits"].includes(f.name)) s[f.name] = Number(v);
    else if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(f.name)) s[f.name] = /^\d{4}-/.test(v) ? v : Number(v); // dates stay text
    else if (f.name === "whiteSpace") s.whiteSpace = v;
  }
  if (patterns.length) s.pattern = patterns;
  if (enums.length) s.enum = enums;
  return s;
}

function attrDef(a) {
  let type = local(a.attrs.type);
  const inline = a.children.find((c) => c.name === "simpleType");
  if (inline) { type = `#attr${++anon}`; simple[type] = simpleDef(inline); }
  return { name: a.attrs.name, type: type ?? "string", use: a.attrs.use ?? "optional", ...(a.attrs.fixed !== undefined && { fixed: a.attrs.fixed }) };
}

function particle(node, path) {
  if (node.name === "element") {
    let type = local(node.attrs.type);
    const inlineC = node.children.find((c) => c.name === "complexType");
    const inlineS = node.children.find((c) => c.name === "simpleType");
    if (inlineC) { type = `#${path}/${node.attrs.name}`; complexDef(inlineC, type); }
    else if (inlineS) { type = `#${path}/${node.attrs.name}`; simple[type] = simpleDef(inlineS); }
    return { k: "e", name: node.attrs.name, type, ...occurs(node), ...(node.attrs.default !== undefined && { default: node.attrs.default }) };
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
    if (sc) def.text = local(ext.attrs.base);
    else def.extends = local(ext.attrs.base);
    body = ext;
  }
  const model = body.children.find((c) => c.name === "sequence" || c.name === "choice");
  if (model) def.model = particle(model, name);
  def.attrs = body.children.filter((c) => c.name === "attribute").map(attrDef);
  complex[name] = def;
}

for (const f of files) {
  const tree = parseXmlTree(readFileSync(join(dir, f), "utf8").replace(/^﻿/, ""));
  const schema = tree.children.find((n) => n.name === "schema");
  noUnsupported(schema);
  ns = f.startsWith("bazowe/") ? "etd" : "tns";
  for (const n of schema.children) {
    const key = `${ns}:${n.attrs?.name}`;
    if (n.name === "complexType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      complexDef(n, key);
    } else if (n.name === "simpleType") {
      if (complex[key] || simple[key]) throw new Error(`duplicate type ${key}`);
      simple[key] = simpleDef(n);
    } else if (n.name === "element") {
      const inline = n.children.find((c) => c.name === "complexType");
      const type = inline ? `#${n.attrs.name}` : local(n.attrs.type);
      if (inline) complexDef(inline, type);
      roots.push({ name: n.attrs.name, type });
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
// Every referenced type must exist, and every pattern must compile as a JS regex.
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "integer", "nonNegativeInteger", "byte", "int", "long", "date", "dateTime", "boolean", "gYear", "base64Binary", "anyURI"]);
const missing = new Set();
const seeType = (t) => { if (t && !complex[t] && !simple[t] && !BUILTIN.has(t)) missing.add(t); };
const walk = (p) => { if (!p) return; if (p.k === "e") seeType(p.type); else p.items.forEach(walk); };
for (const d of Object.values(complex)) { walk(d.model); seeType(d.text); d.attrs.forEach((a) => seeType(a.type)); }
for (const s of Object.values(simple)) { seeType(s.base); for (const p of s.pattern ?? []) new RegExp(`^(?:${p})$`, "u"); }
if (missing.size) throw new Error(`unknown types: ${[...missing].join(", ")}`);

const root = roots.find((r) => r.name === "Faktura");
if (!root) throw new Error("no Faktura element");
const out = { source: `Ministerstwo Finansów KSeF FA(3) XSD schemat_FA(3)_v1-0E.xsd${version ? `, via ksef-client-ts ${version}` : ""}`, namespace: "http://crd.gov.pl/wzor/2025/06/25/13775/", root: root.type, complex, simple };
writeFileSync(new URL("./fa3-xsd-data.mjs", import.meta.url), `// Generated by build-fa3-schema.mjs; do not edit.\nexport default ${JSON.stringify(out)};\n`);
console.log(`${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types`);
