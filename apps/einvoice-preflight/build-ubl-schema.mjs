// Reads the OASIS UBL 2.1 schema (the Invoice and CreditNote main documents and the
// common modules they import) into ubl-xsd-data.mjs, the table ubl-xsd.mjs checks
// UBL invoices and credit notes against:
//   node build-ubl-schema.mjs [dir holding maindoc/ and common/ of os-UBL-2.1/xsd]
// Without a path it downloads the OASIS Standard package
// (https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip, 4 Nov 2013) and refuses it
// unless its SHA-256 is UBL_ZIP_SHA256 (read on 2026-11-26). Unpacking needs `unzip`.
//
// Licence: the schema files say "Copyright (c) OASIS Open 2013. All Rights Reserved."
// under the OASIS IPR Policy, whose notice lets the work be copied and derivative
// works prepared provided the notice is kept. The XSD is not copied into the tree:
// the data module holds only facts read from it (content models with occurrence
// counts, the namespace each element is written in, attributes and their use), the
// way fa3-xsd-data.mjs and hu-xsd-data.mjs do for the Polish and Hungarian schemas.
//
// Only types reachable from Invoice and CreditNote are kept. ExtensionContent
// (xsd:any namespace="##other" processContents="lax") is kept as "one element from
// another namespace, not checked further": the signature modules are not read. The
// script throws on any other construct it does not model rather than dropping it.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlTree } from "./ubl.mjs";

export const UBL_ZIP = "https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip";
export const UBL_ZIP_SHA256 = "60b80d76394a8a2add90723ecb8e0e2e9d826775de9749df37a72d60703f86ed";

// Our short key for each namespace: types are keyed "cac:PartyType", elements carry `ns`.
export const UBL_NS = {
  inv: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  udt: "urn:oasis:names:specification:ubl:schema:xsd:UnqualifiedDataTypes-2",
  qdt: "urn:oasis:names:specification:ubl:schema:xsd:QualifiedDataTypes-2",
  cct: "urn:un:unece:uncefact:data:specification:CoreComponentTypeSchemaModule:2",
  xs: "http://www.w3.org/2001/XMLSchema",
};
const KEY = Object.fromEntries(Object.entries(UBL_NS).map(([k, v]) => [v, k]));

const FILES = [
  "maindoc/UBL-Invoice-2.1.xsd",
  "maindoc/UBL-CreditNote-2.1.xsd",
  "common/UBL-CommonAggregateComponents-2.1.xsd",
  "common/UBL-CommonBasicComponents-2.1.xsd",
  "common/UBL-CommonExtensionComponents-2.1.xsd",
  "common/UBL-ExtensionContentDataType-2.1.xsd",
  "common/UBL-UnqualifiedDataTypes-2.1.xsd",
  "common/UBL-QualifiedDataTypes-2.1.xsd",
  "common/CCTS_CCT_SchemaModule-2.1.xsd",
];
// Built-in XSD types the checker knows (xsd-check.mjs). language is given its XSD 1.0 pattern here.
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "date", "dateTime", "time", "boolean", "base64Binary", "anyURI", "language"]);
const IGNORED = new Set(["annotation", "import", "include"]);

function readSchemaDir(dir) {
  const out = [];
  for (const f of FILES) {
    const text = readFileSync(join(dir, f), "utf8").replace(/^\ufeff/, "").replace(/\r\n/g, "\n");
    const prefixes = {};
    const head = text.match(/<xsd:schema\b[^>]*>/)[0];
    for (const m of head.matchAll(/\sxmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/g)) prefixes[m[1] ?? ""] = m[2];
    const target = head.match(/targetNamespace\s*=\s*"([^"]*)"/)[1];
    const tree = parseXmlTree(text);
    out.push({ file: f, prefixes, own: KEY[target], schema: tree.children.find((n) => n.name === "schema") });
    if (!out.at(-1).own) throw new Error(`${f}: unknown target namespace ${target}`);
  }
  return out;
}

export function buildUblSchema(dir) {
  const complex = {};
  const simple = { language: { base: "token", pattern: ["[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*"] } };
  const elements = {}; // "cbc:ID" -> type key
  const pending = []; // particles whose ref= is resolved once every global element is known

  for (const { file, prefixes, own, schema } of readSchemaDir(dir)) {
    const q = (name) => {
      const i = name.indexOf(":");
      const uri = prefixes[i < 0 ? "" : name.slice(0, i)];
      const key = KEY[uri];
      if (!key) throw new Error(`${file}: unknown prefix in ${name}`);
      const local = i < 0 ? name : name.slice(i + 1);
      return key === "xs" ? local : `${key}:${local}`;
    };
    const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
    const kids = (n) => n.children.filter((c) => !IGNORED.has(c.name));

    const attrDef = (a) => {
      if (kids(a).length) throw new Error(`${file}: an inline attribute type is not modelled`);
      return { name: a.attrs.name, type: q(a.attrs.type), use: a.attrs.use ?? "optional" };
    };
    const particle = (n) => {
      if (n.name === "element") {
        if (!n.attrs.ref || n.attrs.name || kids(n).length) throw new Error(`${file}: only element ref= particles are modelled`);
        const ref = q(n.attrs.ref);
        const i = ref.indexOf(":");
        const p = { k: "e", name: ref.slice(i + 1), ns: ref.slice(0, i), type: null, ...occurs(n) };
        pending.push([p, ref]);
        return p;
      }
      if (n.name === "sequence") return { k: "s", ...occurs(n), items: kids(n).map(particle) };
      throw new Error(`${file}: <${n.name}> in a content model is not modelled`);
    };
    const complexDef = (n, name) => {
      const def = { model: null, attrs: [], text: null };
      const body = kids(n);
      if (body.length !== 1) throw new Error(`${file}: ${name} has ${body.length} content parts`);
      const [part] = body;
      if (part.name === "sequence") {
        const anyKid = kids(part).find((c) => c.name === "any");
        if (anyKid) {
          if (kids(part).length !== 1 || anyKid.attrs.namespace !== "##other") throw new Error(`${file}: this <any> is not modelled`);
          def.any = { ...occurs(anyKid), namespace: "##other", processContents: anyKid.attrs.processContents ?? "strict" };
        } else def.model = particle(part);
      } else if (part.name === "simpleContent") {
        const [d] = kids(part);
        if (!d || !["extension", "restriction"].includes(d.name)) throw new Error(`${file}: ${name}: simpleContent without extension/restriction`);
        if (kids(d).some((c) => c.name !== "attribute")) throw new Error(`${file}: ${name}: facets in simpleContent are not modelled`);
        def[d.name === "extension" ? "extends" : "restricts"] = q(d.attrs.base);
        def.attrs = kids(d).map(attrDef);
      } else throw new Error(`${file}: ${name}: <${part.name}> is not modelled`);
      complex[name] = def;
    };

    for (const n of kids(schema)) {
      const key = `${own}:${n.attrs.name}`;
      if (n.name === "complexType") {
        if (complex[key]) throw new Error(`duplicate type ${key}`);
        complexDef(n, key);
      } else if (n.name === "element") {
        if (kids(n).length || !n.attrs.type) throw new Error(`${file}: global element ${n.attrs.name} with an inline type`);
        elements[key] = q(n.attrs.type);
      } else throw new Error(`${file}: top-level <${n.name}> is not modelled`);
    }
  }

  for (const [p, ref] of pending) {
    if (!elements[ref]) throw new Error(`ref to undeclared element ${ref}`);
    p.type = elements[ref];
  }
  // simpleContent: an extension adds attributes to its base's; a restriction may only
  // tighten them (here: optional -> required), so same-name attributes replace the base's.
  const done = new Set();
  const resolve = (name) => {
    const def = complex[name];
    if (done.has(name) || !def) return;
    const base = def.extends ?? def.restricts;
    if (base) {
      if (BUILTIN.has(base)) {
        if (def.restricts) throw new Error(`${name} restricts a built-in type`);
        def.text = base;
      } else {
        if (!complex[base]) throw new Error(`${name} derives from unknown ${base}`);
        resolve(base);
        const b = complex[base];
        if (!b.text) throw new Error(`${name} derives text from ${base}, which has none`);
        def.text = b.text;
        if (def.extends) def.attrs = [...b.attrs, ...def.attrs];
        else {
          const own = new Map(def.attrs.map((a) => [a.name, a]));
          for (const a of own.values()) if (!b.attrs.some((x) => x.name === a.name)) throw new Error(`${name} restricts in an attribute ${base} lacks`);
          def.attrs = b.attrs.map((a) => own.get(a.name) ?? a);
        }
      }
      delete def.extends;
      delete def.restricts;
    }
    done.add(name);
  };
  // A type that extends another and adds nothing (cbc:IDType extends udt:IdentifierType)
  // checks the same way as its base, so elements point at the base and the copy is dropped.
  const alias = {};
  for (const [name, def] of Object.entries(complex)) {
    if (def.extends && !def.attrs.length && !BUILTIN.has(def.extends)) alias[name] = def.extends;
  }
  const real = (t) => { while (alias[t]) t = alias[t]; return t; };
  for (const [p] of pending) p.type = real(p.type);
  Object.keys(complex).forEach(resolve);

  // Keep what Invoice and CreditNote reach.
  const roots = { Invoice: elements["inv:Invoice"], CreditNote: elements["cn:CreditNote"] };
  const keep = new Set();
  const visit = (t) => {
    if (keep.has(t) || !complex[t]) return;
    keep.add(t);
    const walk = (p) => { if (!p) return; if (p.k === "e") visit(p.type); else p.items.forEach(walk); };
    walk(complex[t].model);
  };
  Object.values(roots).forEach(visit);
  const kept = Object.fromEntries([...keep].sort().map((t) => [t, complex[t]]));

  // Checks: every type exists; within one content model no two elements share a local
  // name (the checker matches local names; ubl-xsd.mjs checks the namespace separately).
  for (const [name, def] of Object.entries(kept)) {
    const seen = new Map();
    const walk = (p) => {
      if (!p) return;
      if (p.k !== "e") return p.items.forEach(walk);
      if (!kept[p.type]) throw new Error(`${name}: ${p.name} has no complex type ${p.type}`);
      if (seen.has(p.name) && seen.get(p.name) !== p.ns) throw new Error(`${name}: two elements named ${p.name} in different namespaces`);
      seen.set(p.name, p.ns);
    };
    walk(def.model);
    if (def.text && !BUILTIN.has(def.text)) throw new Error(`${name}: unknown text type ${def.text}`);
    for (const a of def.attrs) if (!BUILTIN.has(a.type)) throw new Error(`${name}: attribute ${a.name} has unknown type ${a.type}`);
  }
  return { roots, complex: kept, simple, elements: Object.keys(elements).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let dir = process.argv[2];
  let source = "local copy of os-UBL-2.1/xsd";
  if (!dir) {
    const tmp = mkdtempSync(join(tmpdir(), "ubl21-"));
    const zip = join(tmp, "UBL-2.1.zip");
    execFileSync("curl", ["-sSfL", "-o", zip, UBL_ZIP]);
    const got = createHash("sha256").update(readFileSync(zip)).digest("hex");
    if (got !== UBL_ZIP_SHA256) throw new Error(`UBL-2.1.zip SHA-256 ${got} is not the package this table was checked against`);
    execFileSync("unzip", ["-q", zip, "xsd/*", "-d", tmp]);
    dir = join(tmp, "xsd");
    source = `${UBL_ZIP} (SHA-256 ${UBL_ZIP_SHA256.slice(0, 16)}…)`;
  }
  const { roots, complex, simple } = buildUblSchema(dir);
  const out = { source: `OASIS UBL 2.1 OS (4 Nov 2013), maindoc Invoice and CreditNote, from ${source}`, namespaces: UBL_NS, roots, complex, simple };
  writeFileSync(new URL("./ubl-xsd-data.mjs", import.meta.url), `// Generated by build-ubl-schema.mjs; do not edit.\nexport default ${JSON.stringify(out)};\n`);
  console.log(`${Object.keys(complex).length} complex types reachable from Invoice and CreditNote`);
}
