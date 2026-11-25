// ifcXML reader: turns an ifcXML model (ISO 10303-28) into the same
// { schema, entities, errors } shape parseStep gives for a STEP file, so the
// checker runs on it unchanged.
//
// ifcXMLSchemaId(text) -> "IFC2X3" | "IFC4" | "IFC4X3" | null
// parseIfcXml(text, schema, { eager }): text may be the file's bytes (a
//   Uint8Array), read without ever becoming one string on the heap
//   (eval/ifcxml-bytes-2026-11-18.md); offsets are then byte offsets.
// parseIfcXml(...) -> { schema, entities: Map<id, {id, type, args}>, errors, early }
//   early: nested entity elements read as they closed (see "Read as it
//   closes" below)
//   schema: a Schema (ids.mjs) for that version; it gives each attribute's
//   position and type, which ifcXML does not carry.
//
// Read as it streams (2026-11-18, eval/lazy-ifcxml-2026-11-18.md): each
// top-level entity's element is read as it closes and then dropped, so the
// whole XML tree is never held; and geometry (IfcRepresentationItem and its
// subtypes, as the STEP reader's Model policy) keeps only where its element
// starts and ends, its arguments read again from that text each time a check
// asks for them. { eager: true } keeps every entity's arguments.
//
// Two layouts are read, both seen in real files:
// - IFC2X3 (ifcXML2, <iso_10303_28><uos>): every entity at the top, every
//   attribute a child element (<Name>Wall</Name>), references written
//   <IfcOwnerHistory ref="i2" xsi:nil="true"/>, select values as
//   <IfcBoolean>true</IfcBoolean>, lists as <ex:double-wrapper> items.
// - IFC4 and later (<ifcXML>): simple attributes as XML attributes
//   (Name="Wall", PredefinedType="notdefined"), entities nested where they are
//   used, an attribute element that is itself the value (<RelatingObject
//   xsi:type="IfcProject" ref="p1"/>, or with no xsi:type at all, the
//   attribute's own class), select values as <IfcLabel-wrapper>, and
//   relationships nested under an inverse attribute (<IsDefinedBy>) with their
//   pointer back to the parent left out; that pointer is put back.
// ids may be any string; they are numbered in the order first seen. Derived
// attributes are marked {derived:true} as a STEP file's * would be.

import { parseXml } from "./xml.mjs";
import { EMPTY_LIST, SKIPPED_LIST } from "./step.mjs";

// The schema is named by the root element's namespace or schemaLocation, or
// IFC2X3's <uos configuration="i_ifc2x3">, and read from those start tags
// first. Searching the whole first 4,000 characters read an IFC4 file as
// IFC2X3 when the model itself said "IFC2x3" there: ARCHICAD's IFC4 export
// writes ApplicationIdentifier="IFC2x3 add-on version: 4009", and the nested
// IFC4 layout puts the owner history near the top, so 760,438 of 1,207,966
// entities of one federated file went unread (eval/ifc4-layout-scale-2026-11-18.md).
// Only when those tags name no version is the rest of the head searched.
// IFC4X3 ADD2's own XSD names its namespace .../IFC/RELEASE/IFC4/3/ADD2 (and
// the development builds .../IFC/DEV/IFC4/3/ADD2/DEV/...), with a slash:
// read as IFC4 until 2026-11-24 (eval/ifcxml-export-2026-11-24.md).
const versionIn = (s) => (/IFC4X3|IFC4_3|IFC4x3|IFC4\/3\//i.test(s) ? "IFC4X3" : /IFC2X3/i.test(s) ? "IFC2X3" : /IFC4/i.test(s) ? "IFC4" : null);
const ROOT_TAG = /<(?:[\w.-]+:)?(?:iso_10303_28|ifcXML|uos)(?=[\s>\/])[^>]*>/gi;
// text may be the file's bytes (a Uint8Array): only its head is decoded.
// 4,000 characters are at most 16,000 UTF-8 bytes; a character cut at the end
// decodes to U+FFFD and is sliced off with the rest past 4,000.
const headOf = (text, chars) => (text instanceof Uint8Array ? new TextDecoder().decode(text.subarray(0, chars * 4)) : text).slice(0, chars);
export function ifcXmlSchemaId(text) {
  const head = headOf(text, 4000);
  if (!/^\s*(\uFEFF)?\s*</.test(head)) return null;
  return versionIn((head.match(ROOT_TAG) || []).join(" ")) || versionIn(head);
}

export function looksLikeXml(text) {
  return /^\s*(\uFEFF)?\s*<[?!a-zA-Z]/.test(headOf(text, 200));
}

// A nested element read as it closed (parseIfcXml, "Read as it closes"): in
// its parent's children in place of the element, with the record of what was
// read (t) and its provisional or final number (p).
class Read {
  constructor(local, attrs, t, p) { this.local = local; this.attrs = attrs; this.t = t; this.p = p; }
}
Read.prototype.children = Object.freeze([]);
Read.prototype.text = "";

// A reference in shallowArgs: AttributeFacet.test asks only that it is one.
const REF = Object.freeze({ ref: -1 });

const local = (n) => (n.includes(":") ? n.slice(n.indexOf(":") + 1) : n);
const isMeta = (k) => k === "id" || k === "ref" || k === "href" || k === "pos" || k.includes(":") || k === "xmlns";

// Some writers point at an instance with href="i1" (ISO 10303-28's xlink
// form: GeometryGymIFC's IFC4 output and all 41 of buildingSMART's IFC4 ADD2
// TC1 Annex E ifcXML examples) rather than ref="i1". Both are read as ref.
function hrefToRef(root) {
  const stack = [root];
  while (stack.length) {
    const el = stack.pop();
    if (el.attrs && el.attrs.ref === undefined && el.attrs.href !== undefined) el.attrs.ref = String(el.attrs.href).replace(/^#/, "");
    if (el.children) for (const c of el.children) stack.push(c);
  }
}

export function parseIfcXml(text, schema, opts = {}) {
  const eager = !!opts.eager;
  const entities = new Map();
  const errors = [];
  let commaNumbers = 0, commaExample = null;
  const ids = new Map();
  let next = 1;
  // While a nested element is read as it closes (`trace` set, see "Read as it
  // closes" below), an id not yet numbered gets a provisional number (-2,
  // -3, ...) and the read is recorded, so the walk can number it later in
  // the same order as before.
  let trace = null;
  let nextP = -2;
  const pendingIds = new Map(); // xml id -> provisional number
  // provisional -> final number: final[-p - 2], grown as needed.
  let finals = new Int32Array(1024);
  const pmap = {
    get: (p) => finals[-p - 2],
    set(p, f) {
      const i = -p - 2;
      if (i >= finals.length) { const g = new Int32Array(Math.max(i + 1, finals.length * 2)); g.set(finals); finals = g; }
      finals[i] = f;
    },
    clear() { finals.fill(0, 0, -nextP - 2); nextP = -2; },
  };
  // Start offsets of inline entities inside geometry read early: inlineIds
  // holds their provisional numbers until the walk gives final ones.
  let pendingAt = [];
  const num = (s) => {
    let n = ids.get(s);
    if (n !== undefined) return n;
    if (trace) {
      let p = pendingIds.get(s);
      if (p === undefined) pendingIds.set(s, (p = nextP--));
      trace.push(s);
      return p;
    }
    ids.set(s, (n = next++));
    return n;
  };
  // A note said once per key (a misspelt attribute name, a flat B-spline
  // list): recorded during a deferred read, so notes come out in walk order.
  const noteOnce = (set, key, msg) => {
    if (trace) trace.push({ note: [set, key, msg] });
    else if (!set.has(key)) { set.add(key); errors.push(msg); }
  };
  const backrefs = []; // [relationship id, attribute, parent id]

  // Geometry's arguments are not kept: a LazyXmlEntity holds its element's
  // span and reads it again on each `args`. An inline (id-less) entity nested
  // in one is numbered by where it starts, so a re-read names the same id.
  const keepType = new Map();
  const keeps = (t) => {
    let k = keepType.get(t);
    if (k === undefined) keepType.set(t, (k = eager || !isA(t, "IFCREPRESENTATIONITEM")));
    return k;
  };
  const inlineIds = new Map(); // start offset -> id, inside a dropped entity
  let dropDepth = 0;
  let re = null; // during a re-read: { root, base, out }
  class LazyXmlEntity {
    constructor(id, type, xmlId, s, e) {
      this.id = id; this.type = type;
      if (xmlId !== undefined) this.xmlId = xmlId;
      this._s = s; this._e = e; this._a = undefined;
    }
    get args() { return this._a !== undefined ? this._a : reread(this); }
    // What AttributeFacet.test reads (as StepEntity.shallowArgs): kept from
    // the first read, so a specification applying to every entity never
    // re-reads geometry.
    get shallowArgs() { return this._a !== undefined ? this._a : this._sh; }
    set args(v) { this._a = v; }
    toJSON() { return this.xmlId !== undefined ? { id: this.id, type: this.type, args: this.args, xmlId: this.xmlId } : { id: this.id, type: this.type, args: this.args }; }
  }
  function reread(e) {
    const root = parseXml(text instanceof Uint8Array ? text.subarray(e._s, e._e) : text.slice(e._s, e._e), { spans: true });
    hrefToRef(root);
    const saved = re;
    re = { root, base: e._s, out: null, id: e.id };
    try {
      entity(root, e.type);
      return re.out;
    } finally {
      re = saved;
    }
  }

  const U = (s) => s.toUpperCase();
  const entityName = (n) => {
    const u = U(local(n));
    return schema.entities[u] ? u : null;
  };
  const definedName = (n) => {
    const u = U(local(n)).replace(/-WRAPPER$/, "");
    return schema.types[u] ? u : null;
  };
  const xsiType = (el) => {
    for (const [k, v] of Object.entries(el.attrs)) if (local(k) === "type" && k.includes(":")) return v;
    return null;
  };
  const hasOwnValueAttrs = (el) => Object.keys(el.attrs).some((k) => !isMeta(k));

  // A list of lists written flat ("x y z x y z"): cut into rows of the inner
  // level's fixed size (schema attr.inner, e.g. [3] for CoordList). A size
  // that varies cannot be recovered from flat text and is left flat.
  const nest = (list, a) => {
    if (!a.inner || a.inner.length !== 1 || !a.inner[0] || !Array.isArray(list) || list.some(Array.isArray)) return list;
    const k = a.inner[0];
    if (list.length % k) return list;
    const out = [];
    for (let i = 0; i < list.length; i += k) out.push(list.slice(i, i + k));
    return out;
  };
  const splitText = (t, type) => (t.trim() ? t.trim().split(/\s+/).map((x) => cast(x, type)) : []);

  // A text value read as the given type name.
  function cast(raw, typeName) {
    const s = raw.trim();
    const prim = schema.prim(typeName);
    switch (prim) {
      case "double":
      case "integer": {
        const n = Number(s);
        if (Number.isNaN(n) && /^[+-]?\d*,\d+(?:[eE][+-]?\d+)?$/.test(s)) {
          // A decimal comma: the writer formatted numbers in a locale that
          // uses one (41 of buildingSMART's IFC4 Annex E ifcXML examples). xs:double has no
          // such form; read it as a point and say so once.
          if (re) { if (!commaExample) commaExample = s; }
          else if (trace) trace.push({ comma: s });
          else { commaNumbers++; if (!commaExample) commaExample = s; }
          return Number(s.replace(",", "."));
        }
        return Number.isNaN(n) && s !== "NaN" ? s : n;
      }
      case "boolean":
        return /^(true|t|1)$/i.test(s) ? true : /^(false|f|0)$/i.test(s) ? false : s;
      case "logical":
        return /^(true|t)$/i.test(s) ? true : /^(false|f)$/i.test(s) ? false : { unknown: true };
      case "enum":
        return { enum: U(s) };
      case "binary":
        return { binary: s };
      // xs:string keeps its whitespace: a label written ' 277 V/1-64VA' (731
      // properties in the HHS Office MEP export) is that string in STEP too,
      // and trimming it changed what an IDS value test saw
      // (eval/lazy-ifcxml-2026-11-18.md).
      case "string":
        return raw;
      case "aggregate": {
        let t = typeName;
        for (let g = 0; g < 20 && schema.types[t] && schema.types[t].kind !== "aggregate"; g++) t = schema.types[t].of;
        const of = schema.types[t] ? schema.types[t].of : "STRING";
        return s ? s.split(/\s+/).map((x) => cast(x, of)) : [];
      }
      default:
        return s;
    }
  }

  // A defined-type value, as STEP writes it inside a select: IFCLABEL('x').
  function typed(name, el) {
    const kind = schema.prim(name);
    if (kind === "aggregate" && el.children.length) {
      let t = name;
      for (let g = 0; g < 20 && schema.types[t] && schema.types[t].kind !== "aggregate"; g++) t = schema.types[t].of;
      return { typed: name, value: el.children.map((c) => cast(c.text, schema.types[t].of)) };
    }
    return { typed: name, value: cast(el.text, name) };
  }

  // One item: an entity (inline or a reference), a select's defined-type value,
  // or a plain value read as `declared`.
  function item(el, declared) {
    const xt = xsiType(el);
    const ent = entityName(xt || el.local);
    if (ent || (el.attrs.ref !== undefined && !definedName(el.local))) {
      if (el.attrs.ref !== undefined) return { ref: num(el.attrs.ref) };
      return { ref: entity(el, ent || declared) };
    }
    const def = definedName(xt || el.local);
    if (def && schema.prim(declared) === "select") return typed(def, el);
    if (def && !el.children.length) return cast(el.text, declared && schema.prim(declared) !== "unknown" ? declared : def);
    if (el.children.length) return el.children.map((c) => item(c, itemType(declared)));
    return cast(el.text, declared);
  }

  const itemType = (t) => {
    for (let g = 0; g < 20 && t && schema.types[t]; g++) {
      if (schema.types[t].kind === "aggregate") return schema.types[t].of;
      t = schema.types[t].of;
    }
    return t;
  };

  // The value of an attribute written as a child element.
  function attrValue(el, def, ownerType) {
    const declared = def.type;
    const xt = xsiType(el);
    // The element is itself the value: <RelatingObject xsi:type="IfcProject" ref="p1"/>.
    if (xt || el.attrs.ref !== undefined || el.attrs.id !== undefined || hasOwnValueAttrs(el)) {
      // With no xsi:type the element is an instance of the attribute's own class.
      const v = !xt && el.attrs.ref === undefined && entityName(declared) ? { ref: entity(el, declared) } : item(el, xt ? U(local(xt)) : declared);
      return def.aggregate ? [v] : v;
    }
    const kidsEls = el.children;
    if (kidsEls.length) {
      const first = kidsEls[0];
      const isItem = (c) => entityName(xsiType(c) || c.local) || definedName(xsiType(c) || c.local) || c.attrs.ref !== undefined || /-wrapper$/.test(c.local);
      // <Position><Location ref="i3"/><Axis ../></Position>: the children are
      // attributes of the declared class, so the element is an instance of it
      // even when a child is itself a reference.
      const ownAttr = (c) => entityName(declared) && schema.attrs(entityName(declared)).index.has(c.local) && !entityName(c.local);
      if ((!isItem(first) || ownAttr(first)) && entityName(declared)) {
        // <UnitsInContext><Units>..</Units></UnitsInContext>: an IfcUnitAssignment
        // written without its own element.
        const v = { ref: entity(el, declared) };
        return def.aggregate ? [v] : v;
      }
      // A list of lists written flat with its shape in ifc:arraySize="rows
      // columns" (ifcxml-writer.mjs, as the XSD's "list list" lists are):
      // cut back into rows.
      const sizeKey = def.inner ? Object.keys(el.attrs).find((k) => local(k) === "arraySize") : undefined;
      const dims = sizeKey ? String(el.attrs[sizeKey]).trim().split(/\s+/).map(Number) : null;
      if (dims && dims.length === 2 && dims.every((d) => Number.isInteger(d) && d > 0)) {
        const flat = kidsEls.flatMap((c) => (entityName(xsiType(c) || c.local) || c.attrs.ref !== undefined || c.children.length ? [item(c, declared)] : splitText(c.text, declared)));
        if (flat.length === dims[0] * dims[1]) return Array.from({ length: dims[0] }, (_, r) => flat.slice(r * dims[1], (r + 1) * dims[1]));
      }
      // A list of lists as one wrapper per row: <Seq-IfcPositiveInteger-wrapper>14 16 15 13</..>.
      if (def.inner && kidsEls.every((c) => !c.children.length && !entityName(xsiType(c) || c.local) && c.attrs.ref === undefined)) {
        return kidsEls.map((c) => splitText(c.text, declared));
      }
      if (def.aggregate || schema.prim(declared) === "aggregate") {
        const of = def.aggregate ? declared : itemType(declared);
        return kidsEls.map((c) => item(c, of));
      }
      return item(first, declared);
    }
    if (def.aggregate) return nest(splitText(el.text, declared), def);
    // An all-white-space string stays as written: xs:string keeps white space,
    // and STEP's IFCLABEL('  ') is two spaces too (eval/word-class-2026-11-18.md).
    if (!el.text.trim() && schema.prim(declared) === "string") return el.text;
    return el.text.trim() === "" ? null : cast(el.text, declared);
  }

  function inverseOf(type, name) {
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) {
      const f = schema.entities[t].inverseFor;
      if (f && f[name]) return f[name];
    }
    return null;
  }

  // An attribute's position by name. A name in the wrong case
  // (BenchMark="equalto" for IfcMetric.Benchmark, in GeometryGymIFC's IFC4
  // output) is still read, and said once per class and name.
  const caseNoted = new Set();
  function attrIndex(attrs, name, type) {
    const i = attrs.index.get(name);
    if (i !== undefined) return i;
    const lower = name.toLowerCase();
    const j = attrs.findIndex((a) => a.name.toLowerCase() === lower);
    if (j < 0) return undefined;
    noteOnce(caseNoted, type + "." + name, `${type} attribute "${name}" read as ${attrs[j].name} (the name's case differs from the schema)`);
    return j;
  }

  // Builds an entity from an element; returns its id.
  function entity(el, type) {
    if (el instanceof Read) {
      // Read when it closed: in a deferred read its record goes into this
      // one's; in the walk it is numbered now, in the order it would have been.
      const t = el.t;
      el.t = undefined;
      if (trace) { trace.push(t); return el.p; }
      return finish(t, el.p);
    }
    if (re && el !== re.root) {
      // A re-read builds only its own arguments; nested entities exist.
      return el.attrs.id !== undefined ? num(el.attrs.id) : inlineIds.get(re.base + el.at);
    }
    const deferred = !re && trace !== null;
    let id, outer = null, slot = -1;
    if (re) id = re.id;
    else if (deferred) {
      const s = el.attrs.id;
      if (s !== undefined) {
        const known = ids.has(s);
        id = num(s);
        if (!known) trace.pop(); // the self token below numbers it
        else if (entities.has(id)) return id;
      } else id = nextP--;
      outer = trace;
      trace = [null]; // [0]: this entity's record, then what it holds
      slot = outer.push(trace) - 1;
    } else {
      id = el.attrs.id !== undefined ? num(el.attrs.id) : next++;
      if (entities.has(id)) return id;
    }
    const attrs = schema.attrs(type);
    const args = attrs.map((a) => (a.derived ? { derived: true } : null));
    const rec = el.attrs.id !== undefined ? { id, type, args, xmlId: el.attrs.id } : { id, type, args };
    if (re) re.out = args;
    else if (deferred) {
      trace[0] = rec;
      if ((dropDepth || inGeometry) && el.attrs.id === undefined) { inlineIds.set(el.at, id); pendingAt.push(el.at); }
    } else {
      entities.set(id, rec);
      if (dropDepth && el.attrs.id === undefined) inlineIds.set(el.at, id);
    }
    const drop = !re && !keeps(type);
    if (drop) dropDepth++;
    try {
      fill(el, type, id, attrs, args);
      if (isA(type, "IFCBSPLINESURFACE")) bsplineRows(rec, attrs);
    } finally {
      if (drop) dropDepth--;
      if (deferred) {
        // An entity that holds nothing to number is kept as its bare record;
        // otherwise as an array cut to its length.
        outer[slot] = trace.length === 1 ? trace[0] : trace.slice();
        trace = outer;
      }
    }
    if (drop) {
      const lazy = new LazyXmlEntity(id, type, el.attrs.id, el.at, el.end);
      lazy._sh = shallow(args);
      if (deferred) {
        const k = outer[slot];
        if (Array.isArray(k)) k[0] = lazy;
        else outer[slot] = lazy;
      } else entities.set(id, lazy);
    }
    return id;
  }

  // Numbers a deferred read's entities in the order the walk would have
  // (each entity, then what it holds, in document order), adds them to the
  // model, and puts final numbers in place of provisional ones. A trace holds
  // ref ids (strings), entities ([record, ...what it holds], or a bare
  // record when it holds nothing to number) and notes.
  function finish(t, p) {
    const recs = [];
    if (t !== undefined) item1(t, recs);
    const fix = (v) => {
      if (Array.isArray(v)) { for (const x of v) fix(x); }
      else if (v && v.ref !== undefined && v.ref < -1) v.ref = pmap.get(v.ref);
    };
    for (const r of recs) if (!(r instanceof LazyXmlEntity)) fix(r.args);
    return p < -1 ? pmap.get(p) : p;
  }
  const fin = (x) => (x < -1 ? pmap.get(x) : x);
  // Numbers one entity; false when an element with its id was read already
  // (the walk skips it and everything in it, as before).
  function numberRec(rec, recs) {
    const f = rec.xmlId !== undefined ? num(rec.xmlId) : next++;
    if (rec.id < -1) pmap.set(rec.id, f);
    if (entities.has(f)) return false;
    rec.id = f;
    entities.set(f, rec);
    recs.push(rec);
    return true;
  }
  function item1(k, recs) {
    if (typeof k === "string") {
      const f = num(k), p = pendingIds.get(k);
      if (p !== undefined) pmap.set(p, f);
    } else if (Array.isArray(k)) {
      if (!numberRec(k[0], recs)) return;
      // Each part is let go once numbered, so the trace shrinks as the walk goes.
      for (let i = 1; i < k.length; i++) { item1(k[i], recs); k[i] = 0; }
    } else if (k.type !== undefined) numberRec(k, recs);
    else if (k.back) backrefs.push([fin(k.back[0]), k.back[1], fin(k.back[2])]);
    else if (k.note) {
      const [set, key, msg] = k.note;
      if (!set.has(key)) { set.add(key); errors.push(msg); }
    } else if (k.comma !== undefined) {
      commaNumbers++;
      if (!commaExample) commaExample = k.comma;
    }
  }
  const backref = (r, attr, id) => {
    if (re) return;
    if (trace) trace.push({ back: [r, attr, id] });
    else backrefs.push([r, attr, id]);
  };

  // An entity's arguments as an attribute test sees them: a list only as
  // empty or not (EMPTY_LIST, SKIPPED_LIST), a reference only as a reference
  // (one shared REF; the test never follows it). Rows of only such markers,
  // nulls, booleans and enums are shared: the HHS MEP export's 500,000
  // points, loops and faces come down to a few dozen arrays.
  const shared = new Map();
  function shallow(args) {
    let plain = true;
    const out = args.map((v) => {
      if (Array.isArray(v)) return v.length ? SKIPPED_LIST : EMPTY_LIST;
      if (v && v.ref !== undefined) return REF;
      if (v !== null && !(v && (v.derived || v.enum !== undefined)) && typeof v !== "boolean") plain = false;
      return v;
    });
    if (!plain) return out;
    const key = JSON.stringify(out.map((v) => (v === SKIPPED_LIST ? "+" : v === EMPTY_LIST ? "0" : v === REF ? "r" : v)));
    let s = shared.get(key);
    if (!s) shared.set(key, (s = Object.freeze(out)));
    return s;
  }

  function fill(el, type, id, attrs, args) {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (isMeta(k)) continue;
      const i = attrIndex(attrs, k, type);
      if (i === undefined) continue;
      const a = attrs[i];
      // A value written for a derived attribute (CoordinateSpaceDimension="0"
      // on a sub-context) is not part of the instance: STEP writes it as *.
      if (a.derived) continue;
      args[i] = a.aggregate ? nest(splitText(v, a.type), a) : cast(v, a.type);
    }
    for (const c of el.children) {
      const name = c.local;
      const i = attrIndex(attrs, name, type);
      if (i !== undefined) {
        if (attrs[i].derived) continue;
        args[i] = attrValue(c, attrs[i], type);
        continue;
      }
      const inv = inverseOf(type, name);
      if (inv) {
        // An inverse of at most one (IsTypedBy, a SET [0:1]) may be written
        // as the relationship itself, its attributes on the inverse's element:
        // <IsTypedBy GlobalId=".."><RelatingType ../></IsTypedBy>.
        if (xsiType(c) || c.attrs.id !== undefined || c.attrs.ref !== undefined || hasOwnValueAttrs(c)) {
          const v = c.attrs.ref !== undefined ? { ref: num(c.attrs.ref) } : { ref: entity(c, entityName(xsiType(c) || "") || inv[0]) };
          backref(v.ref, inv[1], id);
          continue;
        }
        for (const r of c.children) {
          const v = item(r, inv[0]);
          if (v && v.ref) backref(v.ref, inv[1], id);
        }
      }
    }
  }

  const isA = (type, sup) => {
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) if (t === sup) return true;
    return false;
  };

  // IfcBSplineSurface.ControlPointsList is a LIST [2:?] OF LIST [2:?] of
  // points, and ifcXML writers put it down as one flat list (buildingSMART's
  // Annex E advanced-brep examples). The row length is not in the file, but
  // the knot data fixes it: a B-spline of degree p with knot multiplicities
  // m has sum(m) - p - 1 control points in that direction (IFC's own
  // IfcBSplineSurfaceWithKnots.UUpper rule). Rows run in U, points within a
  // row in V, as STEP writes them. With no knots, or counts that do not
  // multiply out, the list is left flat and the model's notes say so.
  const bsplineNoted = new Set();
  function bsplineRows(e, attrs) {
    const at = (name) => {
      const i = attrs.index.get(name);
      return i === undefined ? undefined : e.args[i];
    };
    const ci = attrs.index.get("ControlPointsList");
    const list = e.args[ci];
    if (!Array.isArray(list) || !list.length || list.some(Array.isArray)) return;
    const count = (mult, deg) =>
      Array.isArray(mult) && mult.length && mult.every(Number.isInteger) && Number.isInteger(deg)
        ? mult.reduce((s, x) => s + x, 0) - deg - 1
        : null;
    const rows = count(at("UMultiplicities"), at("UDegree"));
    const cols = count(at("VMultiplicities"), at("VDegree"));
    if (!(rows >= 2 && cols >= 2 && rows * cols === list.length)) {
      noteOnce(bsplineNoted, e.type, `${e.type} ControlPointsList written as ${list.length} points in one list; its knot data does not give the row length, so it is left flat`);
      return;
    }
    const cut = (l) => Array.from({ length: rows }, (_, r) => l.slice(r * cols, (r + 1) * cols));
    e.args[ci] = cut(list);
    // The rational subtype's weights are the same grid, written flat too.
    const wi = attrs.index.get("WeightsData");
    if (wi !== undefined && Array.isArray(e.args[wi]) && e.args[wi].length === list.length && !e.args[wi].some(Array.isArray)) e.args[wi] = cut(e.args[wi]);
  }

  // Top-level entities may sit under the root (IFC4) or under <uos> (IFC2X3):
  // an element is top-level when every open element between it and the root
  // is neither an entity nor a header. Each is read as it closes and dropped.
  const isContainer = (a) => {
    if (a._c === undefined) a._c = !entityName(xsiType(a) || a.local) && !/header$/i.test(a.local);
    return a._c;
  };
  // Read as it closes (2026-11-18, eval/nested-early-2026-11-18.md). IFC4
  // writers nest a whole model under one element (the IfcProject's
  // IsDecomposedBy, ContainsElements, IsDefinedBy: 96-99.9% of the file in
  // GeometryGymIFC's output, buildingSMART's Annex E and
  // eval/ifc4-layout.mjs), so reading by top-level element alone held nearly
  // the whole tree. Each entity element nested in another is now read as it
  // closes and its element emptied, keeping only what says what it is
  // (`id`, `xsi:type`). Entities are numbered parent first, which a read
  // from the inside out cannot do as it goes: it gives provisional numbers
  // and records the order it met each id, and the walk from the top-level
  // element numbers them in that order when it reaches the emptied element.
  // So ids, the order of the entity map and the notes are as before, and
  // reports, which print those numbers, do not change. An inline entity
  // inside geometry also records where it starts, so a geometry read again
  // from its text later gives it the same number.
  let early = 0;
  const isGeom = (a) => {
    if (a._g === undefined) {
      const t = entityName(xsiType(a) || a.local);
      a._g = !!t && !keeps(t);
    }
    return a._g;
  };
  const KEEP = (k) => k === "id" || (local(k) === "type" && k.includes(":"));
  const NO_ATTRS = Object.freeze({});
  let inGeometry = false; // the element being read early sits inside geometry
  function readEarly(node, parent, inGeom) {
    if (node.attrs.ref !== undefined || node.attrs.href !== undefined) return;
    const t = entityName(xsiType(node) || node.local);
    if (!t) return;
    hrefToRef(node);
    const holder = [];
    trace = holder;
    inGeometry = inGeom;
    let p;
    try {
      p = entity(node, t);
    } finally {
      trace = null;
      inGeometry = false;
    }
    // The element is swapped for a small record of what was read, which the
    // walk finds in its place.
    let attrs = NO_ATTRS;
    for (const k of Object.keys(node.attrs)) if (KEEP(k)) { if (attrs === NO_ATTRS) attrs = {}; attrs[k] = node.attrs[k]; }
    const kids = parent.children;
    kids[kids.length - 1] = new Read(node.local, attrs, holder[0], p);
    early++;
  }
  parseXml(text, {
    spans: !eager,
    onClose(node, stack) {
      if (stack.length < 2) return false; // the root element
      let nested = false, inGeom = false;
      for (let i = 2; i < stack.length; i++) {
        if (isContainer(stack[i])) continue;
        nested = true;
        if (isGeom(stack[i])) { inGeom = true; break; }
      }
      if (nested) {
        readEarly(node, stack[stack.length - 1], inGeom);
        return false;
      }
      const ent = entityName(xsiType(node) || node.local);
      if (ent) {
        if (node.attrs.ref === undefined) {
          hrefToRef(node);
          entity(node, ent);
          pendingIds.clear();
          for (const at of pendingAt) {
            const f = pmap.get(inlineIds.get(at));
            if (f) inlineIds.set(at, f);
            else inlineIds.delete(at); // in an element the walk skipped
          }
          pendingAt = [];
          pmap.clear();
        }
        return true;
      }
      return /header$/i.test(node.local);
    },
  });

  for (const [rid, attr, pid] of backrefs) {
    const r = entities.get(rid);
    if (!r) continue;
    if (r instanceof LazyXmlEntity && r._a === undefined) r._a = reread(r); // patched, so kept
    const i = schema.attrs(r.type).index.get(attr);
    if (i === undefined) continue;
    const a = schema.attrs(r.type)[i];
    if (a.aggregate) {
      const list = Array.isArray(r.args[i]) ? r.args[i] : (r.args[i] = []);
      if (!list.some((x) => x && x.ref === pid)) list.push({ ref: pid });
    } else if (!r.args[i] || !r.args[i].ref) r.args[i] = { ref: pid };
  }
  for (const s of ids.keys()) if (!entities.has(ids.get(s))) errors.push(`ref="${s}" points at no element`);
  if (commaNumbers) errors.push(`${commaNumbers} number(s) written with a decimal comma (e.g. "${commaExample}"), read with a decimal point`);
  return { schema: null, entities, errors, early };
}
