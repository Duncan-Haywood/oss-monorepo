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

// OPENAC_SCHEMAS=<checkout>/src/OpenAC.Net.NFSe/Schemas reads every file from a local
// checkout of the pinned commit instead (paths relative to Schemas/).
async function load(rel, root = MIRROR) {
  const dir = process.argv[2];
  if (dir && root === MIRROR) return readFileSync(join(dir, rel.split("/").pop()), "utf8");
  const local = process.env.OPENAC_SCHEMAS;
  if (local) return readFileSync(root === MIRROR ? join(local, "ABRASF", rel) : join(local, "..", rel), "utf8");
  const res = await fetch(`${root}/${rel.split("/").map(encodeURIComponent).join("/")}`);
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

// Provider layouts. Many city systems publish their own copy of an ABRASF 2.x schema in
// the ABRASF namespace, with their additions (ISSNet's 2.04, Fiorilli's 2.00/2.01, WebISS's
// 2.02, ...). OpenAC.Net.NFSe carries those copies under Schemas/<provider>/<versao>/ and
// says in Resources/Municipios.nfse which provider and layout each city it supports runs.
// Every single-file copy in the ABRASF namespace that this compiler models is read; the rest
// (another namespace, several files, or a construct not modelled) are listed on the console.
const PROVIDER_ROOT = `https://raw.githubusercontent.com/OpenAC-Net/OpenAC.Net.NFSe/${OPENAC_COMMIT}/src/OpenAC.Net.NFSe`;
const PROVIDER_FILES = {
  "Abaco 2.04": "Abaco/2.04/nfse.xsd", "Citta 2.03": "Citta/2.03/nfse.xsd", "Coplan 2.01": "Coplan/2.01/nfse.xsd",
  "DSF 2.00": "DSF/2.00/nfse.xsd", "FintelISS 2.04": "FintelISS/2.04/nfse.xsd", "Fiorilli 2.00": "Fiorilli/2.00/nfse.xsd",
  "Fiorilli 2.01": "Fiorilli/2.01/nfse.xsd", "Fisco 2.03": "Fisco/2.03/nfse.xsd", "GISS 2.04": "GISS/2.04/nfse_v2-04.xsd",
  "GovBR 2.03": "GovBR/2.03/nfse.xsd", "IPM 2.04": "IPM/2.04/nfse.xsd", "ISSCampinas 2.03": "ISSCampinas/2.03/nfse.xsd",
  "ISSNet 2.04": "ISSNet/2.04/nfse.xsd", "ISSPortoVelho 2.00": "ISSPortoVelho/2.00/nfse_v2-04.xsd",
  "ISSPortoVelho 2.03": "ISSPortoVelho/2.03/nfse.xsd", "ISSVitoria 2.00": "ISSVitoria/2.00/nfse.xsd",
  "ISSe 2.00": "ISSe/2.00/nfse.xsd", "ISSe 2.01": "ISSe/2.01/nfse.xsd", "NFeCidades 2.01": "NFeCidades/2.01/nfse.xsd",
  "Pronim 2.02": "Pronim/2.02/nfse.xsd", "Pronim 2.03": "Pronim/2.03/nfse.xsd", "RLZ 2.03": "RLZ/2.03/nfse.xsd",
  "SIAPNet 2.00": "SIAPNet/2.00/nfse.xsd", "Sigep 2.00": "Sigep/2.00/nfse.xsd", "Sigep 2.02": "Sigep/2.02/nfse.xsd",
  "SimplISS 2.03": "SimplISS/2.03/nfse.xsd", "Sintese 2.04": "Sintese/2.04/nfse.xsd", "SmarAPD 2.03": "SmarAPD/2.03/nfse.xsd",
  "SmarAPD 2.04": "SmarAPD/2.04/nfse.xsd", "SystemPro 2.01": "SystemPro/2.01/nfse.xsd", "Tinus 2.03": "Tinus/2.03/nfse.xsd",
  "Tiplan 2.03": "Tiplan/2.03/nfse.xsd", "WebISS 2.02": "WebISS/2.02/nfse.xsd", "WebISS2 2.02": "WebISS2/2.02/nfse.xsd",
};
const providers = {};
for (const [key, rel] of Object.entries(PROVIDER_FILES)) {
  try {
    const d = compile(await load(`Schemas/${rel}`, PROVIDER_ROOT));
    if (d.namespace !== "http://www.abrasf.org.br/nfse.xsd") { console.log(`skip ${key}: namespace ${d.namespace}`); continue; }
    // A copy identical to an ABRASF layout adds nothing; say which, and keep only its name.
    // Otherwise store it as a delta on the ABRASF layout it shares most definitions with:
    // the types it adds or changes, and the names it drops.
    const same = Object.entries(versions).find(([, v]) => JSON.stringify(v) === JSON.stringify(d));
    if (same) { providers[key] = same[0]; continue; }
    const delta = (b) => {
      const r = { base: b, roots: d.roots, complex: {}, simple: {}, drop: [] };
      for (const kind of ["complex", "simple"]) {
        for (const [n, def] of Object.entries(d[kind])) if (JSON.stringify(def) !== JSON.stringify(versions[b][kind][n])) r[kind][n] = def;
        for (const n of Object.keys(versions[b][kind])) if (!(n in d[kind])) r.drop.push(n);
      }
      return r;
    };
    providers[key] = Object.keys(versions).map(delta).sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length)[0];
  } catch (e) { console.log(`skip ${key}: ${e.message}`); }
}

// Which provider and layout each city runs, as OpenAC.Net.NFSe's Municipios.nfse states it:
// IBGE code -> "Provider versao|City/UF". Cities whose provider schema is not read are kept too, so
// the checker can name the system even when it cannot check against it.
const cities = {};
{
  const doc = parseCfdiXml(await load("Resources/Municipios.nfse", PROVIDER_ROOT)).root;
  const kids = (n, name) => n.children.filter((c) => c.name === name);
  for (const m of kids(kids(doc, "Municipios")[0], "Municipio")) {
    const t = (name) => kids(m, name)[0]?.text.trim() ?? "";
    if (/^\d{7}$/.test(t("Codigo"))) cities[t("Codigo")] = `${t("Provedor")} ${t("Versao")}|${t("Nome")}/${t("UF")}`;
  }
}
const out = { source: `ABRASF NFS-e XSD ${Object.values(FILES).join(", ")} and ${Object.keys(providers).length} provider copies via OpenAC-Net/OpenAC.Net.NFSe at ${OPENAC_COMMIT.slice(0, 12)} (MIT)`, versions };
// Five layouts repeat most definitions (above all the LC 116/2003 item list), so a type
// whose definition is the same in two or more layouts is written once as a constant and
// referenced from each; the module still exports one plain object per layout.
const seen = new Map();
for (const d of [...Object.values(versions), ...Object.values(providers).filter((p) => typeof p === "object")]) for (const kind of ["complex", "simple"]) for (const def of Object.values(d[kind])) {
  const j = JSON.stringify(def);
  if (j.length > 40) seen.set(j, (seen.get(j) ?? 0) + 1);
}
const shared = new Map([...seen].filter(([, n]) => n > 1).map(([j], i) => [j, `t${i}`]));
const table = (o) => `{${Object.entries(o).map(([k, def]) => { const j = JSON.stringify(def); return `${JSON.stringify(k)}:${shared.get(j) ?? j}`; }).join(",")}}`;
const layout = (d) => `{"namespace":${JSON.stringify(d.namespace)},"roots":${JSON.stringify(d.roots)},"complex":${table(d.complex)},"simple":${table(d.simple)}}`;
const body = `// Generated by build-abrasf-schema.mjs; do not edit by hand, rebuild.\n${[...shared].map(([j, n]) => `const ${n} = ${j};\n`).join("")}export default {"source":${JSON.stringify(out.source)},"versions":{${Object.entries(versions).map(([v, d]) => `${JSON.stringify(v)}:${layout(d)}`).join(",")}},"providers":{${Object.entries(providers).map(([k, d]) => `${JSON.stringify(k)}:${typeof d === "string" ? JSON.stringify(d) : `{"base":${JSON.stringify(d.base)},"drop":${JSON.stringify(d.drop)},"roots":${JSON.stringify(d.roots)},"complex":${table(d.complex)},"simple":${table(d.simple)}}`}`).join(",")}},"cities":${JSON.stringify(cities)}};\n`;
writeFileSync(new URL("./abrasf-xsd-data.mjs", import.meta.url), body);
for (const [v, d] of Object.entries(versions)) console.log(`${v}: ${Object.keys(d.complex).length} complex, ${Object.keys(d.simple).length} simple, ${Object.keys(d.roots).length} root elements`);
for (const [k, d] of Object.entries(providers)) console.log(`${k}: ${typeof d === "string" ? `same as ABRASF ${d}` : `ABRASF ${d.base} with ${Object.keys(d.complex).length} complex and ${Object.keys(d.simple).length} simple types added or changed, ${d.drop.length} dropped`}`);
console.log(`${Object.keys(cities).length} cities`);
console.log(`${body.length} bytes`);
