// Reads the ABRASF municipal NFS-e schemas (Modelo Conceitual ABRASF, layouts 2.00 to
// 2.04, namespace http://www.abrasf.org.br/nfse.xsd) into abrasf-xsd-data.mjs, the table
// abrasf-xsd.mjs checks files against:
//   node build-abrasf-schema.mjs [dir holding the five XSDs, named as below]
// Without a directory it downloads both from the OpenAC-Net/OpenAC.Net.NFSe repository on
// GitHub (MIT, at the pinned commit below; src/OpenAC.Net.NFSe/Schemas/ABRASF/). abrasf.org.br
// did not answer from the build host on 2026-11-13. The copy chosen is the one with the
// official target namespace: the UNINFE-derived copy in akretion/nfselib (LGPL) drops the
// namespace and adds a "1.07" item code, so it was compared (11 diff lines) and not used.
// The XSDs are not copied into the tree: the data module holds facts read from them (each
// complex type's content model with occurrence counts, attributes, and each simple type's
// length, pattern, range, digit and enumeration facets). ds:Signature is free content
// (xmldsig is not read). It throws on any construct it does not model.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCfdiXml } from "./cfdi-xml.mjs";

const OPENAC_COMMIT = "cac2bb13ebe583e62e921229313c41fe0bbcf94f";
const MIRROR = `https://raw.githubusercontent.com/OpenAC-Net/OpenAC.Net.NFSe/${OPENAC_COMMIT}/src/OpenAC.Net.NFSe/Schemas/ABRASF`;
// 2.00-2.02 are published there with a space in the name ("nfse v201.xsd").
const FILES = { "2.00": "2.00/nfse v200.xsd", "2.01": "2.01/nfse v201.xsd", "2.02": "2.02/nfse v202.xsd", "2.03": "2.03/nfse_v203.xsd", "2.04": "2.04/nfse_v204.xsd" };
const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const XSD = "http://www.w3.org/2001/XMLSchema";

async function load(rel) {
  const dir = process.argv[2];
  if (dir) return readFileSync(join(dir, rel.split("/").pop()), "utf8");
  const res = await fetch(`${MIRROR}/${rel.split("/").map(encodeURIComponent).join("/")}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.text();
}

const UNSUPPORTED = new Set(["any", "group", "list", "union", "key", "unique", "keyref", "all", "attributeGroup", "anyAttribute", "complexContent", "simpleContent"]);
const BUILTIN = new Set(["string", "normalizedString", "token", "decimal", "integer", "nonNegativeInteger", "positiveInteger", "byte", "unsignedByte", "short", "int", "long", "date", "dateTime", "boolean", "base64Binary", "anyURI"]);

function compile(text) {
  const schema = parseCfdiXml(text).root;
  const complex = {}, simple = {}, globals = {};
  let anon = 0;
  const local = (q) => (q ? q.replace(/^.*:/, "") : q);
  const occurs = (n) => ({ min: Number(n.attrs.minOccurs ?? 1), max: n.attrs.maxOccurs === "unbounded" ? -1 : Number(n.attrs.maxOccurs ?? 1) });
  const check = (node) => {
    for (const c of node.children) {
      if (c.ns === XSD && UNSUPPORTED.has(c.name)) throw new Error(`XSD construct <${c.name}> is not modelled`);
      check(c);
    }
  };
  check(schema);
  const simpleDef = (node) => {
    const r = node.children.find((c) => c.name === "restriction");
    const s = { base: local(r.attrs.base) };
    const patterns = [], enums = [];
    for (const f of r.children) {
      const v = f.attrs.value;
      if (f.name === "pattern") patterns.push(v);
      else if (f.name === "enumeration") enums.push(v);
      else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits"].includes(f.name)) s[f.name] = Number(v);
      else if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].includes(f.name)) s[f.name] = Number(v);
      else if (f.name === "whiteSpace") s.whiteSpace = v;
    }
    if (patterns.length) s.pattern = patterns;
    if (enums.length) s.enum = enums;
    return s;
  };
  const particle = (node, path) => {
    if (node.name === "element") {
      if (node.attrs.ref) {
        const q = node.attrs.ref;
        const prefix = q.includes(":") ? q.slice(0, q.indexOf(":")) : "";
        if ((node.nsmap[prefix] ?? "") === DSIG) return { k: "e", name: local(q), type: "#any", ...occurs(node) };
        return { k: "e", name: local(q), type: `@ref:${local(q)}`, ...occurs(node) };
      }
      let type = local(node.attrs.type);
      const ic = node.children.find((c) => c.name === "complexType");
      const is = node.children.find((c) => c.name === "simpleType");
      if (ic) { type = `#${path}/${node.attrs.name}`; complexDef(ic, type); }
      else if (is) { type = `#${path}/${node.attrs.name}`; simple[type] = simpleDef(is); }
      return { k: "e", name: node.attrs.name, type: type ?? "string", ...occurs(node) };
    }
    if (node.name === "sequence" || node.name === "choice") {
      const items = node.children.filter((c) => ["element", "sequence", "choice"].includes(c.name)).map((c) => particle(c, path));
      return { k: node.name === "sequence" ? "s" : "c", ...occurs(node), items };
    }
    throw new Error(`unexpected <${node.name}> in a content model`);
  };
  const attrDef = (a) => {
    let type = local(a.attrs.type);
    const inline = a.children.find((c) => c.name === "simpleType");
    if (inline) { type = `#attr${++anon}`; simple[type] = simpleDef(inline); }
    return { name: a.attrs.name, type: type ?? "string", use: a.attrs.use ?? "optional" };
  };
  function complexDef(node, name) {
    const model = node.children.find((c) => c.name === "sequence" || c.name === "choice");
    complex[name] = { model: model ? particle(model, name) : null, attrs: node.children.filter((c) => c.name === "attribute").map(attrDef) };
  }
  for (const n of schema.children) {
    if (n.ns !== XSD) continue;
    if (n.name === "complexType") complexDef(n, n.attrs.name);
    else if (n.name === "simpleType") simple[n.attrs.name] = simpleDef(n);
    else if (n.name === "element") {
      const ic = n.children.find((c) => c.name === "complexType");
      const type = ic ? `#${n.attrs.name}` : local(n.attrs.type);
      if (ic) complexDef(ic, type);
      globals[n.attrs.name] = type;
    }
  }
  // Resolve local element refs to the global element's type; check every type exists.
  const missing = new Set();
  const see = (t) => { if (t && t !== "#any" && !complex[t] && !simple[t] && !BUILTIN.has(t)) missing.add(t); };
  const walk = (p) => {
    if (!p) return;
    if (p.k === "e") {
      if (p.type.startsWith("@ref:")) { const g = p.type.slice(5); if (!globals[g]) throw new Error(`ref to unknown element ${g}`); p.type = globals[g]; }
      see(p.type);
    } else p.items.forEach(walk);
  };
  for (const d of Object.values(complex)) { walk(d.model); d.attrs.forEach((a) => see(a.type)); }
  for (const s of Object.values(simple)) { see(s.base); for (const p of s.pattern ?? []) new RegExp(`^(?:${p})$`, "u"); }
  if (missing.size) throw new Error(`unknown types: ${[...missing].join(", ")}`);
  return { namespace: schema.attrs.targetNamespace, roots: globals, complex, simple };
}

const versions = {};
for (const [v, rel] of Object.entries(FILES)) versions[v] = compile(await load(rel));
const out = { source: `ABRASF NFS-e XSD ${Object.values(FILES).join(", ")} via OpenAC-Net/OpenAC.Net.NFSe at ${OPENAC_COMMIT.slice(0, 12)} (MIT)`, versions };
// Five layouts repeat most definitions (above all the LC 116/2003 item list), so a type
// whose definition is the same in two or more layouts is written once as a constant and
// referenced from each; the module still exports one plain object per layout.
const seen = new Map();
for (const d of Object.values(versions)) for (const kind of ["complex", "simple"]) for (const def of Object.values(d[kind])) {
  const j = JSON.stringify(def);
  if (j.length > 40) seen.set(j, (seen.get(j) ?? 0) + 1);
}
const shared = new Map([...seen].filter(([, n]) => n > 1).map(([j], i) => [j, `t${i}`]));
const table = (o) => `{${Object.entries(o).map(([k, def]) => { const j = JSON.stringify(def); return `${JSON.stringify(k)}:${shared.get(j) ?? j}`; }).join(",")}}`;
const layout = (d) => `{"namespace":${JSON.stringify(d.namespace)},"roots":${JSON.stringify(d.roots)},"complex":${table(d.complex)},"simple":${table(d.simple)}}`;
const body = `// Generated by build-abrasf-schema.mjs; do not edit by hand, rebuild.\n${[...shared].map(([j, n]) => `const ${n} = ${j};\n`).join("")}export default {"source":${JSON.stringify(out.source)},"versions":{${Object.entries(versions).map(([v, d]) => `${JSON.stringify(v)}:${layout(d)}`).join(",")}}};\n`;
writeFileSync(new URL("./abrasf-xsd-data.mjs", import.meta.url), body);
for (const [v, d] of Object.entries(versions)) console.log(`${v}: ${Object.keys(d.complex).length} complex, ${Object.keys(d.simple).length} simple, ${Object.keys(d.roots).length} root elements`);
console.log(`${body.length} bytes`);
