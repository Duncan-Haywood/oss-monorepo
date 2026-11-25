#!/usr/bin/env node
// Builds the compact schema JSON the checker needs from an IFC EXPRESS (.exp) file.
//
//   node schema/gen-schema.mjs IFC4.exp > schema/ifc4.json
//
// Kept facts only: entity names, supertype, abstract flag, explicit attributes in
// order (name, type, optional, aggregate, and for a list of lists each inner
// level's fixed size as `inner`, and the outer list's least size as `min` when it is 1 or more), which inherited attributes a subtype
// derives (written `*` in a STEP file), inverse attribute names (and, in
// inverseFor, each one's entity and FOR attribute, for ifcXML; in inverseBounds,
// each bound other than [0:?] as [min, max] or [min, max, true] when repeats
// count, for conformance.mjs), and every defined
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
      const at = { name: a[1], type: (of || "").toUpperCase(), optional: !!a[2], aggregate: agg };
      // A list of lists (LIST [1:?] OF LIST [3:3] OF IfcLengthMeasure): each
      // inner level's fixed size, or null when it varies. ifcXML writes such
      // a list flat ("x y z x y z") when the size is fixed.
      const levels = [...tdecl.matchAll(/\b(?:LIST|SET|ARRAY|BAG)\s*\[\s*(\w+)\s*:\s*([\w?]+)\s*\]/g)];
      // The outer list's least size when it is 1 or more (SET [1:?]): an
      // empty list there breaks the schema (conformance.mjs).
      if (agg && levels.length && /^\d+$/.test(levels[0][1]) && Number(levels[0][1]) > 0) at.min = Number(levels[0][1]);
      if (agg && levels.length > 1) at.inner = levels.slice(1).map((l) => (l[1] === l[2] && /^\d+$/.test(l[1]) ? Number(l[1]) : null));
      attrs.push(at);
    }
    const derived = [];
    for (const d of (sections.derive || "").matchAll(/SELF\\(\w+)\.(\w+)\s*:/g)) derived.push(d[2]);
    const inverse = [];
    const inverseFor = {};
    for (const d of (sections.inverse || "").matchAll(/^\s*(\w+)\s*:/gm)) inverse.push(d[1]);
    // Name -> [entity, attribute] from "Name : SET [0:?] OF IfcRelX FOR Attr;".
    // ifcXML nests a relationship under an object's inverse attribute and may
    // leave out the relationship's own pointer back to that object.
    // Bounds other than SET [0:?], as [min, max] (max null for ?): a bare
    // "Name : IfcRelX FOR Attr" is exactly one, SET [1:1] too. Counted
    // against the file in conformance.mjs.
    const inverseBounds = {};
    for (const d of (sections.inverse || "").matchAll(/^\s*(\w+)\s*:[^;]*?\b(\w+)\s+FOR\s+(\w+)\s*;/gm)) {
      inverseFor[d[1]] = [d[2].toUpperCase(), d[3]];
      const b = /:\s*(?:(?:SET|BAG|LIST|ARRAY)\s*\[\s*(\d+)\s*:\s*([\d?]+)\s*\]\s*OF\s+)?\w+\s+FOR\b/.exec(d[0]);
      // A third element true: repeats count (a bare inverse or a BAG; a SET
      // counts each pointing record once). A layer listed twice in one
      // IfcMaterialLayerSet is two ToMaterialLayerSet.
      const bounds = !b ? null : b[1] === undefined ? [1, 1, true] : [Number(b[1]), b[2] === "?" ? null : Number(b[2])];
      if (bounds && b && b[1] !== undefined && /:\s*BAG\b/.test(d[0])) bounds.push(true);
      if (bounds && !(bounds[0] === 0 && bounds[1] === null)) inverseBounds[d[1]] = bounds;
    }
    const ownDerived = [];
    for (const d of (sections.derive || "").matchAll(/^\s*(\w+)\s*:/gm)) ownDerived.push(d[1]);
    entities[name] = { name: m[1], super: sup ? sup.toUpperCase() : null, abstract, attrs, derived, inverse, ownDerived };
    if (Object.keys(inverseFor).length) entities[name].inverseFor = inverseFor;
    if (Object.keys(inverseBounds).length) entities[name].inverseBounds = inverseBounds;
  }
  return { schema, types, entities };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = parseExpress(readFileSync(process.argv[2], "utf8"));
  process.stdout.write(JSON.stringify(s) + "\n");
}
