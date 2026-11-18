// ifcXML reader: turns an ifcXML model (ISO 10303-28) into the same
// { schema, entities, errors } shape parseStep gives for a STEP file, so the
// checker runs on it unchanged.
//
// ifcXMLSchemaId(text) -> "IFC2X3" | "IFC4" | "IFC4X3" | null
// parseIfcXml(text, schema, { eager }) -> { schema, entities: Map<id, {id, type, args}>, errors }
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

export function ifcXmlSchemaId(text) {
  const head = text.slice(0, 4000);
  if (!/^\s*(\uFEFF)?\s*</.test(head)) return null;
  if (/IFC4X3|IFC4_3|IFC4x3/i.test(head)) return "IFC4X3";
  if (/IFC2X3/i.test(head)) return "IFC2X3";
  if (/IFC4/i.test(head)) return "IFC4";
  return null;
}

export function looksLikeXml(text) {
  return /^\s*(\uFEFF)?\s*<[?!a-zA-Z]/.test(text.slice(0, 200));
}

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
  const num = (s) => {
    let n = ids.get(s);
    if (n === undefined) ids.set(s, (n = next++));
    return n;
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
    const root = parseXml(text.slice(e._s, e._e), { spans: true });
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
          if (!re) commaNumbers++;
          if (!commaExample) commaExample = s;
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
    if (!el.text.trim() && schema.prim(declared) === "string") return "";
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
    const key = type + "." + name;
    if (!caseNoted.has(key)) { caseNoted.add(key); errors.push(`${type} attribute "${name}" read as ${attrs[j].name} (the name's case differs from the schema)`); }
    return j;
  }

  // Builds an entity from an element; returns its id.
  function entity(el, type) {
    if (re && el !== re.root) {
      // A re-read builds only its own arguments; nested entities exist.
      return el.attrs.id !== undefined ? num(el.attrs.id) : inlineIds.get(re.base + el.at);
    }
    const id = re ? re.id : el.attrs.id !== undefined ? num(el.attrs.id) : next++;
    if (!re && entities.has(id)) return id;
    const attrs = schema.attrs(type);
    const args = attrs.map((a) => (a.derived ? { derived: true } : null));
    const rec = el.attrs.id !== undefined ? { id, type, args, xmlId: el.attrs.id } : { id, type, args };
    if (re) re.out = args;
    else {
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
    }
    if (drop) {
      const lazy = new LazyXmlEntity(id, type, el.attrs.id, el.at, el.end);
      lazy._sh = shallow(args);
      entities.set(id, lazy);
    }
    return id;
  }

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
          if (!re) backrefs.push([v.ref, inv[1], id]);
          continue;
        }
        for (const r of c.children) {
          const v = item(r, inv[0]);
          if (v && v.ref && !re) backrefs.push([v.ref, inv[1], id]);
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
      if (!bsplineNoted.has(e.type)) {
        bsplineNoted.add(e.type);
        errors.push(`${e.type} ControlPointsList written as ${list.length} points in one list; its knot data does not give the row length, so it is left flat`);
      }
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
  parseXml(text, {
    spans: !eager,
    onClose(node, stack) {
      if (stack.length < 2) return false; // the root element
      for (let i = 2; i < stack.length; i++) if (!isContainer(stack[i])) return false;
      const ent = entityName(xsiType(node) || node.local);
      if (ent) {
        if (node.attrs.ref === undefined) {
          hrefToRef(node);
          entity(node, ent);
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
  return { schema: null, entities, errors };
}
