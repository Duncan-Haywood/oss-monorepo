// Reads Spain's Facturae schemas (versions 3.2.1 and 3.2.2, the XSDs published by
// the Ministerio de Hacienda at facturae.gob.es) into facturae-xsd-data.mjs, the
// tables facturae-xsd.mjs checks files against:
//   node build-facturae-schema.mjs [Facturaev3_2_1.xml Facturaev3_2_2.xml]
// Without paths it downloads both from facturae.gob.es (answered a cloud session
// on 2026-11-15) and refuses either unless its SHA-256 is the pinned one below
// (BOM dropped, CRLF folded to LF). The XSDs are not copied into the tree: the
// data module holds only facts read from them (element order, occurrence counts,
// facets and code lists).
//
// Facturae differs from FatturaPA's schema in three ways this reader handles:
// anonymous complex types inside elements (the root, TaxesOutputs, Tax), named
// as "<parent type>/<element>"; one complexContent extension (Tax extends
// TaxOutputType), stored as the base type's model; and an xs:any in
// ExtensionsType, stored as {any: true}.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseXmlTree } from "./ubl.mjs";

const BASE = "https://www.facturae.gob.es/content/dam/facturae/formato/versiones/";
const PINS = {
  "3.2.1": { file: "Facturaev3_2_1.xml", sha256: "f58439b665d87e616a43afc2a200ab18fa6bbb33b9b0aa16dfa6694fe48f305e" },
  "3.2.2": { file: "Facturaev3_2_2.xml", sha256: "5f8c8440e1aa3a126ff03239ab2fb5b9eec2840f74e32392005c1a6481f73e58" },
};

const decode = (v) => v === undefined ? v : v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const named = (n, name) => n.children.filter((c) => c.name === name);

function read(text) {
  const xsd = parseXmlTree(text);
  const schema = xsd.children.find((n) => n.name === "schema");
  const complex = {};
  const simple = {};
  const enums = {};

  // A content model is a list of steps: {el, type, min, max} or {choice: [[steps], ...]} or {any: true}.
  function steps(node, owner) {
    const out = [];
    for (const c of node.children) {
      if (c.name === "element" && c.attrs.ref) {
        out.push({ el: c.attrs.ref.replace(/^.*:/, ""), type: "any", min: Number(c.attrs.minOccurs ?? 1), max: 1 });
      } else if (c.name === "element") {
        // Kept as written: Facturae's own types are unprefixed, the built-ins keep xs: (facturae-xsd.mjs reads that).
        let type = c.attrs.type || undefined;
        if (!type) {
          const inline = c.children.find((x) => x.name === "complexType");
          type = `${owner}/${c.attrs.name}`;
          complexModel(inline, type);
        }
        out.push({ el: c.attrs.name, type, min: Number(c.attrs.minOccurs ?? 1), max: c.attrs.maxOccurs === "unbounded" ? -1 : Number(c.attrs.maxOccurs ?? 1), ...(c.attrs.default !== undefined && { default: c.attrs.default }) });
      } else if (c.name === "sequence") out.push(...steps(c, owner));
      else if (c.name === "choice") out.push({ ...(c.attrs.minOccurs === "0" && { min: 0 }), choice: c.children.filter((x) => x.name === "sequence" || x.name === "element").map((x) => (x.name === "element" ? steps({ children: [x] }, owner) : steps(x, owner))) });
      else if (c.name === "any") out.push({ any: true, min: Number(c.attrs.minOccurs ?? 1), max: c.attrs.maxOccurs === "unbounded" ? -1 : Number(c.attrs.maxOccurs ?? 1) });
    }
    return out;
  }
  function complexModel(node, name) {
    const content = node.children.find((c) => c.name === "complexContent");
    if (content) {
      const ext = content.children.find((c) => c.name === "extension");
      complex[name] = { extends: ext.attrs.base };
      return;
    }
    const seq = node.children.find((c) => c.name === "sequence");
    complex[name] = seq ? steps(seq, name) : [];
  }
  for (const t of named(schema, "complexType")) complexModel(t, t.attrs.name);
  // An extension with no added content has its base's model.
  for (const [name, model] of Object.entries(complex)) if (model.extends) complex[name] = complex[model.extends];
  for (const t of named(schema, "simpleType")) {
    const r = t.children.find((c) => c.name === "restriction");
    const s = { base: r.attrs.base.replace(/^xs:/, "") };
    const patterns = [];
    const codes = [];
    for (const f of r.children) {
      const v = decode(f.attrs.value);
      if (f.name === "pattern") patterns.push(v);
      else if (f.name === "enumeration") codes.push(v);
      else if (["length", "minLength", "maxLength", "totalDigits", "fractionDigits", "minInclusive", "maxInclusive"].includes(f.name)) s[f.name] = Number(v);
    }
    if (patterns.length) s.pattern = patterns;
    if (codes.length) enums[t.attrs.name] = codes;
    simple[t.attrs.name] = s;
  }
  const rootEl = named(schema, "element")[0];
  complexModel(rootEl.children.find((c) => c.name === "complexType"), "Facturae");
  return { namespace: schema.attrs.targetNamespace, version: schema.attrs.version, root: "Facturae", complex, simple, enums };
}

const out = {};
const args = process.argv.slice(2);
for (const [i, [version, pin]] of Object.entries(PINS).entries()) {
  let text;
  if (args[i]) text = readFileSync(args[i], "utf8");
  else {
    const res = await fetch(BASE + pin.file);
    if (!res.ok) throw new Error(`download of ${pin.file} failed: HTTP ${res.status}`);
    text = await res.text();
  }
  text = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const digest = createHash("sha256").update(text).digest("hex");
  if (digest !== pin.sha256) throw new Error(`unexpected ${pin.file}: sha256 ${digest}`);
  const table = read(text);
  if (table.version !== version) throw new Error(`${pin.file} says version ${table.version}`);
  out[version] = { source: `facturae.gob.es ${pin.file} (sha256 ${digest.slice(0, 16)}..., BOM dropped, LF line ends)`, ...table };
  console.log(`Facturae ${version}: ${Object.keys(table.complex).length} complex types, ${Object.keys(table.simple).length} simple types, ${Object.keys(table.enums).length} enumerations, namespace ${table.namespace}`);
}
writeFileSync(new URL("./facturae-xsd-data.mjs", import.meta.url),
  `// Generated by build-facturae-schema.mjs; do not edit.\nexport default ${JSON.stringify(out)};\n`);
