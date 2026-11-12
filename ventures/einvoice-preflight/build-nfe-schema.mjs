// Reads Brazil's NF-e 4.00 schema (leiauteNFe_v4.00.xsd with tiposBasico_v4.00.xsd,
// package PL_009_V4) into nfe-xsd-data.mjs, the table nfe.mjs checks files against:
//   node build-nfe-schema.mjs [dir holding the two .xsd files]
// Without a directory it downloads them from the nfephp-org/sped-nfe repository on
// GitHub (LGPL-3.0-or-later, GPL-3.0-or-later or MIT, at the pinned commit below), which
// carries the Portal da NF-e package byte for byte; www.nfe.fazenda.gov.br did not answer
// from the build host on 2026-11-12. The XSDs are not copied into the tree: the data
// module holds facts read from them (each complex type's content model as a regular
// expression over child names, attribute use, and each simple type's enumerations,
// patterns and lengths). ds:Signature is free content (xmldsig is not read).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCfdiXml } from "./cfdi-xml.mjs";

export const SPED_NFE_COMMIT = "ff80086aa16576345a519629efdd9a05fc49226a";
const MIRROR = `https://raw.githubusercontent.com/nfephp-org/sped-nfe/${SPED_NFE_COMMIT}/schemes/PL_009_V4`;
const FILES = ["leiauteNFe_v4.00.xsd", "tiposBasico_v4.00.xsd"];

async function load(name) {
  const dir = process.argv[2];
  if (dir) return readFileSync(join(dir, name), "utf8");
  const res = await fetch(`${MIRROR}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const kids = (n, name) => n.children.filter((c) => c.name === name);
const kid = (n, name) => n.children.find((c) => c.name === name);
const local = (t) => (t || "").replace(/^.*:/, "");
const BUILTIN = /^(string|decimal|int|short|date|dateTime|token|base64Binary|anyURI|ID)$/;

const simpleTypes = {}; // name -> facts
const complexTypes = {}; // name -> facts
let anon = 0;

// A simple type as facts: {base (named type or builtin), enum, patterns, length,
// minLength, maxLength}. A restriction of a named type keeps `base` so the checker
// applies the base's facets too.
function simple(node) {
  const r = kid(node, "restriction");
  if (!r) return { base: "string" };
  const b = local(r.attrs.base);
  const out = { base: BUILTIN.test(b) ? b : `@${b}` };
  const en = [], pats = [];
  for (const f of r.children) {
    const v = f.attrs.value;
    if (f.name === "enumeration") en.push(v);
    else if (f.name === "pattern") pats.push(v);
    else if (["length", "minLength", "maxLength"].includes(f.name)) out[f.name] = Number(v);
  }
  if (en.length) out.enum = en;
  if (pats.length) out.patterns = pats; // XSD: several patterns in one step are OR'd
  return out;
}

function typeOfElement(el) {
  const ct = kid(el, "complexType");
  if (ct) return { c: complex(ct) };
  const st = kid(el, "simpleType");
  if (st) { const id = `~${anon++}`; simpleTypes[id] = simple(st); return { s: id }; }
  const t = local(el.attrs.type);
  if (!t || BUILTIN.test(t)) return { s: `#${t || "string"}` };
  if (complexTypes[t] !== undefined || complexNodes[t]) return { c: t };
  return { s: `@${t}` };
}

// A particle tree to a regex over "<name>" tokens, filling `childMap`.
function particle(p, childMap, conflicts, owner) {
  const min = Number(p.attrs.minOccurs ?? 1);
  const max = p.attrs.maxOccurs === "unbounded" ? Infinity : Number(p.attrs.maxOccurs ?? 1);
  let body;
  if (p.name === "element") {
    let name, t;
    if (p.attrs.ref) { name = local(p.attrs.ref); t = { any: true }; }
    else { name = p.attrs.name; t = typeOfElement(p); }
    const prev = childMap[name];
    if (prev && JSON.stringify(prev) !== JSON.stringify(t)) conflicts.push(`${owner}/${name}`);
    if (!prev) childMap[name] = t;
    body = `<${name}>`;
  } else if (p.name === "sequence") {
    body = p.children.filter((c) => ["element", "sequence", "choice"].includes(c.name)).map((c) => particle(c, childMap, conflicts, owner)).join("");
  } else if (p.name === "choice") {
    body = `(?:${p.children.filter((c) => ["element", "sequence", "choice"].includes(c.name)).map((c) => particle(c, childMap, conflicts, owner)).join("|")})`;
  } else return "";
  if (min === 1 && max === 1) return p.name === "sequence" ? `(?:${body})` : body;
  const q = max === Infinity ? (min === 0 ? "*" : min === 1 ? "+" : `{${min},}`) : (min === 0 && max === 1 ? "?" : `{${min},${max}}`);
  return `(?:${body})${q}`;
}

const complexNodes = {};
function complex(ct, name) {
  const id = name || `~c${anon++}`;
  if (complexTypes[id]) return id;
  complexTypes[id] = null; // reserve (no recursion in NF-e, but be safe)
  const def = { model: "", kids: {}, attrs: [] };
  const conflicts = [];
  const top = ct.children.find((c) => ["sequence", "choice"].includes(c.name));
  if (top) {
    def.model = particle(top, def.kids, conflicts, id);
    // Children the top sequence requires outright (not inside a choice or an optional
    // group): the checker names them when they are missing.
    if (top.name === "sequence") def.req = top.children.filter((c) => c.name === "element" && Number(c.attrs.minOccurs ?? 1) >= 1).map((c) => c.attrs.name || local(c.attrs.ref));
  }
  for (const a of kids(ct, "attribute")) {
    const st = kid(a, "simpleType");
    let t;
    if (st) { t = `~${anon++}`; simpleTypes[t] = simple(st); }
    else { const n = local(a.attrs.type); t = BUILTIN.test(n) || !n ? `#${n || "string"}` : `@${n}`; }
    def.attrs.push({ n: a.attrs.name, req: a.attrs.use === "required", t });
  }
  if (conflicts.length) def.conflicts = conflicts;
  complexTypes[id] = def;
  return id;
}

const roots = [];
for (const f of FILES) roots.push(parseCfdiXml(await load(f)).root);
for (const r of roots) for (const c of kids(r, "complexType")) complexNodes[c.attrs.name] = c;
for (const r of roots) for (const s of kids(r, "simpleType")) {
  if (simpleTypes[`@${s.attrs.name}`]) throw new Error(`two files define ${s.attrs.name}`);
  simpleTypes[`@${s.attrs.name}`] = simple(s);
}
for (const [n, c] of Object.entries(complexNodes)) complex(c, n);
// Key simple-type ids: "@Name" named, "~n" anonymous, "#builtin" (not stored).
const conflicts = Object.values(complexTypes).flatMap((d) => d.conflicts || []);

const body = `// Generated by build-nfe-schema.mjs from leiauteNFe_v4.00.xsd and tiposBasico_v4.00.xsd
// (NF-e package PL_009_V4, nfephp-org/sped-nfe at ${SPED_NFE_COMMIT.slice(0, 12)}). Do not edit by hand; rebuild.
export const COMPLEX = ${JSON.stringify(complexTypes)};
export const SIMPLE = ${JSON.stringify(simpleTypes)};
`;
writeFileSync(new URL("./nfe-xsd-data.mjs", import.meta.url), body);
console.log(`complex ${Object.keys(complexTypes).length}, simple ${Object.keys(simpleTypes).length}, name conflicts ${conflicts.length}${conflicts.length ? ": " + conflicts.join(", ") : ""}, ${body.length} bytes`);
