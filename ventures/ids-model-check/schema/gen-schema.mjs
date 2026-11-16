#!/usr/bin/env node
// Builds the compact schema JSON the checker needs from an IFC EXPRESS (.exp) file.
//
//   node schema/gen-schema.mjs IFC4.exp > schema/ifc4.json
//
// Kept facts only: entity names, supertype, abstract flag, explicit attributes in
// order (name, type, optional, aggregate), which inherited attributes a subtype
// derives (written `*` in a STEP file), inverse attribute names, and every defined
// type's underlying kind (simple base, enumeration values, select members).
// The EXPRESS schemas are (c) buildingSMART International Limited; their notice
// allows use in software development with full attribution (see README, "Sources").
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseExpress(text) {
  const src = text.replace(/\(\*[\s\S]*?\*\)/g, " ");
  const schema = (src.match(/SCHEMA\s+(\w+)\s*;/) || [])[1] || null;
  const types = {};
  const entities = {};
  for (const m of src.matchAll(/TYPE\s+(\w+)\s*=\s*([\s\S]*?);\s*(?:WHERE[\s\S]*?)?END_TYPE\s*;/g)) {
    const name = m[1].toUpperCase();
    const body = m[2].trim();
    let t;
    let e;
    if ((e = body.match(/^ENUMERATION\s+OF\s*\(([\s\S]*)\)$/))) t = { kind: "enum", values: e[1].split(",").map((s) => s.trim().toUpperCase()) };
    else if ((e = body.match(/^SELECT\s*\(([\s\S]*)\)$/))) t = { kind: "select", members: e[1].split(",").map((s) => s.trim().toUpperCase()) };
    else if ((e = body.match(/^(LIST|SET|ARRAY|BAG)\b[\s\S]*?\bOF\s+(?:UNIQUE\s+)?(\w+)\s*$/))) t = { kind: "aggregate", of: e[2].toUpperCase() };
    else {
      const base = body.replace(/\(.*\)/, "").replace(/\bFIXED\b/, "").trim().toUpperCase();
      t = { kind: "defined", of: base };
    }
    types[name] = t;
  }
  for (const m of src.matchAll(/ENTITY\s+(\w+)([\s\S]*?)END_ENTITY\s*;/g)) {
    const name = m[1].toUpperCase();
    const body = m[2];
    const headEnd = body.indexOf(";");
    const head = body.slice(0, headEnd);
    const sup = (head.match(/SUBTYPE\s+OF\s*\(\s*(\w+)\s*\)/) || [])[1];
    const abstract = /\bABSTRACT\b/.test(head);
    const rest = body.slice(headEnd + 1);
    const sections = { explicit: rest, derive: "", inverse: "" };
    // Split on the section keywords.
    const parts = rest.split(/^\s*(DERIVE|INVERSE|WHERE|UNIQUE)\b/m);
    sections.explicit = parts[0];
    for (let i = 1; i < parts.length; i += 2) sections[parts[i].toLowerCase()] = parts[i + 1];
    const attrs = [];
    for (const line of sections.explicit.split(";")) {
      const a = line.match(/^\s*(\w+)\s*:\s*(OPTIONAL\s+)?([\s\S]+?)\s*$/);
      if (!a) continue;
      const tdecl = a[3].replace(/\s+/g, " ");
      const agg = /^(LIST|SET|ARRAY|BAG)\b/.test(tdecl);
      const of = (tdecl.match(/(\w+)\s*$/) || [])[1];
      attrs.push({ name: a[1], type: (of || "").toUpperCase(), optional: !!a[2], aggregate: agg });
    }
    const derived = [];
    for (const d of (sections.derive || "").matchAll(/SELF\\(\w+)\.(\w+)\s*:/g)) derived.push(d[2]);
    const inverse = [];
    for (const d of (sections.inverse || "").matchAll(/^\s*(\w+)\s*:/gm)) inverse.push(d[1]);
    const ownDerived = [];
    for (const d of (sections.derive || "").matchAll(/^\s*(\w+)\s*:/gm)) ownDerived.push(d[1]);
    entities[name] = { name: m[1], super: sup ? sup.toUpperCase() : null, abstract, attrs, derived, inverse, ownDerived };
  }
  return { schema, types, entities };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = parseExpress(readFileSync(process.argv[2], "utf8"));
  process.stdout.write(JSON.stringify(s) + "\n");
}
