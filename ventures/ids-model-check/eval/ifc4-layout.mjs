// Writes a STEP model as ifcXML in the nested IFC4 layout that real IFC4
// writers use (GeometryGymIFC's output, buildingSMART's IFC4 ADD2 TC1 Annex E
// examples; eval/ifcxml-twins-2026-11-18.md): one <ifcXML> root, simple
// attributes as XML attributes (Name="Wall", Coordinates="0 0 0"), every
// entity written in full the first time it is used and by href="iN" after
// that, select values as <IfcLabel-wrapper>, and relationships nested under
// the inverse attribute of the object they point back to (<IsDecomposedBy>
// <IfcRelAggregates ..>), their pointer back left out. Starting from the
// IfcProject, a whole model ends up under one top-level element. Eval only;
// the checker does not write ifcXML. eval/ifc4-layout-scale-2026-11-18.md.
//
//   node eval/ifc4-layout.mjs model.ifc out.ifcxml   (IFC4, IFC4X3 models)
//   node eval/ifc4-layout.mjs --check model.ifc      (round trip: every
//     entity's arguments read back from the XML equal the STEP reader's)
//   --single-only: nest only relationships with a single-valued pointer back
//     (IsDecomposedBy, ContainsElements), not list ones (IsDefinedBy)

import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseStep } from "../step.mjs";
import { parseIfcXml } from "../ifcxml.mjs";
import { Schema } from "../ids.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");

const NS = {
  IFC4: "http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2",
  IFC4X3: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/ifcXML",
};

// emit(string) receives the file in pieces, in order.
export function writeIfc4Layout(step, schema, schemaId, emit, opts = {}) {
  const name = (t) => (schema.entities[t] ? schema.entities[t].name : t);
  const isA = (type, sup) => {
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) if (t === sup) return true;
    return false;
  };
  const prim = (t) => schema.prim(t);
  const scalarText = (v) => (typeof v === "boolean" ? String(v) : v && v.enum ? v.enum.toLowerCase() : v && v.unknown ? "unknown" : v && v.binary !== undefined ? v.binary : esc(v));
  const isPlain = (v) => v !== null && v !== undefined && (typeof v !== "object" || v.enum !== undefined || v.unknown || v.binary !== undefined);
  // A list written as text: numbers only (strings may hold spaces).
  const numList = (v) => Array.isArray(v) && v.every((x) => typeof x === "number");
  const numRows = (v, a) => Array.isArray(v) && a.inner && a.inner.length === 1 && a.inner[0] && v.length && v.every((r) => Array.isArray(r) && r.length === a.inner[0] && numList(r));

  // Relationships that point back at one object through a single-valued
  // attribute an inverse of that object's class names: nested under it.
  // target id -> [[inverse name, relationship entity, attribute index]]
  const nestUnder = new Map();
  if (!opts.flat) {
    const invs = new Map(); // relationship type -> [[attr index, inverse name, target supertype]]
    const invsOf = (relType) => {
      let l = invs.get(relType);
      if (l) return l;
      l = [];
      const attrs = schema.attrs(relType);
      for (const [t, ent] of Object.entries(schema.entities)) {
        if (!ent.inverseFor) continue;
        for (const [inv, [rt, an]] of Object.entries(ent.inverseFor)) {
          if (!isA(relType, rt)) continue;
          const i = attrs.index.get(an);
          if (i !== undefined && (!attrs[i].aggregate || opts.lists !== false)) l.push([i, inv, t, attrs[i].aggregate]);
        }
      }
      invs.set(relType, l);
      return l;
    };
    for (const e of step.entities.values()) {
      if (!schema.entities[e.type] || !isA(e.type, "IFCRELATIONSHIP")) continue;
      // Objects first (IsDefinedBy under the wall, not DefinesOccurrence under
      // its property set), so the spatial tree reaches every set; then
      // single-valued pointers (IsDecomposedBy before HasAssignments).
      const rank = ([, , t, agg]) => (isA(t, "IFCOBJECTDEFINITION") ? 0 : 2) + (agg ? 1 : 0);
      const order = invsOf(e.type).slice().sort((a, b) => rank(a) - rank(b));
      for (const [i, inv, t, agg] of order) {
        // A relationship listing several objects (IsDefinedBy, HasAssignments)
        // nests under the first one, as GeometryGymIFC writes it; its list
        // stays written, the parent by href.
        const v = agg ? (Array.isArray(e.args[i]) ? e.args[i][0] : null) : e.args[i];
        const target = v && v.ref !== undefined ? step.entities.get(v.ref) : null;
        if (!target || !isA(target.type, t)) continue;
        let l = nestUnder.get(target.id);
        if (!l) nestUnder.set(target.id, (l = []));
        l.push([inv, e, agg ? -1 : i]);
        break; // one parent per relationship
      }
    }
  }
  const written = new Set();
  const nestedRel = new Set();
  for (const l of nestUnder.values()) for (const [, r] of l) nestedRel.add(r.id);

  let buf = "";
  const out = (s) => { buf += s; if (buf.length > 1 << 20) { emit(buf); buf = ""; } };

  // One value inside a list or under an attribute element.
  function item(v, declared, pos) {
    const p = pos === undefined ? "" : ` pos="${pos}"`;
    if (v && v.ref !== undefined) {
      const t = step.entities.get(v.ref);
      if (!t || !schema.entities[t.type]) return out(`<${name(declared)}${p} href="i${v.ref}" xsi:nil="true"/>`);
      if (written.has(t.id)) return out(`<${name(t.type)}${p} href="i${t.id}" xsi:nil="true"/>`);
      return entity(t, name(t.type), "");
    }
    if (v && v.typed) {
      const tn = name(v.typed) || v.typed;
      const w = schema.types[v.typed] ? schema.types[v.typed].name || tn : tn;
      if (Array.isArray(v.value)) return out(`<${w}-wrapper${p}>${v.value.map(scalarText).join(" ")}</${w}-wrapper>`);
      return out(`<${w}-wrapper${p}>${scalarText(v.value)}</${w}-wrapper>`);
    }
    if (Array.isArray(v)) {
      out(`<Seq-wrapper${p}>`);
      v.forEach((x, j) => item(x, declared, j));
      return out(`</Seq-wrapper>`);
    }
    const w = typeof v === "number" ? "double" : typeof v === "boolean" ? "boolean" : "string";
    return out(`<ex:${w}-wrapper${p}>${scalarText(v)}</ex:${w}-wrapper>`);
  }

  // An entity's element, written in full: `tag` is its own class name, or an
  // attribute's name with xsi:type (`xt`) naming the class.
  function entity(e, tag, xt, skip = -1) {
    written.add(e.id);
    const attrs = schema.attrs(e.type);
    let head = `<${tag}${xt}`;
    const kids = [];
    attrs.forEach((a, i) => {
      if (i === skip || a.derived) return;
      const v = e.args[i];
      if (v === null || v === undefined || (v && v.derived)) return;
      if (isPlain(v) && !a.aggregate) head += ` ${a.name}="${scalarText(v)}"`;
      else if (a.aggregate && numList(v) && !a.inner) head += ` ${a.name}="${v.join(" ")}"`;
      else if (a.aggregate && numRows(v, a)) head += ` ${a.name}="${v.map((r) => r.join(" ")).join(" ")}"`;
      else kids.push([a, v]);
    });
    head += ` id="i${e.id}"`;
    const nested = (nestUnder.get(e.id) || []).filter(([, r]) => !written.has(r.id));
    if (!kids.length && !nested.length) return out(head + "/>");
    out(head + ">");
    for (const [a, v] of kids) {
      if (Array.isArray(v)) {
        out(`<${a.name}>`);
        v.forEach((x, j) => item(x, a.type, j));
        out(`</${a.name}>`);
      } else if (v.ref !== undefined) {
        const t = step.entities.get(v.ref);
        if (!t || !schema.entities[t.type]) out(`<${a.name} href="i${v.ref}" xsi:nil="true"/>`);
        else if (written.has(t.id)) out(`<${a.name} xsi:type="${name(t.type)}" href="i${t.id}" xsi:nil="true"/>`);
        else entity(t, a.name, ` xsi:type="${name(t.type)}"`);
      } else {
        out(`<${a.name}>`);
        item(v, a.type);
        out(`</${a.name}>`);
      }
    }
    // Relationships under the inverse they belong to, grouped by name.
    const groups = new Map();
    for (const [inv, r, i] of nested) {
      if (!groups.has(inv)) groups.set(inv, []);
      groups.get(inv).push([r, i]);
    }
    for (const [inv, list] of groups) {
      const todo = list.filter(([r]) => !written.has(r.id));
      if (!todo.length) continue;
      out(`<${inv}>`);
      for (const [r, i] of todo) if (!written.has(r.id)) entity(r, name(r.type), "", i);
      out(`</${inv}>`);
    }
    out(`</${tag}>`);
  }

  out(`<?xml version="1.0" encoding="UTF-8"?>\n<ifc:ifcXML xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common" xmlns:ifc="${NS[schemaId] || NS.IFC4}" xmlns="${NS[schemaId] || NS.IFC4}">\n`);
  out(`<header><name>${schemaId} nested layout from STEP</name></header>\n`);
  // The project first, so the spatial tree hangs from it; then anything not
  // yet reached, each as its own top-level element. A relationship nested
  // under a parent is left for that parent.
  const roots = [];
  for (const e of step.entities.values()) if (schema.entities[e.type] && isA(e.type, "IFCCONTEXT")) roots.push(e);
  for (const e of step.entities.values()) if (schema.entities[e.type] && !nestedRel.has(e.id)) roots.push(e);
  for (const e of step.entities.values()) if (schema.entities[e.type]) roots.push(e);
  for (const e of roots) {
    if (written.has(e.id)) continue;
    // A nested relationship whose parent was never written (its parent type
    // is unknown here) is written at the top with its pointer.
    entity(e, name(e.type), "");
    out("\n");
  }
  out(`</ifc:ifcXML>\n`);
  emit(buf);
}

// Arguments with references written by STEP number, for comparing two reads.
function norm(v, idOf) {
  if (Array.isArray(v)) return v.map((x) => norm(x, idOf));
  if (v && typeof v === "object") {
    if (v.ref !== undefined) return { ref: idOf(v.ref) };
    if (v.typed) return { typed: v.typed, value: norm(v.value, idOf) };
  }
  return v;
}

export function schemaIdOf(stepSchema) {
  const s = (stepSchema || "").toUpperCase();
  if (/^IFC4X3|^IFC4X2|^IFC4X1/.test(s)) return "IFC4X3";
  if (/^IFC4/.test(s)) return "IFC4";
  return null;
}

export function loadSchema(id) {
  return new Schema(JSON.parse(readFileSync(new URL(`../schema/${id.toLowerCase()}.json`, import.meta.url))));
}

// Compares every entity of a STEP read with the same model read from ifcXML.
export function roundTrip(step, schema, xml, opts = {}) {
  const x = parseIfcXml(xml, schema, opts);
  const byXml = new Map();
  for (const e of x.entities.values()) if (e.xmlId) byXml.set(e.xmlId, e);
  const stepOf = new Map();
  for (const e of x.entities.values()) stepOf.set(e.id, e.xmlId ? Number(e.xmlId.slice(1)) : -e.id);
  let same = 0, differ = 0, missing = 0, skipped = 0;
  const examples = [];
  const byType = new Map();
  for (const e of step.entities.values()) {
    if (!schema.entities[e.type]) { skipped++; continue; }
    const r = byXml.get("i" + e.id);
    if (!r) { missing++; continue; }
    const a = JSON.stringify(norm(e.args.map((v) => (v && v.derived ? { derived: true } : v)), (n) => n));
    const b = JSON.stringify(norm(r.args, (n) => stepOf.get(n)));
    if (a === b && r.type === e.type) same++;
    else {
      differ++;
      byType.set(e.type, (byType.get(e.type) || 0) + 1);
      if (examples.length < 5) examples.push({ id: e.id, type: e.type, step: a.slice(0, 300), xml: b.slice(0, 300) });
    }
  }
  return { entities: step.entities.size, same, differ, missing, skippedUnknownType: skipped, differByType: Object.fromEntries(byType), xmlErrors: x.errors.slice(0, 5), examples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const single = args.includes("--single-only");
  const rest = args.filter((a) => a !== "--single-only");
  args.length = 0; args.push(...rest);
  const check = args[0] === "--check";
  if (check) args.shift();
  const wopts = { lists: !single };
  const step = parseStep(readFileSync(args[0], "utf8"), { eager: true });
  const id = schemaIdOf(step.schema);
  if (!id) throw new Error(`IFC4 or IFC4X3 only (this file: ${step.schema})`);
  const schema = loadSchema(id);
  if (!check) {
    const fd = openSync(args[1], "w");
    writeIfc4Layout(step, schema, id, (s) => writeSync(fd, s), wopts);
    closeSync(fd);
  } else {
    const parts = [];
    writeIfc4Layout(step, schema, id, (s) => parts.push(s), wopts);
    const xml = parts.join("");
    const lazy = roundTrip(step, schema, xml);
    console.log(JSON.stringify({ xmlBytes: xml.length, schema: id, ...lazy }, null, 1));
  }
}
