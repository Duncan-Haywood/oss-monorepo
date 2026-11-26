// Reads the Agenzia delle Entrate FatturaPA schema (XSD 1.2.3, the schema of
// technical specification 1.9, in force from 1 April 2025) into
// fatturapa-xsd-data.mjs, the table fatturapa-xsd.mjs checks files against:
//   node build-fatturapa-schema.mjs [path/to/Schema_VFPR12_v1.2.3.xsd]
// Without a path it downloads the copy in phax/ph-fatturapa (Apache-2.0,
// docs/1.2.3) and refuses it unless its SHA-256 is the pinned
// one below (BOM dropped, CRLF folded to LF). fatturapa.gov.it and agenziaentrate.gov.it refuse the build host, so
// the pin was set from three independent copies that agree byte for byte
// (phax/ph-fatturapa, LucaCappelletti94/fatturapa, amusarra/dontesta-fisco-hub;
// two more, invopop/gobl.it.sdi and deved-it/fattura-elettronica, differ only in
// the xmldsig import path, documentation text and, in deved's FPR12-only copy,
// the FPA12 code). On 2026-11-13 agenziaentrate.gov.it answered a cloud session and
// its own Schema_VFPR12_v1.2.3.xsd (/portale/documents/d/guest/schema_vfpr12_v1-2-3)
// hashed to the same pin, so the pin is the Agenzia's file. The XSD is not copied into the tree: the data module holds
// only facts read from it (element order, occurrence counts, facets, code lists,
// and the codes the schema's own comments say are no longer valid).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseXmlTree } from "./ubl.mjs";

const URL_123 = "https://raw.githubusercontent.com/phax/ph-fatturapa/master/docs/1.2.3/Schema_VFPR12_v1.2.3.xsd";
const SHA256_123 = "ea951ee851892ae089bec3af84b76fcb1025ddecc88603ffc67c927e79dba27a";

let text;
const path = process.argv[2];
if (path) text = readFileSync(path, "utf8");
else {
  const res = await fetch(URL_123);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  text = await res.text();
}
text = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
const digest = createHash("sha256").update(text).digest("hex");
if (!path && digest !== SHA256_123) throw new Error(`unexpected schema: sha256 ${digest}`);
const xsd = parseXmlTree(text);
const schema = xsd.children.find((n) => n.name === "schema");
const named = (n, name) => n.children.filter((c) => c.name === name);

// A content model is a list of steps: {el, type, min, max} or {choice: [[steps], ...]}.
function steps(node) {
  const out = [];
  for (const c of node.children) {
    if (c.name === "element" && c.attrs.ref) {
      out.push({ el: c.attrs.ref.replace(/^.*:/, ""), type: "any", min: Number(c.attrs.minOccurs ?? 1), max: 1 });
    } else if (c.name === "element") {
      out.push({ el: c.attrs.name, type: c.attrs.type, min: Number(c.attrs.minOccurs ?? 1), max: c.attrs.maxOccurs === "unbounded" ? -1 : Number(c.attrs.maxOccurs ?? 1), ...(c.attrs.default !== undefined && { default: c.attrs.default }) });
    } else if (c.name === "sequence") out.push(...steps(c));
    else if (c.name === "choice") out.push({ choice: c.children.filter((x) => x.name === "sequence" || x.name === "element").map((x) => (x.name === "element" ? steps({ children: [x] }) : steps(x))) });
  }
  return out;
}

// The tree reader leaves attribute entities as written (&quot; in EmailType's pattern).
const decode = (v) => v === undefined ? v : v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const complex = {};
for (const t of named(schema, "complexType")) {
  const seq = t.children.find((c) => c.name === "sequence");
  complex[t.attrs.name] = steps(seq);
}
const simple = {};
const enums = {};
for (const t of named(schema, "simpleType")) {
  const r = t.children.find((c) => c.name === "restriction");
  const s = { base: r.attrs.base.replace(/^xs:/, "") };
  const patterns = [];
  const codes = [];
  for (const f of r.children) {
    const v = decode(f.attrs.value);
    if (f.name === "pattern") patterns.push(v);
    else if (f.name === "enumeration") codes.push(v);
    else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits"].includes(f.name)) s[f.name] = Number(v);
    else if (["minInclusive", "maxInclusive"].includes(f.name)) s[f.name] = Number(v);
  }
  if (patterns.length) s.pattern = patterns;
  if (codes.length) enums[t.attrs.name] = codes;
  simple[t.attrs.name] = s;
}
// The schema keeps N2, N3 and N6 in NaturaType for old files, each under a comment
// "IL CODICE SEGUENTE (N2) NON SARA' PIU' VALIDO PER LE FATTURE EMESSE A PARTIRE
// DAL PRIMO GENNAIO 2021". The comment is the only place that says so, so read it.
const retired = [...text.matchAll(/<!--\s*IL CODICE SEGUENTE \(([A-Z0-9.]+)\) NON SARA' PIU' VALIDO[^>]*?(\d{1,2}|PRIMO) GENNAIO (\d{4})\s*-->/g)]
  .map((m) => ({ code: m[1], type: Object.keys(enums).find((t) => enums[t].includes(m[1])), from: `${m[3]}-01-${m[2] === "PRIMO" ? "01" : m[2].padStart(2, "0")}` }));
const version = (/<xs:documentation>[^<]*?(\d+\.\d+\.\d+)\s*<\/xs:documentation>/.exec(text) || [])[1] ?? "unknown";
const root = named(schema, "element")[0];
const out = { source: `Agenzia delle Entrate FatturaPA XSD ${version} (sha256 ${digest.slice(0, 16)}..., BOM dropped, LF line ends)`, version, root: root.attrs.type, complex, simple, enums, retired };
writeFileSync(new URL("./fatturapa-xsd-data.mjs", import.meta.url),
  `// Generated by build-fatturapa-schema.mjs; do not edit.\nexport default ${JSON.stringify(out)};\n`);
console.log(`XSD ${version}: ${Object.keys(complex).length} complex types, ${Object.keys(simple).length} simple types, ${Object.keys(enums).length} enumerations, retired ${retired.map((r) => r.code).join(", ") || "none"}`);
