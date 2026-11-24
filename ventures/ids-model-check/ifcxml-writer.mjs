// Writes a STEP model as ifcXML laid out as buildingSMART's ifcXML schema
// (XSD) says, so the file validates against it: IFC4 ADD2
// (http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2, the namespace
// buildingSMART's own IFC4 ADD2 TC1 Annex E examples use) or IFC4X3 ADD2.
//
// What the XSD fixes, read from it by schema/gen-ifcxml-layout.py into
// schema/ifcxml-layout-<schema>.json:
// - which attributes are XML attributes (simple values and number lists:
//   Name="Wall", Coordinates="0 0 0") and which are child elements, and the
//   order of the elements: supertype's first, each level's own in order;
// - which inverse attributes may hold a nested relationship (23 in IFC4:
//   IsDecomposedBy, ContainsElements, IsDefinedBy, HasOpenings ...), and
//   which pointers back are left out of the relationship itself
//   (IfcRelAggregates has no RelatingObject element: it is the element it
//   sits under). A relationship with such a pointer is written under every
//   object it points at: in full the first time, by href after that.
//
// An entity is written in full where it is first used and by href="iN" after
// that; starting from the IfcProject, the spatial tree ends up under one
// element, as in real IFC4 writers' files (eval/ifc4-layout-scale-2026-11-18.md).
// The reader (ifcxml.mjs) puts every pointer back from where the relationship
// sits. Where the XSD leaves a pointer out but the object it points at has no
// inverse to hold the relationship (a class the configuration gives none),
// the pointer is written anyway, so nothing is lost; the file then breaks the
// XSD at that element and `stats.keptPointers` counts it.
//
//   import { writeIfcXml } from "./ifcxml-writer.mjs";
//   const stats = writeIfcXml(step, "IFC4", (piece) => out.write(piece));
//
// eval/ifcxml-export-2026-11-24.md: how it was checked (xmllint against the
// two XSDs, and every entity read back equal to the STEP reader's).

import { readFileSync } from "node:fs";
import { Schema } from "./ids.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");

const cache = new Map();
// The schema and its ifcXML layout for "IFC4" or "IFC4X3".
export function ifcXmlTarget(id) {
  let t = cache.get(id);
  if (t) return t;
  const read = (f) => JSON.parse(readFileSync(new URL(`./schema/${f}`, import.meta.url)));
  t = { id, schema: new Schema(read(`${id.toLowerCase()}.json`)), layout: read(`ifcxml-layout-${id.toLowerCase()}.json`) };
  cache.set(id, t);
  return t;
}

// The ifcXML schema a STEP FILE_SCHEMA name is written in, or null (IFC2X3
// ifcXML is another layout, not written here).
export function ifcXmlSchemaFor(stepSchema) {
  const s = (stepSchema || "").toUpperCase();
  if (/^IFC4X3/.test(s)) return "IFC4X3";
  if (/^IFC4X[12]/.test(s)) return null; // drafts: types IFC4X3 removed
  if (/^IFC4/.test(s)) return "IFC4";
  return null;
}

// Numbers as STEP wrote them where they round trip; JavaScript's shortest
// form otherwise. Never a decimal comma (the reader takes one, the XSD not).
const num = (x) => (Number.isFinite(x) ? String(x) : x > 0 ? "INF" : x < 0 ? "-INF" : "NaN");

export function writeIfcXml(step, id, emit, opts = {}) {
  const { schema, layout } = ifcXmlTarget(id);
  const E = schema.entities;
  const name = (t) => (E[t] ? E[t].name : t);
  const isA = (type, sup) => schema.isA(type, sup);
  const stats = { entities: 0, nestedRelationships: 0, keptPointers: 0, keptPointerTypes: {}, unknownTypes: 0, spacedListItems: 0, raggedLists: 0, danglingRefs: 0, binaryBits: 0 };
  const rowsKept = new Set(layout.rows || []);
  const fromStep = opts.fromStep !== false;

  // Per class: XML attribute names, ordered element names (explicit
  // attributes and inverses), attributes the XSD leaves out, and the
  // inverses by name.
  const shapes = new Map();
  function shapeOf(type) {
    let s = shapes.get(type);
    if (s) return s;
    const chain = [];
    for (let t = type; t && E[t]; t = E[t].super) chain.unshift(t);
    let xa = [], el = [];
    const inv = new Map();
    for (const t of chain) {
      for (const [n, f] of Object.entries(E[t].inverseFor || {})) inv.set(n, f);
      const row = layout.entities[E[t].name];
      if (!row) continue;
      if (row[2]) { xa = [...row[0]]; el = [...row[1]]; } else { xa.push(...row[0]); el.push(...row[1]); }
    }
    // "=HasOpenings:1": the inverse's element is the relationship itself,
    // at most once with ":1"; a plain name holds a list of them.
    const direct = new Map();
    el = el.map((n) => {
      if (n[0] !== "=") return n;
      const [m, max] = n.slice(1).split(":");
      direct.set(m, max ? Number(max) : Infinity);
      return m;
    });
    const attrs = schema.attrs(type);
    const named = new Set([...xa, ...el]);
    const dropped = [];
    attrs.forEach((a, i) => { if (!a.derived && !named.has(a.name)) dropped.push(i); });
    s = { attrs, xa: xa.filter((n) => attrs.index.has(n)), el, inv, dropped, direct };
    shapes.set(type, s);
    return s;
  }

  // Relationships nested under the objects they point back at.
  const nestUnder = new Map(); // target id -> [[inverse name, relationship]]
  const nested = new Set();
  const keep = new Map(); // relationship id -> Set of dropped indexes written anyway
  const used = new Map(); // "target id inverse" -> relationships nested there
  for (const r of step.entities.values()) {
    if (!E[r.type]) continue;
    const sh = shapeOf(r.type);
    for (const i of sh.dropped) {
      const a = sh.attrs[i];
      const v = r.args[i];
      if (v === null || v === undefined) continue;
      const refs = Array.isArray(v) ? v : [v];
      let all = refs.length > 0;
      const homes = [];
      for (const x of refs) {
        const t = x && x.ref !== undefined ? step.entities.get(x.ref) : null;
        let home = null;
        if (t && E[t.type]) {
          const ts = shapeOf(t.type);
          for (const n of ts.el) {
            const f = ts.inv.get(n);
            if (!f || f[1] !== a.name || !isA(r.type, f[0])) continue;
            // A relationship-itself inverse the XSD allows once (IFC4's
            // HasOpenings) takes the first; a wall's second opening keeps
            // its pointer.
            const max = ts.direct.get(n);
            if (max !== undefined && (used.get(t.id + " " + n) || 0) >= max) break;
            home = n;
            break;
          }
        }
        if (!home) { all = false; break; }
        homes.push([t.id, home]);
      }
      if (!all) {
        if (!keep.has(r.id)) keep.set(r.id, new Set());
        keep.get(r.id).add(i);
        stats.keptPointers++;
        const k = `${name(r.type)}.${a.name}`;
        stats.keptPointerTypes[k] = (stats.keptPointerTypes[k] || 0) + 1;
        continue;
      }
      for (const [tid, home] of homes) {
        used.set(tid + " " + home, (used.get(tid + " " + home) || 0) + 1);
        let l = nestUnder.get(tid);
        if (!l) nestUnder.set(tid, (l = []));
        l.push([home, r]);
      }
      nested.add(r.id);
    }
  }
  stats.nestedRelationships = nested.size;

  const written = new Set();
  let buf = "";
  const out = (s) => { buf += s; if (buf.length > 1 << 20) { emit(buf); buf = ""; } };

  // STEP's BINARY starts with a digit giving the unused bits before the first
  // hex digit ("0FF00": whole bytes FF00); xs:hexBinary has whole bytes only.
  const hex = (b) => {
    const h = String(b).replace(/\s+/g, "").toUpperCase();
    if (!fromStep || !/^[0-3][0-9A-F]*$/.test(h)) return h;
    if (h[0] !== "0") stats.binaryBits++;
    const rest = h.slice(1);
    return rest.length % 2 ? "0" + rest : rest;
  };
  const scalar = (v) => (typeof v === "boolean" ? String(v) : typeof v === "number" ? num(v)
    : v && v.enum !== undefined ? v.enum.toLowerCase() : v && v.unknown ? "unknown" : v && v.binary !== undefined ? hex(v.binary) : esc(v));
  const isPlain = (v) => v !== null && v !== undefined && (typeof v !== "object" || v.enum !== undefined || v.unknown || v.binary !== undefined);
  const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : [v]);
  const listText = (v) => flat(v).map((x) => {
    const s = scalar(x);
    if (typeof x === "string" && /\s/.test(x)) stats.spacedListItems++;
    return s;
  }).join(" ");
  const ref = (tag, t, declared, pos) => {
    const xt = declared && t && t.type !== declared && E[declared] ? ` xsi:type="${name(t.type)}"` : "";
    return out(`<${tag}${xt}${pos} xsi:nil="true" href="i${t ? t.id : "?"}"/>`);
  };
  // A defined type's wrapper element name.
  const typeName = (t) => layout.types[t] || t;

  // One value inside a list or a select's element.
  function item(v, declared, pos) {
    const p = pos === undefined ? "" : ` pos="${pos}"`;
    if (v && v.ref !== undefined) {
      const t = step.entities.get(v.ref);
      // A reference to an entity the file lacks: left out (the STEP file is
      // broken there; an element for it would name an abstract class).
      if (!t || !E[t.type]) { stats.danglingRefs++; return; }
      if (written.has(t.id)) return ref(name(t.type), t, null, p);
      return entity(t, name(t.type), "", p);
    }
    if (v && v.typed) {
      const w = (E[v.typed] ? name(v.typed) : schema.types[v.typed] ? typeName(v.typed) : v.typed);
      if (Array.isArray(v.value)) return out(`<${w}-wrapper${p}>${listText(v.value)}</${w}-wrapper>`);
      return out(`<${w}-wrapper${p}>${scalar(v.value)}</${w}-wrapper>`);
    }
    if (Array.isArray(v)) {
      // A row of a list of lists: <Seq-IfcPositiveInteger-wrapper>1 2 3</..>,
      // or a row of entities under <Seq-IfcCartesianPoint-wrapper>.
      const inner = declared && E[declared] ? name(declared) : declared ? typeName(declared) : "Ifc";
      if (v.every(isPlain)) return out(`<Seq-${inner}-wrapper${p}>${listText(v)}</Seq-${inner}-wrapper>`);
      out(`<Seq-${inner}-wrapper${p}>`);
      v.forEach((x, j) => item(x, declared, j));
      return out(`</Seq-${inner}-wrapper>`);
    }
    const w = declared && schema.types[declared] && schema.prim(declared) !== "select" && schema.prim(declared) !== "entity" ? typeName(declared) : null;
    if (w) return out(`<${w}-wrapper${p}>${scalar(v)}</${w}-wrapper>`);
    const x = typeof v === "number" ? "double" : typeof v === "boolean" ? "boolean" : "string";
    return out(`<ex:${x}-wrapper${p}>${scalar(v)}</ex:${x}-wrapper>`);
  }

  // An explicit attribute as a child element.
  function child(a, v) {
    const prim = schema.prim(a.type);
    if (Array.isArray(v)) {
      // A list of lists: rows wrapped where the XSD wraps them
      // (InnerCoordIndices), else flat, as its "list list" says, with
      // arraySize="rows columns" so a reader can cut it again. Rows of
      // different lengths cannot be flat; they keep their wrappers and are
      // counted.
      if (a.inner && v.length && v.every(Array.isArray) && !rowsKept.has(a.name)) {
        const n = v[0].length;
        if (v.every((r) => r.length === n)) {
          out(`<${a.name} ifc:arraySize="${v.length} ${n}">`);
          for (const r of v) for (const x of r) item(x, a.type);
          return out(`</${a.name}>`);
        }
        stats.raggedLists++;
      }
      out(`<${a.name}>`);
      v.forEach((x) => item(x, a.type));
      return out(`</${a.name}>`);
    }
    // A simple value: the element's own text (<RasterCode>FF00</RasterCode>).
    if (isPlain(v) && prim !== "select") return out(`<${a.name}>${scalar(v)}</${a.name}>`);
    if (v.ref !== undefined && prim === "entity") {
      const t = step.entities.get(v.ref);
      if (!t || !E[t.type]) { stats.danglingRefs++; return; }
      if (written.has(t.id)) return ref(a.name, t, a.type, "");
      const xt = t.type !== a.type ? ` xsi:type="${name(t.type)}"` : "";
      return entity(t, a.name, xt, "");
    }
    out(`<${a.name}>`);
    item(v, a.type);
    out(`</${a.name}>`);
  }

  // An entity's element, written in full: `tag` is its class name, or an
  // attribute's name (with xsi:type in `xt` when the class is a subtype).
  function entity(e, tag, xt, pos = "") {
    written.add(e.id);
    stats.entities++;
    const sh = shapeOf(e.type);
    const kept = keep.get(e.id);
    let head = `<${tag}${xt}${pos} id="i${e.id}"`;
    for (const n of sh.xa) {
      const i = sh.attrs.index.get(n);
      const v = e.args[i];
      if (v === null || v === undefined || (v && v.derived)) continue;
      if (isPlain(v)) head += ` ${n}="${scalar(v)}"`;
      else if (Array.isArray(v)) head += ` ${n}="${listText(v)}"`;
      else if (v.typed) head += ` ${n}="${scalar(v.value)}"`;
    }
    const kids = [];
    for (const n of sh.el) {
      const i = sh.attrs.index.get(n);
      if (i !== undefined) {
        const v = e.args[i];
        if (v === null || v === undefined || (v && v.derived) || sh.attrs[i].derived) continue;
        kids.push(() => child(sh.attrs[i], v));
        continue;
      }
      const rels = (nestUnder.get(e.id) || []).filter(([h]) => h === n);
      if (!rels.length) continue;
      if (sh.direct.has(n)) {
        // The element is the relationship: <HasOpenings GlobalId=".."> (its
        // class by xsi:type when a subtype of the inverse's).
        const decl = (sh.inv.get(n) || [])[0];
        for (const [, r] of rels) kids.push(() => {
          if (written.has(r.id)) ref(n, r, decl, "");
          else entity(r, n, r.type !== decl ? ` xsi:type="${name(r.type)}"` : "");
        });
        continue;
      }
      kids.push(() => {
        out(`<${n}>`);
        for (const [, r] of rels) {
          if (written.has(r.id)) ref(name(r.type), r, null, "");
          else entity(r, name(r.type), "");
        }
        out(`</${n}>`);
      });
    }
    if (kept) for (const i of kept) kids.push(() => child(sh.attrs[i], e.args[i]));
    if (!kids.length) return out(head + "/>");
    out(head + ">");
    for (const k of kids) k();
    out(`</${tag}>`);
  }

  const ns = layout.namespace;
  out(`<?xml version="1.0" encoding="UTF-8"?>\n<ifcXML xmlns="${ns}" xmlns:ifc="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common">\n`);
  out(`<header><name>${esc(opts.name || "model")}</name><time_stamp>${esc(opts.timeStamp || new Date().toISOString().slice(0, 19))}</time_stamp><preprocessor_version>ids-model-check ifcxml-writer.mjs</preprocessor_version>${opts.originatingSystem ? `<originating_system>${esc(opts.originatingSystem)}</originating_system>` : ""}</header>\n`);
  // The project first, so the spatial tree hangs from it; then anything not
  // yet reached, each as its own top-level element. A nested relationship is
  // left for the objects it sits under.
  const roots = [];
  for (const e of step.entities.values()) if (E[e.type] && isA(e.type, "IFCCONTEXT")) roots.push(e);
  for (const e of step.entities.values()) {
    if (!E[e.type]) { stats.unknownTypes++; continue; }
    if (!nested.has(e.id)) roots.push(e);
  }
  for (const e of step.entities.values()) if (E[e.type]) roots.push(e);
  for (const e of roots) {
    if (written.has(e.id)) continue;
    entity(e, name(e.type), "");
    out("\n");
  }
  out(`</ifcXML>\n`);
  emit(buf);
  return stats;
}
