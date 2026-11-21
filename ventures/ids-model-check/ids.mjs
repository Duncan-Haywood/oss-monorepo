// IDS 1.0 checker: does an IFC model meet an Information Delivery Specification?
//
// checkIds(idsText, ifcText, { schemas, typeMap, measureUnits, psets }) -> report
//
// Runs in Node and in the browser (no imports beyond the two readers). The
// schema facts (entities, attributes, defined types) come from schema/*.json,
// built from buildingSMART's EXPRESS files by schema/gen-schema.mjs; the caller
// passes them in (see node.mjs for Node, index.html for the page).
//
// Semantics follow the IDS 1.0 user manual and implementer docs, and are
// scored against buildingSMART's own IFC/IDS test pairs (eval/run-testcases.mjs).

import { parseStep } from "./step.mjs";
import { parseIfcXml, ifcXmlSchemaId, looksLikeXml } from "./ifcxml.mjs";
import { parseXml, kids, kid } from "./xml.mjs";
import { compileXsdRegex } from "./xsdregex.mjs";
import { auditIds } from "./audit.mjs";
import { structureIssues } from "./structure.mjs";
import { temporalKind, temporalKey, temporalCompare } from "./temporal.mjs";
export { temporalKind, temporalKey };

// ---------------------------------------------------------------- schema ----

export class Schema {
  constructor(json) {
    this.name = json.schema;
    this.types = json.types;
    this.entities = json.entities;
    this._attrs = new Map();
    this._sub = new Map();
  }
  has(type) { return !!this.entities[type]; }
  attrs(type) {
    let a = this._attrs.get(type);
    if (a) return a;
    const chain = [];
    for (let t = type; t && this.entities[t]; t = this.entities[t].super) chain.unshift(this.entities[t]);
    const derived = new Set();
    for (const e of chain) for (const d of e.derived) derived.add(d);
    a = [];
    for (const e of chain) for (const at of e.attrs) a.push({ ...at, derived: derived.has(at.name) });
    a.index = new Map(a.map((x, i) => [x.name, i]));
    this._attrs.set(type, a);
    return a;
  }
  isA(type, ancestor) {
    // Keyed type, then ancestor: a joined string key cost 5-8% of a 68-file
    // run in string building alone (eval/psets-cache-2026-11-18.md).
    let row = this._sub.get(type);
    if (!row) this._sub.set(type, (row = new Map()));
    let r = row.get(ancestor);
    if (r !== undefined) return r;
    r = false;
    for (let t = type; t; t = this.entities[t] && this.entities[t].super) if (t === ancestor) { r = true; break; }
    row.set(ancestor, r);
    return r;
  }
  // The primitive a type name resolves to: string, double, integer, boolean,
  // logical, binary, enum, select, entity, aggregate or unknown.
  prim(typeName) {
    let t = typeName;
    for (let guard = 0; guard < 20; guard++) {
      if (!t) return "unknown";
      if (t === "REAL" || t === "NUMBER") return "double";
      if (t === "INTEGER") return "integer";
      if (t === "STRING") return "string";
      if (t === "BOOLEAN") return "boolean";
      if (t === "LOGICAL") return "logical";
      if (t === "BINARY") return "binary";
      if (this.entities[t]) return "entity";
      const d = this.types[t];
      if (!d) return "unknown";
      if (d.kind === "enum") return "enum";
      if (d.kind === "select") return "select";
      if (d.kind === "aggregate") return "aggregate";
      t = d.of;
    }
    return "unknown";
  }
}

// ----------------------------------------------------------------- model ----

const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };

export class Model {
  constructor(text, schemas) {
    // The file's bytes (a Uint8Array) are read as they are, STEP and ifcXML
    // alike, so the file is never one string on the heap
    // (eval/step-bytes-2026-11-18.md, eval/ifcxml-bytes-2026-11-18.md).
    // An ifcXML model is read by its schema's attribute order (ifcxml.mjs).
    const xmlId = looksLikeXml(text) ? ifcXmlSchemaId(text) || "(not found in the ifcXML header)" : null;
    const xs = xmlId && schemas[xmlId];
    const p = xmlId ? (xs ? parseIfcXml(text, xs instanceof Schema ? xs : new Schema(xs)) : { entities: new Map(), errors: [] }) : parseStep(text);
    if (xmlId) p.schema = xmlId;
    this.format = xmlId ? "ifcXML" : "STEP";
    this.parseErrors = p.errors;
    this.entities = p.entities;
    const raw = (p.schema || "").toUpperCase();
    this.schemaId = raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : raw;
    this.schemaRaw = raw;
    const sj = schemas[this.schemaId];
    if (!sj) throw new Error(`IFC schema ${raw || "(none)"} is not supported (IFC2X3, IFC4, IFC4X3)`);
    this.schema = sj instanceof Schema ? sj : new Schema(sj);
    if (p.policy) {
      const keep = new Map();
      const S = this.schema;
      // Geometry is not kept (see step.mjs), nor are relationships: _index
      // below reads each one once into its maps, and no check reads a
      // relationship's arguments again (36 MB on the 219 MB federated model,
      // eval/shared-values-2026-11-18.md).
      // Property sets, properties and quantities are not kept either: the
      // first read of a set keeps one compact record of its name and
      // properties (psetRecord), and a property's value is read from the
      // text when a facet asks for it (eval/pset-records-2026-11-18.md).
      p.policy.keep = (t) => {
        let k = keep.get(t);
        if (k === undefined) keep.set(t, (k = !S.isA(t, "IFCREPRESENTATIONITEM") && !S.isA(t, "IFCRELATIONSHIP") && !PROPERTY_ROOTS.some((r) => S.isA(t, r))));
        return k;
      };
    }
    this.byType = new Map();
    for (const e of this.entities.values()) {
      let l = this.byType.get(e.type);
      if (!l) this.byType.set(e.type, (l = []));
      l.push(e);
    }
    this._index();
  }
  get(ref) { return ref && typeof ref === "object" && "ref" in ref ? this.entities.get(ref.ref) : undefined; }
  attr(e, name) {
    if (!e) return undefined;
    const a = this.schema.attrs(e.type);
    const i = a.index.get(name);
    return i === undefined ? undefined : e.args[i];
  }
  refs(e, name) {
    const v = this.attr(e, name);
    if (Array.isArray(v)) return v.map((r) => this.get(r)).filter(Boolean);
    const one = this.get(v);
    return one ? [one] : [];
  }
  isA(e, t) { return this.schema.isA(e.type, t); }
  ofKind(t) {
    const out = [];
    for (const [type, list] of this.byType) if (this.schema.isA(type, t)) out.push(...list);
    return out;
  }
  _push(map, id, v) {
    let l = map.get(id);
    if (!l) map.set(id, (l = []));
    l.push(v);
  }
  _index() {
    this.typeOf = new Map();
    this.psetRels = new Map();
    this.classRels = new Map();
    this.matRels = new Map();
    this.parents = { IFCRELAGGREGATES: new Map(), IFCRELNESTS: new Map(), IFCRELCONTAINEDINSPATIALSTRUCTURE: new Map(), IFCRELASSIGNSTOGROUP: new Map(), IFCRELVOIDSELEMENT: new Map(), IFCRELFILLSELEMENT: new Map() };
    this.materialProps = new Map();
    this.extRefs = new Map();
    for (const e of this.entities.values()) {
      const t = e.type;
      if (this.isA(e, "IFCRELDEFINESBYTYPE")) {
        const ty = this.get(this.attr(e, "RelatingType"));
        for (const o of this.refs(e, "RelatedObjects")) this.typeOf.set(o.id, ty);
      } else if (this.isA(e, "IFCRELDEFINESBYPROPERTIES")) {
        const v = this.attr(e, "RelatingPropertyDefinition");
        let defs = [];
        if (v && v.typed) defs = (Array.isArray(v.value) ? v.value : [v.value]).map((r) => this.get(r)).filter(Boolean);
        else if (Array.isArray(v)) defs = v.map((r) => this.get(r)).filter(Boolean);
        else if (this.get(v)) defs = [this.get(v)];
        for (const o of this.refs(e, "RelatedObjects")) for (const d of defs) this._push(this.psetRels, o.id, d);
      } else if (this.isA(e, "IFCRELASSOCIATESCLASSIFICATION")) {
        const c = this.get(this.attr(e, "RelatingClassification"));
        for (const o of this.refs(e, "RelatedObjects")) if (c) this._push(this.classRels, o.id, c);
      } else if (this.isA(e, "IFCRELASSOCIATESMATERIAL")) {
        const m = this.get(this.attr(e, "RelatingMaterial"));
        for (const o of this.refs(e, "RelatedObjects")) if (m) this._push(this.matRels, o.id, m);
      } else if (t === "IFCRELAGGREGATES" || t === "IFCRELNESTS") {
        const whole = this.get(this.attr(e, "RelatingObject"));
        for (const o of this.refs(e, "RelatedObjects")) if (whole) this._push(this.parents[t], o.id, whole);
      } else if (t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
        const whole = this.get(this.attr(e, "RelatingStructure"));
        for (const o of this.refs(e, "RelatedElements")) if (whole) this._push(this.parents[t], o.id, whole);
      } else if (t === "IFCRELASSIGNSTOGROUP" || this.isA(e, "IFCRELASSIGNSTOGROUP")) {
        const whole = this.get(this.attr(e, "RelatingGroup"));
        for (const o of this.refs(e, "RelatedObjects")) if (whole) this._push(this.parents.IFCRELASSIGNSTOGROUP, o.id, whole);
      } else if (t === "IFCRELVOIDSELEMENT") {
        const whole = this.get(this.attr(e, "RelatingBuildingElement"));
        const part = this.get(this.attr(e, "RelatedOpeningElement"));
        if (whole && part) this._push(this.parents[t], part.id, whole);
      } else if (t === "IFCRELFILLSELEMENT") {
        const whole = this.get(this.attr(e, "RelatingOpeningElement"));
        const part = this.get(this.attr(e, "RelatedBuildingElement"));
        if (whole && part) this._push(this.parents[t], part.id, whole);
      } else if (t === "IFCMATERIALPROPERTIES" || t === "IFCEXTENDEDMATERIALPROPERTIES") {
        const m = this.get(this.attr(e, "Material"));
        if (m) this._push(this.materialProps, m.id, e);
      } else if (t === "IFCEXTERNALREFERENCERELATIONSHIP") {
        const ref = this.get(this.attr(e, "RelatingReference"));
        for (const o of this.refs(e, "RelatedResourceObjects")) if (ref) this._push(this.extRefs, o.id, ref);
      }
    }
    // Lists built by push carry V8's growth slack: a one-item list holds room
    // for 16 (about 150 bytes). Copied to their length once indexing is done
    // (eval/shared-values-2026-11-18.md).
    for (const map of [this.psetRels, this.classRels, this.matRels, this.materialProps, this.extRefs, ...Object.values(this.parents), this.byType]) for (const [k, l] of map) map.set(k, l.slice());
    this._units();
  }
  _units() {
    this.unitFactor = new Map();
    const proj = (this.byType.get("IFCPROJECT") || [])[0];
    const ua = proj && this.get(this.attr(proj, "UnitsInContext"));
    if (!ua) return;
    for (const u of this.refs(ua, "Units")) {
      const ut = this.attr(u, "UnitType");
      if (ut && ut.enum) this.unitFactor.set(ut.enum, this.unitScale(u));
    }
  }
  // {scale, offset}: SI value = value * scale + offset.
  unitScale(u) {
    if (!u) return { scale: 1, offset: 0 };
    if (u.type === "IFCSIUNIT") {
      const pre = this.attr(u, "Prefix");
      const name = (this.attr(u, "Name") || {}).enum || "";
      let f = pre && pre.enum ? own(SI_PREFIX, pre.enum) || 1 : 1;
      if (name.startsWith("SQUARE_")) f = f * f;
      else if (name.startsWith("CUBIC_")) f = f * f * f;
      if (name === "DEGREE_CELSIUS") return { scale: 1, offset: 273.15 };
      // IDS takes masses in kilograms: a GRAM unit with no prefix is 1e-3 kg.
      if (name === "GRAM") f = f * 1e-3;
      return { scale: f, offset: 0 };
    }
    if (u.type === "IFCCONVERSIONBASEDUNIT" || u.type === "IFCCONVERSIONBASEDUNITWITHOFFSET") {
      const mwu = this.get(this.attr(u, "ConversionFactor"));
      const vc = this.attr(mwu, "ValueComponent");
      const val = vc && vc.typed ? vc.value : vc;
      const base = this.unitScale(this.get(this.attr(mwu, "UnitComponent")));
      const off = u.type === "IFCCONVERSIONBASEDUNITWITHOFFSET" ? Number(this.attr(u, "ConversionOffset")) || 0 : 0;
      return { scale: Number(val) * base.scale, offset: base.offset + off * Number(val) * base.scale };
    }
    return { scale: 1, offset: 0 };
  }
}

// ---------------------------------------------------------------- values ----

const RE = {
  double: /^([-+]?[0-9]*\.?[0-9]*([eE][-+]?[0-9]+)?|NaN|\+INF|-INF)$/,
  integer: /^[+-]?\d+$/,
  boolean: /^(true|false|0|1)$/,
};

export function floatEq(x, v) {
  // Inclusive, with a hair of slack: 1.000002 against 1 sits exactly on the
  // bound and buildingSMART's cases expect it to pass.
  return Math.abs(x - v) <= (Math.abs(v) * 1e-6 + 1e-6) * (1 + 1e-9);
}

function parseDouble(text) {
  if (text === "" || !RE.double.test(text) || text === "." || /^[-+]?\.?$/.test(text)) return undefined;
  if (text === "NaN") return NaN;
  if (text === "+INF") return Infinity;
  if (text === "-INF") return -Infinity;
  const n = Number(text);
  return Number.isNaN(n) ? undefined : n;
}

// XSD regular expressions are anchored and use a few classes JS lacks.
// A pattern's matcher: the XSD meaning (xsdregex.mjs, the reading IfcTester
// and the IDS text use) when the text is an XSD regex; otherwise the looser
// JavaScript reading below, so a check still runs while the audit reports the
// pattern (pattern-not-xsd); null when neither reads it.
export function xsdRegex(p) {
  return compileXsdRegex(p) || jsRegex(p);
}

export function jsRegex(p) {
  let s = p.replace(/\\i/g, "[A-Za-z_:]").replace(/\\c/g, "[-.0-9A-Za-z_:]").replace(/\\I/g, "[^A-Za-z_:]").replace(/\\C/g, "[^-.0-9A-Za-z_:]");
  try { return new RegExp("^(?:" + s + ")$", "u"); } catch { try { return new RegExp("^(?:" + s + ")$"); } catch { return null; } }
}

// One IFC value, for comparison: v is a JS string, number, boolean or {enum}.
// prim says how to read the IDS text against it.
function simpleMatch(text, v, prim) {
  if (v === null || v === undefined) return false;
  if (prim === "logical" || prim === "boolean") {
    if (v && v.unknown) return false;
    if (typeof v !== "boolean") return false;
    if (text === "true" || text === "1") return v === true;
    if (text === "false" || text === "0") return v === false;
    return false;
  }
  if (prim === "double" || prim === "integer") {
    if (typeof v !== "number") return false;
    if (prim === "integer") {
      if (!RE.integer.test(text)) return false;
      return Number(text) === v;
    }
    const x = parseDouble(text);
    if (x === undefined) return false;
    return floatEq(v, x);
  }
  // string, enum, and anything else compared as text
  const s = v && v.enum ? v.enum : v;
  if (typeof s !== "string") return false;
  return s === text;
}

function lensOk(r, sv) {
  const lens = [r.length, r.minLength, r.maxLength];
  if (lens.some((b) => b !== undefined)) {
    if (typeof sv !== "string") return false;
    const n = [...sv].length;
    if (r.length !== undefined && n !== Number(r.length)) return false;
    if (r.minLength !== undefined && n < Number(r.minLength)) return false;
    if (r.maxLength !== undefined && n > Number(r.maxLength)) return false;
  }
  return true;
}

export class IdsValue {
  constructor(node) {
    this.simple = undefined;
    this.r = null;
    if (!node) return;
    const sv = kid(node, "simpleValue");
    if (sv) { this.simple = sv.text.trim() === sv.text ? sv.text : sv.text; return; }
    const r = kid(node, "restriction");
    // Bare text with no <simpleValue> breaks ids.xsd (structure.mjs says so);
    // read it as the value its author wrote rather than as "any value".
    if (!r && !node.children.some((c) => c.local) && node.text.trim() !== "") { this.simple = node.text.trim(); return; }
    if (r) {
      const base = (r.attrs.base || "").replace(/^\w+:/, "");
      const get = (n) => kids(r, n).map((k) => k.attrs.value);
      this.r = {
        base,
        enumeration: get("enumeration"),
        pattern: get("pattern"),
        minInclusive: get("minInclusive")[0], maxInclusive: get("maxInclusive")[0],
        minExclusive: get("minExclusive")[0], maxExclusive: get("maxExclusive")[0],
        length: get("length")[0], minLength: get("minLength")[0], maxLength: get("maxLength")[0],
      };
      this.r.regexes = this.r.pattern.map(xsdRegex);
    }
  }
  get present() { return this.simple !== undefined || this.r !== null; }
  toString() {
    if (this.simple !== undefined) return JSON.stringify(this.simple);
    if (!this.r) return "(any)";
    const r = this.r;
    const bits = [];
    if (r.enumeration.length) bits.push("one of " + r.enumeration.map((x) => JSON.stringify(x)).join(", "));
    if (r.pattern.length) bits.push("matching " + r.pattern.map((x) => "/" + x + "/").join(" or "));
    if (r.minInclusive !== undefined) bits.push(">= " + r.minInclusive);
    if (r.minExclusive !== undefined) bits.push("> " + r.minExclusive);
    if (r.maxInclusive !== undefined) bits.push("<= " + r.maxInclusive);
    if (r.maxExclusive !== undefined) bits.push("< " + r.maxExclusive);
    if (r.length !== undefined) bits.push("length " + r.length);
    if (r.minLength !== undefined) bits.push("length >= " + r.minLength);
    if (r.maxLength !== undefined) bits.push("length <= " + r.maxLength);
    return bits.join(", ");
  }
  // Match a name-like string (class, attribute, pset, property, system).
  matchString(s) { return this.match(s, "string"); }
  match(v, prim) {
    if (this.simple !== undefined) return simpleMatch(this.simple, v, prim);
    const r = this.r;
    if (!r) return true;
    if (v === null || v === undefined) return false;
    if (v && v.unknown) return false;
    if (r.enumeration.length && !r.enumeration.some((t) => simpleMatch(t, v, prim))) return false;
    const isNum = prim === "double" || prim === "integer";
    const sv = v && v.enum ? v.enum : v;
    if (r.pattern.length) {
      // A boolean is matched by its lexical form, true or false.
      const text = typeof sv === "boolean" ? String(sv) : sv;
      if (typeof text !== "string" || isNum) return false;
      if (!r.regexes.some((re) => re && re.test(text))) return false;
    }
    const bounds = [r.minInclusive, r.maxInclusive, r.minExclusive, r.maxExclusive];
    if (bounds.some((b) => b !== undefined)) {
      // Dates, times and durations: both sides in the same ISO form.
      if (typeof v === "string" && !isNum) {
        // temporalCompare orders past the millisecond (00:00:00.0004 is
        // after 00:00:00, as XSD has it); NaN for a bound of another kind.
        const kind = temporalKind(v);
        const key = temporalKey(v);
        if (!kind || key === null || Number.isNaN(key)) return false;
        const c = (b) => temporalCompare(v, b);
        if (r.minInclusive !== undefined && !(c(r.minInclusive) >= 0)) return false;
        if (r.maxInclusive !== undefined && !(c(r.maxInclusive) <= 0)) return false;
        if (r.minExclusive !== undefined && !(c(r.minExclusive) > 0)) return false;
        if (r.maxExclusive !== undefined && !(c(r.maxExclusive) < 0)) return false;
        return lensOk(r, sv);
      }
      if (typeof v !== "number") return false;
      if (r.minInclusive !== undefined && !(v >= Number(r.minInclusive))) return false;
      if (r.maxInclusive !== undefined && !(v <= Number(r.maxInclusive))) return false;
      if (r.minExclusive !== undefined && !(v > Number(r.minExclusive))) return false;
      if (r.maxExclusive !== undefined && !(v < Number(r.maxExclusive))) return false;
    }
    return lensOk(r, sv);
  }
}

// Null is "absent" (an optional facet passes); an empty string, an empty list
// and a logical UNKNOWN are present but carry no value, so they always fail.
const isNull = (v) => v === null || v === undefined || (v && v.derived);
const isEmpty = (v) => isNull(v) || v === "" || (Array.isArray(v) && v.length === 0) || (v && v.unknown);

// ---------------------------------------------------------------- facets ----
// Each facet's test(e, model) returns {ok, absent, why}: ok when the facet holds,
// absent when the thing it asks about is not there at all (optional passes).

// The element's predefined type, or null. Sets lastUser when it came from a
// USERDEFINED enum (an IDS may then name USERDEFINED itself).
let lastUser = false;
function predefinedType(model, e) {
  lastUser = false;
  const S = model.schema;
  const ty = model.typeOf.get(e.id);
  const read = (obj, userAttr) => {
    const pt = model.attr(obj, "PredefinedType");
    if (pt && pt.enum) {
      if (pt.enum === "USERDEFINED") {
        const u = model.attr(obj, userAttr);
        lastUser = true;
        return typeof u === "string" && u !== "" ? u : null;
      }
      if (pt.enum === "NOTDEFINED") return "NOTDEFINED";
      return pt.enum;
    }
    return undefined;
  };
  if (ty) {
    const userAttr = S.isA(ty.type, "IFCELEMENTTYPE") ? "ElementType" : S.isA(ty.type, "IFCTYPEPROCESS") ? "ProcessType" : S.isA(ty.type, "IFCTYPERESOURCE") ? "ResourceType" : "ElementType";
    const r = read(ty, userAttr);
    if (r !== undefined && r !== "NOTDEFINED") return r;
    lastUser = false;
  }
  if (S.isA(e.type, "IFCTYPEOBJECT")) {
    const userAttr = S.isA(e.type, "IFCELEMENTTYPE") ? "ElementType" : S.isA(e.type, "IFCTYPEPROCESS") ? "ProcessType" : S.isA(e.type, "IFCTYPERESOURCE") ? "ResourceType" : "ElementType";
    const r = read(e, userAttr);
    return r === undefined ? null : r;
  }
  const r = read(e, "ObjectType");
  return r === undefined ? null : r;
}

// The IFC2X3 type mapping table indexed by occurrence class, rows in the
// table's order. Building Object.entries(typeMap) for every entity was over
// half the time of an IDS applying to every entity (eval/no-entity-facet-2026-11-17.md).
const TYPE_MAP_INDEX = new WeakMap();
function typeMapByOcc(typeMap) {
  let idx = TYPE_MAP_INDEX.get(typeMap);
  if (idx) return idx;
  idx = new Map();
  for (const [idsName, [occ, tyName]] of Object.entries(typeMap)) {
    let rows = idx.get(occ);
    if (!rows) idx.set(occ, (rows = []));
    rows.push([tyName, idsName]);
  }
  TYPE_MAP_INDEX.set(typeMap, idx);
  return idx;
}

export class EntityFacet {
  constructor(node) {
    this.kind = "entity";
    this.name = new IdsValue(kid(node, "name"));
    this.predefinedType = new IdsValue(kid(node, "predefinedType"));
  }
  // Class names this element answers to (IFC2X3 also by the type mapping table).
  names(model, e, typeMap) {
    const out = [e.type];
    if (model.schemaId === "IFC2X3" && typeMap) {
      const rows = typeMapByOcc(typeMap).get(e.type);
      const ty = rows && model.typeOf.get(e.id);
      if (ty) for (const [tyName, idsName] of rows) if (ty.type === tyName) out.push(idsName);
    }
    return out;
  }
  test(e, model, ctx) {
    const names = this.names(model, e, ctx.typeMap);
    if (!names.some((n) => this.name.matchString(n))) return { ok: false, why: `is ${e.type}, not ${this.name}` };
    if (this.predefinedType.present) {
      const pt = predefinedType(model, e);
      const user = lastUser;
      if (!(user && this.predefinedType.matchString("USERDEFINED")) && (pt === null || !this.predefinedType.matchString(pt))) return { ok: false, why: `predefined type is ${pt === null ? "not set" : JSON.stringify(pt)}, not ${this.predefinedType}` };
    }
    return { ok: true };
  }
  candidates(model, ctx) {
    if (this.name.simple !== undefined) {
      const n = this.name.simple;
      const out = [...(model.byType.get(n) || [])];
      if (model.schemaId === "IFC2X3" && own(ctx.typeMap, n)) out.push(...(model.byType.get(own(ctx.typeMap, n)[0]) || []));
      return out;
    }
    if (this.name.r && this.name.r.enumeration.length && !this.name.r.pattern.length) {
      const out = [];
      for (const n of this.name.r.enumeration) {
        out.push(...(model.byType.get(n) || []));
        if (model.schemaId === "IFC2X3" && own(ctx.typeMap, n)) out.push(...(model.byType.get(own(ctx.typeMap, n)[0]) || []));
      }
      return [...new Set(out)];
    }
    return null;
  }
  describe() { return `entity ${this.name}${this.predefinedType.present ? " of predefined type " + this.predefinedType : ""}`; }
}

export class AttributeFacet {
  constructor(node) {
    this.kind = "attribute";
    this.name = new IdsValue(kid(node, "name"));
    this.value = new IdsValue(kid(node, "value"));
  }
  test(e, model) {
    const S = model.schema;
    // The attributes the name takes depend only on the class (and schema), so
    // they are found once per class and kept (eval/psets-cache-2026-11-18.md).
    let byType = this._hits;
    if (!byType || this._hitsSchema !== S) { byType = this._hits = new Map(); this._hitsSchema = S; }
    let hits = byType.get(e.type);
    if (!hits) byType.set(e.type, (hits = S.attrs(e.type).map((a, i) => [a, i]).filter(([a]) => this.name.matchString(a.name))));
    if (!hits.length) return { ok: false, absent: true, why: `has no attribute ${this.name}` };
    // Nothing below reads inside a list (only whether it is empty), so a lazy
    // STEP entity may hand over its arguments with nested lists unread.
    const args = e.shallowArgs || e.args;
    const set = hits.filter(([a, i]) => !a.derived && !isNull(args[i]));
    if (!set.length) return { ok: false, absent: true, why: `attribute ${this.name} is not set` };
    const present = set.filter(([, i]) => !isEmpty(args[i]));
    if (present.length < set.length) return { ok: false, why: `attribute ${this.name} is empty or unknown` };
    if (!this.value.present) return { ok: true };
    for (const [a, i] of present) {
      const v = args[i];
      const prim = S.prim(a.type);
      if (a.aggregate || Array.isArray(v)) return { ok: false, why: `${a.name} is a list; IDS cannot compare its value` };
      if (v && (v.ref !== undefined || v.typed)) return { ok: false, why: `${a.name} refers to an object or a select; IDS cannot compare its value` };
      if (prim === "entity" || prim === "select" || prim === "aggregate" || prim === "binary") return { ok: false, why: `${a.name} cannot be compared by value` };
      if (!this.value.match(v, prim)) return { ok: false, why: `${a.name} is ${fmt(v)}, not ${this.value}` };
    }
    return { ok: true };
  }
  // The part of test() that does not depend on the value, as one shape code
  // (SHAPE_*): which attributes the name takes, which are set, empty, or not
  // comparable by value. Specifications that test `attribute (any) = X` on
  // every entity with several values X share it (attributeVerdict).
  shape(e, model) {
    const S = model.schema;
    let byType = this._hits;
    if (!byType || this._hitsSchema !== S) { byType = this._hits = new Map(); this._hitsSchema = S; }
    let hits = byType.get(e.type);
    if (!hits) byType.set(e.type, (hits = S.attrs(e.type).map((a, i) => [a, i]).filter(([a]) => this.name.matchString(a.name))));
    if (!hits.length) return SHAPE_NO_ATTR;
    const args = e.shallowArgs || e.args;
    let set = 0, uncomparable = false;
    for (const [a, i] of hits) {
      const v = args[i];
      if (a.derived || isNull(v)) continue;
      set++;
      if (isEmpty(v)) return SHAPE_EMPTY;
      if (a.aggregate || Array.isArray(v) || (v && (v.ref !== undefined || v.typed))) uncomparable = true;
      else { const prim = S.prim(a.type); if (prim === "entity" || prim === "select" || prim === "aggregate" || prim === "binary") uncomparable = true; }
    }
    if (!set) return SHAPE_UNSET;
    return uncomparable ? SHAPE_UNCOMPARABLE : SHAPE_SCALARS;
  }
  describe() { return `attribute ${this.name}${this.value.present ? " = " + this.value : ""}`; }
}
// AttributeFacet.shape codes (non-zero: 0 marks "not yet read" in a cache).
const SHAPE_NO_ATTR = 1, SHAPE_UNSET = 2, SHAPE_EMPTY = 3, SHAPE_UNCOMPARABLE = 4, SHAPE_SCALARS = 5;

const fmt = (v) => (v && v.enum ? "." + v.enum + "." : JSON.stringify(v));

export const QUANTITY_MEASURE = {
  IFCQUANTITYLENGTH: ["LengthValue", "IFCLENGTHMEASURE"],
  IFCQUANTITYAREA: ["AreaValue", "IFCAREAMEASURE"],
  IFCQUANTITYVOLUME: ["VolumeValue", "IFCVOLUMEMEASURE"],
  IFCQUANTITYCOUNT: ["CountValue", "IFCCOUNTMEASURE"],
  IFCQUANTITYWEIGHT: ["WeightValue", "IFCMASSMEASURE"],
  IFCQUANTITYTIME: ["TimeValue", "IFCTIMEMEASURE"],
  IFCQUANTITYNUMBER: ["NumberValue", "IFCNUMERICMEASURE"],
};

// The classes whose arguments the Model does not keep once read (besides
// geometry and relationships): sets of properties and what they hold. Names
// a schema lacks match nothing.
const PROPERTY_ROOTS = ["IFCPROPERTYABSTRACTION", "IFCPROPERTY", "IFCPHYSICALQUANTITY", "IFCPROPERTYSETDEFINITION", "IFCMATERIALPROPERTIES", "IFCPROFILEPROPERTIES"];

// One property set read once, as one flat list: [name, name1, property1,
// name2, property2, ...], name null when the set has no string Name (psetsOf
// skips it), each property the entity (or for a predefined set {predefined,
// owner, attr, value}), in the set's order. Kept per model by set number. It
// stands in for the set's and its properties' kept arguments: 12 MB of
// records where the arguments took about 79 MB on the 219 MB federated model
// after 68 IDS files, and the names are read once, not once per element
// (eval/pset-records-2026-11-18.md).
export function psetRecord(model, pset) {
  let recs = model._psetRecs;
  if (!recs) recs = model._psetRecs = new Map();
  let r = recs.get(pset.id);
  if (r) return r;
  const args = pset.args;
  const nameAt = model.schema.attrs(pset.type).index.get("Name");
  const name = nameAt === undefined ? undefined : args[nameAt];
  const r2 = [typeof name === "string" ? name : null];
  if (pset.type === "IFCPROPERTYSET" || pset.type === "IFCELEMENTQUANTITY" || pset.type === "IFCMATERIALPROPERTIES" || pset.type === "IFCEXTENDEDMATERIALPROPERTIES" || pset.type === "IFCPROFILEPROPERTIES") {
    const listName = pset.type === "IFCELEMENTQUANTITY" ? "Quantities" : pset.type === "IFCEXTENDEDMATERIALPROPERTIES" ? "ExtendedProperties" : pset.type === "IFCPROPERTYSET" ? "HasProperties" : "Properties";
    const at = model.schema.attrs(pset.type).index.get(listName);
    const list = at === undefined ? undefined : args[at];
    for (const ref of Array.isArray(list) ? list : [list]) {
      const p = model.get(ref);
      if (!p) continue;
      const pn = model.attr(p, "Name");
      if (typeof pn === "string") r2.push(pn, p);
    }
  } else if (model.isA(pset, "IFCPREDEFINEDPROPERTYSET")) {
    const attrs = model.schema.attrs(pset.type);
    for (let i = 4; i < attrs.length; i++) r2.push(attrs[i].name, { predefined: true, owner: pset, attr: attrs[i], value: args[i] });
  }
  // Copied to its length: a list built by push keeps room for 16.
  r = r2.slice();
  recs.set(pset.id, r);
  return r;
}

// One property set's name and properties: {name, props: Map(name ->
// propEntity)}, a new Map on each call (psetsOf changes it), from the set's
// record (psetRecord). A later property of the same name wins, as before.
export function psetInfo(model, pset) {
  const r = psetRecord(model, pset);
  const props = new Map();
  for (let i = 1; i < r.length; i += 2) props.set(r[i], r[i + 1]);
  return { name: r[0], props };
}

// The property sets psetsOf reads for an element, in its order (later ones
// override earlier ones of the same name): the element's type's, a type
// object's own, the property relationships', a material's.
export function psetSources(model, e, visit) {
  const ty = model.typeOf.get(e.id);
  if (ty) for (const p of model.refs(ty, "HasPropertySets")) visit(p);
  if (model.isA(e, "IFCTYPEOBJECT")) for (const p of model.refs(e, "HasPropertySets")) visit(p);
  const rel = model.psetRels.get(e.id);
  if (rel) for (const p of rel) visit(p);
  if (e.type === "IFCMATERIAL" || model.isA(e, "IFCMATERIALDEFINITION")) for (const p of model.materialProps.get(e.id) || []) visit(p);
}

// The elements that reach a property set of each name, through the sources
// psetsOf reads: Map(name -> [element]), built once per model (it reads each
// set's Name only). Sets with no string Name are left out, as psetsOf leaves
// them out.
export function psetHolders(model) {
  if (model._psetHolders) return model._psetHolders;
  const out = new Map();
  const seen = new Set();
  const consider = (e) => {
    if (!e || seen.has(e.id)) return;
    seen.add(e.id);
    psetSources(model, e, (p) => {
      // The name alone: the record (properties too) is read only for sets a
      // facet's name takes.
      const r = model._psetRecs && model._psetRecs.get(p.id);
      const n = r ? r[0] : model.attr(p, "Name");
      if (typeof n !== "string") return;
      let l = out.get(n);
      if (!l) out.set(n, (l = []));
      if (l[l.length - 1] !== e) l.push(e);
    });
  };
  for (const id of model.typeOf.keys()) consider(model.entities.get(id));
  for (const id of model.psetRels.keys()) consider(model.entities.get(id));
  for (const id of model.materialProps.keys()) consider(model.entities.get(id));
  for (const [type, list] of model.byType) if (model.schema.isA(type, "IFCTYPEOBJECT")) for (const e of list) consider(e);
  return (model._psetHolders = out);
}

// Property sets of an element by name: {name -> {props: Map(name -> propEntity), entities}}
// Type psets are inherited and an occurrence's pset of the same name overrides
// per property.
export function psetsOf(model, e) {
  const out = new Map();
  psetSources(model, e, (pset) => {
    const info = psetInfo(model, pset);
    if (info.name === null) return;
    const slot = out.get(info.name);
    if (!slot) { out.set(info.name, { props: info.props, entities: [pset] }); return; }
    slot.entities.push(pset);
    for (const [pn, p] of info.props) slot.props.set(pn, p);
  });
  return out;
}

export class PropertyFacet {
  constructor(node) {
    this.kind = "property";
    this.propertySet = new IdsValue(kid(node, "propertySet"));
    // IDS 0.9 wrote <name> and datatype; read them as 1.0's baseName and
    // dataType (structure.mjs still reports them, fix.mjs rewrites them).
    this.baseName = new IdsValue(kid(node, "baseName") || kid(node, "name"));
    this.value = new IdsValue(kid(node, "value"));
    this.dataType = (node.attrs.dataType ?? node.attrs.datatype ?? "").toUpperCase() || null;
    // The bSDD link (ids.xsd: requirement facets only); kept so the editor
    // writes it back. The checker does not read it (bsdd.mjs does).
    this.uri = node.attrs.uri ?? null;
  }
  // The values one property holds, each {v, type} with v converted to SI units.
  values(model, p) {
    const S = model.schema;
    const out = [];
    // The property's arguments, read once: properties are not kept
    // (psetRecord), so each model.attr would read the text again.
    const A = p.predefined ? null : p.args;
    const at = (name) => { const k = S.attrs(p.type).index.get(name); return k === undefined ? undefined : A[k]; };
    const unitOf = (p, type) => {
      const u = p ? model.get(at("Unit")) : undefined;
      if (u) return model.unitScale(u);
      const ut = own(model.measureUnits, type);
      return (ut && model.unitFactor.get(ut)) || { scale: 1, offset: 0 };
    };
    const push = (raw, p, fallbackType) => {
      if (raw === null || raw === undefined) return;
      let type = fallbackType;
      let v = raw;
      if (raw && raw.typed) { type = raw.typed; v = raw.value; }
      const prim = S.prim(type);
      if (typeof v === "number" && (prim === "double") && own(model.measureUnits, type)) {
        const { scale, offset } = unitOf(p, type);
        v = v * scale + offset;
      }
      out.push({ v, type, prim });
    };
    if (p.predefined) {
      const a = p.attr;
      if (a.aggregate || Array.isArray(p.value)) return { values: [], unsupported: "list" };
      if (p.value && p.value.ref !== undefined) return { values: [], unsupported: "object" };
      push(p.value, null, a.type);
      return { values: out };
    }
    switch (p.type) {
      case "IFCPROPERTYSINGLEVALUE": push(at("NominalValue"), p); break;
      case "IFCPROPERTYENUMERATEDVALUE": for (const x of at("EnumerationValues") || []) push(x, p); break;
      case "IFCPROPERTYLISTVALUE": for (const x of at("ListValues") || []) push(x, p); break;
      case "IFCPROPERTYBOUNDEDVALUE": {
        const lo = at("LowerBoundValue");
        const hi = at("UpperBoundValue");
        const sp = at("SetPointValue");
        const r = { values: [], bounded: true };
        const tmp = [];
        const before = out.length;
        push(lo, p); r.lo = out.length > before ? out[out.length - 1] : null;
        const b2 = out.length;
        push(hi, p); r.hi = out.length > b2 ? out[out.length - 1] : null;
        const b3 = out.length;
        if (sp !== undefined) push(sp, p);
        r.sp = out.length > b3 ? out[out.length - 1] : null;
        void tmp;
        r.values = out;
        return r;
      }
      case "IFCPROPERTYTABLEVALUE":
        for (const x of at("DefiningValues") || []) push(x, p);
        for (const x of at("DefinedValues") || []) push(x, p);
        break;
      default:
        if (own(QUANTITY_MEASURE, p.type)) {
          const [an, mt] = own(QUANTITY_MEASURE, p.type);
          const v = at(an);
          if (v !== null && v !== undefined) {
            let x = v && v.typed ? v.value : v;
            if (typeof x === "number" && own(model.measureUnits, mt)) {
              const { scale, offset } = unitOf(p, mt);
              x = x * scale + offset;
            }
            out.push({ v: x, type: mt, prim: S.prim(mt) });
          }
          break;
        }
        return { values: [], unsupported: p.type };
    }
    return { values: out };
  }
  test(e, model) {
    const psets = psetsOf(model, e);
    const matching = [...psets.entries()].filter(([n]) => this.propertySet.matchString(n));
    if (!matching.length) return { ok: false, absent: true, why: `has no property set ${this.propertySet}` };
    let found = 0;
    for (const [psName, slot] of matching) {
      const props = [...slot.props.entries()].filter(([n]) => this.baseName.matchString(n));
      if (!props.length) return { ok: false, absent: matching.length === 1, why: `${psName} has no property ${this.baseName}` };
      for (const [pn, p] of props) {
        const r = this.values(model, p);
        if (r.unsupported) return { ok: false, why: `${psName}.${pn} is a ${r.unsupported.toLowerCase()} property, which IDS does not check` };
        const vals = r.values.filter((x) => !isEmpty(x.v));
        if (!vals.length) return { ok: false, absent: true, why: `${psName}.${pn} has no value` };
        const typed = this.dataType ? vals.filter((x) => (x.type || "").toUpperCase() === this.dataType) : vals;
        if (!typed.length) return { ok: false, why: `${psName}.${pn} is ${vals[0].type || "untyped"}, not ${this.dataType}` };
        if (this.value.present) {
          let ok;
          const ranged = this.value.r && [this.value.r.minInclusive, this.value.r.maxInclusive, this.value.r.minExclusive, this.value.r.maxExclusive].some((b) => b !== undefined);
          if (r.bounded) {
            const lo = r.lo && !isEmpty(r.lo.v) ? r.lo : null;
            const hi = r.hi && !isEmpty(r.hi.v) ? r.hi : null;
            if (!lo && !hi) ok = false;
            else if (ranged) ok = [lo, hi].every((x) => x && this.value.match(x.v, x.prim));
            // A single value must equal a bound or the set point (buildingSMART's
            // bounded-property cases: 2 against 1..5 with set point 3 fails).
            else ok = [lo, hi, r.sp].some((x) => x && this.value.match(x.v, x.prim));
          } else if (ranged) ok = typed.every((x) => this.value.match(x.v, x.prim));
          else ok = typed.some((x) => this.value.match(x.v, x.prim));
          if (!ok) return { ok: false, why: `${psName}.${pn} is ${vals.map((x) => fmt(x.v)).join(", ")}, not ${this.value}` };
        }
        found++;
      }
    }
    return found ? { ok: true } : { ok: false, absent: true, why: `no property ${this.baseName} in ${this.propertySet}` };
  }
  describe() { return `property ${this.propertySet}.${this.baseName}${this.dataType ? " (" + this.dataType + ")" : ""}${this.value.present ? " = " + this.value : ""}`; }
}

// Classification references of an element: [{system, codes: [..], ref}]
export function classificationsOf(model, e) {
  const own = (id) => {
    const out = [];
    for (const c of model.classRels.get(id) || []) out.push(...describeClassification(model, c));
    for (const c of model.extRefs.get(id) || []) if (model.isA(c, "IFCCLASSIFICATIONREFERENCE") || c.type === "IFCCLASSIFICATION") out.push(...describeClassification(model, c));
    return out;
  };
  const mine = own(e.id);
  const ty = model.typeOf.get(e.id);
  if (!ty) return mine;
  const systems = new Set(mine.map((c) => c.system));
  return mine.concat(own(ty.id).filter((c) => !systems.has(c.system)));
}

function describeClassification(model, c) {
  if (c.type === "IFCCLASSIFICATION") return [{ system: model.attr(c, "Name"), codes: [] }];
  if (c.type === "IFCCLASSIFICATIONNOTATION") return [];
  const codes = [];
  let system = null;
  let cur = c;
  for (let guard = 0; cur && guard < 50; guard++) {
    if (cur.type === "IFCCLASSIFICATION") { system = model.attr(cur, "Name"); break; }
    const code = model.schemaId === "IFC2X3" ? model.attr(cur, "ItemReference") : model.attr(cur, "Identification");
    if (typeof code === "string") codes.push(code);
    cur = model.get(model.attr(cur, "ReferencedSource"));
  }
  return [{ system, codes }];
}

export class ClassificationFacet {
  constructor(node) {
    this.kind = "classification";
    this.system = new IdsValue(kid(node, "system"));
    this.value = new IdsValue(kid(node, "value"));
    this.uri = node.attrs.uri ?? null;
  }
  test(e, model) {
    const refs = classificationsOf(model, e);
    if (!refs.length) return { ok: false, absent: true, why: "has no classification" };
    const inSys = this.system.present ? refs.filter((r) => typeof r.system === "string" && this.system.matchString(r.system)) : refs;
    if (!inSys.length) return { ok: false, why: `has no ${this.system} classification (has ${refs.map((r) => r.system).join(", ")})` };
    if (!this.value.present) return { ok: true };
    if (inSys.some((r) => r.codes.some((code) => this.value.matchString(code)))) return { ok: true };
    return { ok: false, why: `classified ${inSys.map((r) => r.codes[0] || "(no code)").join(", ")}, not ${this.value}` };
  }
  describe() { return `classification ${this.system.present ? this.system : "(any system)"}${this.value.present ? " " + this.value : ""}`; }
}

// Names and categories of every material an element uses.
export function materialNames(model, e) {
  let rels = model.matRels.get(e.id);
  if (!rels || !rels.length) {
    const ty = model.typeOf.get(e.id);
    if (ty) rels = model.matRels.get(ty.id);
  }
  if (!rels || !rels.length) return null;
  const names = [];
  const add = (v) => { if (typeof v === "string" && v !== "") names.push(v); };
  const walk = (m, depth = 0) => {
    if (!m || depth > 6) return;
    switch (m.type) {
      case "IFCMATERIAL": add(model.attr(m, "Name")); add(model.attr(m, "Category")); break;
      case "IFCMATERIALLIST": for (const x of model.refs(m, "Materials")) walk(x, depth + 1); break;
      case "IFCMATERIALLAYERSETUSAGE": walk(model.get(model.attr(m, "ForLayerSet")), depth + 1); break;
      case "IFCMATERIALLAYERSET": add(model.attr(m, "LayerSetName")); for (const x of model.refs(m, "MaterialLayers")) walk(x, depth + 1); break;
      case "IFCMATERIALLAYER": case "IFCMATERIALLAYERWITHOFFSETS": add(model.attr(m, "Name")); add(model.attr(m, "Category")); walk(model.get(model.attr(m, "Material")), depth + 1); break;
      case "IFCMATERIALPROFILESETUSAGE": case "IFCMATERIALPROFILESETUSAGETAPERING": walk(model.get(model.attr(m, "ForProfileSet")), depth + 1); break;
      case "IFCMATERIALPROFILESET": add(model.attr(m, "Name")); for (const x of model.refs(m, "MaterialProfiles")) walk(x, depth + 1); break;
      case "IFCMATERIALPROFILE": case "IFCMATERIALPROFILEWITHOFFSETS": add(model.attr(m, "Name")); add(model.attr(m, "Category")); walk(model.get(model.attr(m, "Material")), depth + 1); break;
      case "IFCMATERIALCONSTITUENTSET": add(model.attr(m, "Name")); for (const x of model.refs(m, "MaterialConstituents")) walk(x, depth + 1); break;
      case "IFCMATERIALCONSTITUENT": add(model.attr(m, "Name")); add(model.attr(m, "Category")); walk(model.get(model.attr(m, "Material")), depth + 1); break;
      default: add(model.attr(m, "Name"));
    }
  };
  for (const r of rels) walk(r);
  return names;
}

export class MaterialFacet {
  constructor(node) {
    this.kind = "material";
    this.value = new IdsValue(kid(node, "value"));
    this.uri = node.attrs.uri ?? null;
  }
  test(e, model) {
    const names = materialNames(model, e);
    if (names === null) return { ok: false, absent: true, why: "has no material" };
    if (!this.value.present) return { ok: true };
    if (names.some((n) => this.value.matchString(n))) return { ok: true };
    return { ok: false, why: names.length ? `materials are ${names.map((n) => JSON.stringify(n)).join(", ")}, not ${this.value}` : `material has no name or category to compare with ${this.value}` };
  }
  describe() { return `material${this.value.present ? " " + this.value : ""}`; }
}

const PARTOF_RELS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT", "IFCRELFILLSELEMENT"];
const VOIDS_FILLS = "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT";

export class PartOfFacet {
  constructor(node) {
    this.kind = "partOf";
    // IDS 1.0 (ids.xsd) writes voids and fills as one token pair:
    // "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT".
    this.relation = (node.attrs.relation || "").trim().split(/\s+/).join(" ").toUpperCase() || null;
    const en = kid(node, "entity");
    this.entity = en ? new EntityFacet(en) : null;
  }
  wholes(model, e) {
    const seen = new Set();
    const out = [];
    const rels = this.relation === VOIDS_FILLS ? ["IFCRELFILLSELEMENT", "IFCRELVOIDSELEMENT"] : this.relation ? [this.relation] : PARTOF_RELS;
    const step = (x) => {
      const ps = [];
      for (const r of rels) for (const p of (model.parents[r] && model.parents[r].get(x.id)) || []) ps.push(p);
      // A container sits in an aggregate chain (space < storey < building < site).
      if (this.relation === "IFCRELCONTAINEDINSPATIALSTRUCTURE") for (const p of model.parents.IFCRELAGGREGATES.get(x.id) || []) if (seen.size) ps.push(p);
      return ps;
    };
    const queue = [e];
    while (queue.length) {
      const x = queue.shift();
      for (const p of step(x)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        queue.push(p);
      }
    }
    return out;
  }
  test(e, model, ctx) {
    let ws = this.wholes(model, e);
    // Through an opening, the whole is the element the opening voids (a door
    // filling an opening in a wall is part of the wall), as IfcTester reads it;
    // the opening itself is the path, not the whole.
    if (this.relation === VOIDS_FILLS) ws = ws.filter((w) => !model.isA(w, "IFCFEATUREELEMENTSUBTRACTION"));
    if (!ws.length) return { ok: false, absent: true, why: `is not part of anything${this.relation ? " through " + this.relation : ""}` };
    if (!this.entity) return { ok: true };
    if (ws.some((w) => this.entity.test(w, model, ctx).ok)) return { ok: true };
    return { ok: false, why: `is part of ${ws.map((w) => w.type + " #" + w.id).join(", ")}, none a ${this.entity.describe()}` };
  }
  describe() { return `part of ${this.entity ? this.entity.describe() : "anything"}${this.relation ? " via " + this.relation : ""}`; }
}

const FACETS = { entity: EntityFacet, attribute: AttributeFacet, property: PropertyFacet, classification: ClassificationFacet, material: MaterialFacet, partOf: PartOfFacet };

function readFacets(node) {
  const out = [];
  if (!node) return out;
  for (const c of node.children) {
    const F = own(FACETS, c.local);
    if (!F) continue;
    const f = new F(c);
    let card = c.attrs.cardinality;
    if (!card && (c.attrs.minOccurs !== undefined || c.attrs.maxOccurs !== undefined)) {
      card = c.attrs.maxOccurs === "0" ? "prohibited" : c.attrs.minOccurs === "0" ? "optional" : "required";
    }
    f.cardinality = card || "required";
    // ids.xsd's instructions on a facet: for the reader (spec-doc.mjs), not checked.
    if (c.attrs.instructions) f.instructions = c.attrs.instructions;
    out.push(f);
  }
  return out;
}

// -------------------------------------------------------------------- IDS ----

// The <info> children of IDS 1.0, in the order ids.xsd fixes.
export const INFO_FIELDS = ["title", "copyright", "version", "description", "author", "date", "purpose", "milestone"];

export function parseIds(text) {
  const root = parseXml(text, { spans: true });
  if (root.local !== "ids") throw new Error(`not an IDS file: root element is <${root.name}>`);
  const info = kid(root, "info");
  const title = info && kid(info, "title") ? kid(info, "title").text.trim() : null;
  // Every info field IDS 1.0 has, as written (the editor carries them through).
  const infoFields = {};
  for (const k of INFO_FIELDS) { const n = info && kid(info, k); if (n && n.text.trim() !== "") infoFields[k] = n.text.trim(); }
  const specs = [];
  for (const s of kids(kid(root, "specifications"), "specification")) {
    const app = kid(s, "applicability");
    const minOccurs = app && app.attrs.minOccurs !== undefined ? app.attrs.minOccurs : s.attrs.minOccurs;
    const maxOccurs = app && app.attrs.maxOccurs !== undefined ? app.attrs.maxOccurs : s.attrs.maxOccurs;
    // xs:occurs defaults: minOccurs 1, maxOccurs 1.
    let optionality = "required";
    if (maxOccurs === "0") optionality = "prohibited";
    else if (minOccurs === "0") optionality = "optional";
    const req = kid(s, "requirements");
    specs.push({
      name: s.attrs.name || "(unnamed)",
      description: s.attrs.description || null,
      instructions: s.attrs.instructions || null,
      ifcVersion: (s.attrs.ifcVersion || "").split(/\s+/).filter(Boolean).map((v) => v.toUpperCase()),
      optionality,
      applicability: readFacets(app),
      requirements: readFacets(req),
      requirementsDescription: req && req.attrs.description,
    });
  }
  const out = { title, info: infoFields, specs };
  // Where the file breaks ids.xsd (structure.mjs), for the audit; not
  // enumerable, so JSON reports and the editor's state stay as they were.
  Object.defineProperty(out, "structure", { value: structureIssues(root, text) });
  return out;
}

function versionMatches(spec, model) {
  if (!spec.ifcVersion.length) return true;
  return spec.ifcVersion.some((v) => v === model.schemaRaw || v === model.schemaId || (model.schemaId === "IFC4X3" && v.startsWith("IFC4X3")));
}

// walk: true visits every entity, as before the candidate pools; kept for
// file-order-candidates.test.mjs, which compares the two.
export function applies(spec, model, ctx, walk = false) {
  if (walk || ctx.noCache) return appliesUncached(spec, model, ctx, walk).hits;
  // Specifications in one IDS, and the IDS files CI checks against one parsed
  // model, repeat the same applicability: 539 specifications in the 68 public
  // and starter files have 153 distinct ones, and the ten that take every
  // entity of HHS MEP (665,224) each ran every facet on every entity
  // (eval/applies-cache-2026-11-18.md). The result is kept per model, keyed
  // on the facets' full content, and held off the JS heap (the 219 MB
  // federated model's run fits a 1 GB heap with almost nothing to spare): a
  // result in file order that takes most of the model as the file positions
  // of the entities it leaves out, any other as its entities' ids, both in
  // Int32Arrays.
  const c = appliesCacheFor(model, ctx);
  const key = facetsKey(spec.applicability);
  const got = c.map.get(key);
  if (got) return got.except ? allBut(model, got.except) : got.ids ? fromIds(model, got.ids) : got.hits;
  const r = appliesUncached(spec, model, ctx, false);
  const hits = r.hits;
  const n = model.entities.size;
  if (r.fileOrder && hits.length > n / 2) {
    const left = n - hits.length;
    if (c.budget >= left) {
      const except = new Int32Array(left);
      let i = 0, j = 0, pos = 0;
      for (const e of model.entities.values()) { if (hits[i] === e) i++; else except[j++] = pos; pos++; }
      c.budget -= left;
      c.map.set(key, { except });
    }
  } else if (c.budget >= hits.length) {
    c.budget -= hits.length;
    const ids = hits.every((e) => (e.id | 0) === e.id) ? Int32Array.from(hits, (e) => e.id) : null;
    c.map.set(key, ids ? { ids } : { hits });
  }
  return hits;
}

// What a facet tests, for the applicability cache's key: its own fields, not
// the caches a facet keeps on itself (_hits) or the regexes compiled from its
// patterns (the patterns are in the key).
export function facetsKey(facets) {
  return JSON.stringify(facets, (k, v) => (k.startsWith("_") || k === "regexes" ? undefined : v));
}

// One cache per model and per check context: an IFC2X3 entity facet reads
// the type map, and a property value's units read measureUnits. The budget is
// the model's entity count in kept entries (4 bytes each, 15 MB on the 219 MB
// federated model), so the cache cannot grow past that however many IDS files
// are checked.
function appliesCacheFor(model, ctx) {
  const c = model._appliesCache;
  if (c && c.typeMap === ctx.typeMap && c.measureUnits === model.measureUnits) return c;
  return (model._appliesCache = { typeMap: ctx.typeMap, measureUnits: model.measureUnits, map: new Map(), budget: model.entities.size, verdicts: new Map(), byName: new Map() });
}

// Every entity in file order but those at the (ascending) positions given.
// The list is allocated at its final size: grown by push, a 3.7 million
// entry list leaves its outgrown copies as garbage, enough to tip the 219 MB
// federated run over a 1 GB heap.
function allBut(model, except) {
  const out = new Array(model.entities.size - except.length);
  let i = 0, j = 0, pos = 0;
  for (const e of model.entities.values()) { if (j < except.length && except[j] === pos) j++; else out[i++] = e; pos++; }
  return out;
}

function fromIds(model, ids) {
  const out = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) out[i] = model.entities.get(ids[i]);
  return out;
}

// fileOrder: true when the hits are in the entities Map's order (a walk, or a
// no-entity-facet pool put back in file order); an entity facet's pool is in
// class order.
function appliesUncached(spec, model, ctx, walk) {
  let pool = null;
  for (const f of spec.applicability) {
    if (f.kind === "entity") {
      const c = f.candidates(model, ctx);
      if (c) { pool = c; break; }
    }
  }
  // A cheap test per facet that reads no arguments (the entity's type, or
  // whether it appears in a relationship index) and is false only where the
  // facet's own test fails. Without an entity facet the pool is every entity
  // in the model (3.7 million on a 219 MB federated model, three quarters of
  // them geometry), so these keep the full tests, which parse arguments, to the
  // entities that can match (eval/no-entity-facet-2026-11-17.md).
  const pre = spec.applicability.map((f) => prefilter(f, model)).filter(Boolean);
  // A pool that covers most of the model reads each facet's verdict through
  // the per-facet cache (facetVerdicts, below); a small one tests directly.
  const keepFor = (size) => {
    const slots = walk ? null : spec.applicability.map((f) => verdictSlot(f, model, ctx, size));
    if (!slots || slots.every((x) => !x)) return (e) => pre.every((p) => p(e)) && spec.applicability.every((f) => f.test(e, model, ctx).ok);
    return (e) => pre.every((p) => p(e)) && spec.applicability.every((f, k) => (slots[k] ? verdict(slots[k], f, e, model, ctx) : f.test(e, model, ctx).ok ? OK : FAIL) === OK);
  };
  let keep;
  if (!pool) {
    // No entity facet: take the smallest candidate list a prefilter can name
    // (the entities its own index holds), put it back in file order, and skip
    // the walk over every entity (eval/file-order-candidates-2026-11-18.md).
    pool = walk ? null : noEntityPool(spec, model);
    if (!pool) {
      const out = [];
      keep = keepFor(model.entities.size);
      for (const e of model.entities.values()) if (keep(e)) out.push(e);
      return { hits: out, fileOrder: true };
    }
    return { hits: pool.filter(keepFor(pool.length)), fileOrder: true };
  }
  return { hits: pool.filter(keepFor(pool.length)), fileOrder: false };
}

// The per-facet verdict cache. Specifications that apply to most of a model
// test the same facet on the same hundreds of thousands of entities: on HHS
// MEP the 68 public and starter IDS files test `attribute (any)` 2.0 million
// times on 665,224 entities, 1.3 million of them repeats (two applicability
// facets, a requirement written twice in one specification, and one more
// specification; eval/applies-cache-2026-11-18.md). A facet run over a pool
// of more than a quarter of the model keeps each entity's verdict in one byte
// by file position: 0 not yet tested, OK, ABSENT (the test failed with
// absent: true), FAIL. Keyed on the facet's content without its cardinality
// (the test does not read it), per model and check context. At most
// VERDICT_SLOTS facets are kept (3.7 MB each on the 219 MB federated model),
// the least recently used dropped first.
const OK = 1, ABSENT = 2, FAIL = 3;
const VERDICT_SLOTS = 8;
function verdictSlot(f, model, ctx, size) {
  if (ctx.noCache || size <= model.entities.size / 4) return null;
  const c = appliesCacheFor(model, ctx);
  const key = f._key || (f._key = JSON.stringify(f, (k, v) => (k.startsWith("_") || k === "regexes" || k === "cardinality" ? undefined : v)));
  let slot = c.verdicts.get(key);
  if (slot) c.verdicts.delete(key); // re-set below: the Map's order is least recently used first
  else {
    if (c.verdicts.size >= VERDICT_SLOTS) {
      const old = c.verdicts.get(c.verdicts.keys().next().value);
      c.verdicts.delete(c.verdicts.keys().next().value);
      if (old.nameKey) c.byName.get(old.nameKey).delete(old);
    }
    slot = { bytes: new Uint8Array(model.entities.size), ord: fileOrder(model), nameKey: null };
    if (f.kind === "attribute") {
      slot.nameKey = attributeNameKey(f);
      let sibs = c.byName.get(slot.nameKey);
      if (!sibs) c.byName.set(slot.nameKey, (sibs = new Set()));
      sibs.add(slot);
    }
  }
  c.verdicts.set(key, slot);
  return slot;
}
// A slot's byte holds the verdict in its low two bits; an attribute facet's
// slot also holds the entity's shape (AttributeFacet.shape) above them.
function verdict(slot, f, e, model, ctx) {
  const i = slot.ord(e);
  let v = slot.bytes[i];
  if (!v) slot.bytes[i] = v = slot.nameKey ? attributeVerdict(f, e, i, slot, model, ctx) : verdictCode(f.test(e, model, ctx));
  return v & 3;
}
const verdictCode = (r) => (r.ok ? OK : r.absent ? ABSENT : FAIL);

// An attribute facet's verdict byte (verdict | shape << 2). Facets that differ
// only in their value share the shape: it is read from the byte of any other
// kept slot with the same attribute name, and found from the entity's
// arguments only when none has it. Only an entity whose set attributes are all
// comparable scalars, and only for a facet with a value, runs the full test.
// On HHS MEP the OpenAEC fixture's `attribute (any)` facets with three values
// and none read each entity's arguments once instead of once per facet; the
// shape costs no memory beyond the verdict slots (an array per name tipped the
// 219 MB federated run over a 1 GB heap; eval/attribute-shape-2026-11-18.md).
function attributeVerdict(f, e, i, slot, model, ctx) {
  let sh = 0;
  for (const s of appliesCacheFor(model, ctx).byName.get(slot.nameKey)) if (s !== slot && (sh = s.bytes[i] >> 2)) break;
  if (!sh) sh = f.shape(e, model);
  let v;
  if (sh === SHAPE_NO_ATTR || sh === SHAPE_UNSET) v = ABSENT;
  else if (sh === SHAPE_EMPTY) v = FAIL;
  else if (!f.value.present) v = OK;
  else if (sh === SHAPE_UNCOMPARABLE) v = FAIL;
  else v = verdictCode(f.test(e, model, ctx));
  return v | (sh << 2);
}
const attributeNameKey = (f) => f._nameKey || (f._nameKey = JSON.stringify(f.name, (k, v) => (k.startsWith("_") || k === "regexes" ? undefined : v)));
// For tests: a facet's verdict (OK, ABSENT, FAIL) through the verdict cache.
export function cachedVerdict(f, e, model, ctx) {
  const slot = verdictSlot(f, model, ctx, model.entities.size);
  return slot ? verdict(slot, f, e, model, ctx) : verdictCode(f.test(e, model, ctx));
}
// checkRequirement's pass, from a cached verdict.
function passFromVerdict(f, v) {
  if (f.kind === "entity") return v === OK;
  if (f.cardinality === "prohibited") return v !== OK;
  if (f.cardinality === "optional") return v !== FAIL;
  return v === OK;
}

// The position of each entity in the file (the entities Map's order, which is
// the order the walk above visits), built once per model and only when a
// specification needs it. STEP ids are not in file order in real exports (none
// of the four HHS/Schultz files is), so the id cannot stand in for it. Dense
// integer ids (every parser here) index a typed array, 4 bytes per id.
export function fileOrder(model) {
  if (model._fileOrder) return model._fileOrder;
  let max = 0, ints = true;
  for (const id of model.entities.keys()) {
    if (!Number.isInteger(id) || id < 0) { ints = false; break; }
    if (id > max) max = id;
  }
  let ord;
  if (ints && max <= 4 * model.entities.size + 1024) {
    const a = new Int32Array(max + 1);
    let i = 0;
    for (const id of model.entities.keys()) a[id] = i++;
    ord = (e) => a[e.id];
  } else {
    const byId = new Map();
    let i = 0;
    for (const id of model.entities.keys()) byId.set(id, i++);
    ord = (e) => byId.get(e.id);
  }
  return (model._fileOrder = ord);
}

// Every entity a facet's prefilter (below) can pass, from the index it reads;
// null where it reads none. A superset is safe (the pool is filtered by every
// prefilter and test after); leaving one out is not, and
// file-order-candidates.test.mjs compares each against the walk.
function facetCandidates(f, model) {
  const m = model;
  const fromIds = (maps) => {
    const out = new Set();
    for (const map of maps) for (const id of map.keys()) { const e = m.entities.get(id); if (e) out.add(e); }
    return out;
  };
  switch (f.kind) {
    case "attribute": {
      // Counted before it is built: an any-name attribute takes every class.
      const lists = [];
      let n = 0;
      for (const [type, list] of m.byType) if (m.schema.attrs(type).some((a) => f.name.matchString(a.name))) { lists.push(list); n += list.length; }
      if (n > m.entities.size / 2) return { size: n };
      return new Set(lists.flat());
    }
    case "property": {
      const out = new Set();
      for (const [n, holders] of psetHolders(m)) if (f.propertySet.matchString(n)) for (const e of holders) out.add(e);
      return out;
    }
    case "classification":
      return fromIds([m.classRels, m.extRefs, m.typeOf]);
    case "material":
      return fromIds([m.matRels, m.typeOf]);
    case "partOf": {
      const rels = (f.relation === VOIDS_FILLS ? ["IFCRELFILLSELEMENT", "IFCRELVOIDSELEMENT"] : f.relation ? [f.relation] : PARTOF_RELS).map((r) => m.parents[r]).filter(Boolean);
      return fromIds(rels);
    }
    default:
      return null;
  }
}

function noEntityPool(spec, model) {
  let best = null;
  for (const f of spec.applicability) {
    const c = facetCandidates(f, model);
    if (c && (!best || c.size < best.size)) best = c;
  }
  // Sorting more than half the model costs about what the walk does.
  if (!best || best.size > model.entities.size / 2) return null; // also the attribute case's unbuilt { size }
  const ord = fileOrder(model);
  return [...best].sort((a, b) => ord(a) - ord(b));
}

// IDS has no inheritance (user manual, entity facet, "Inheritance"):
// IFCWALL does not take an IfcWallStandardCase. Revit's IFC2X3 exports write
// most walls that way, so a specification naming IFCWALL can pass on 4 walls
// while 101 were never looked at (eval/corpus-crosscheck-2026-11-17.md).
// Returns, per class, the elements an entity facet leaves out only because
// it names an ancestor of their class and not the class itself: every other
// applicability facet, and the facet's predefined type, would take them.
// The verdict does not change; the report says what was not checked.
export function skippedSubclasses(spec, model, ctx) {
  const ent = spec.applicability.find((f) => f.kind === "entity");
  if (!ent || !ent.name.present) return [];
  const S = model.schema;
  const anyName = Object.assign(Object.create(EntityFacet.prototype), ent, { name: { matchString: () => true } });
  const others = spec.applicability.filter((f) => f !== ent);
  const out = [];
  for (const [type, list] of model.byType) {
    if (ent.name.matchString(type)) continue;
    let via = null;
    for (let t = S.entities[type] && S.entities[type].super; t && !via; t = S.entities[t] && S.entities[t].super) if (ent.name.matchString(t)) via = t;
    if (!via) continue;
    let count = 0;
    for (const e of list) if (!ent.test(e, model, ctx).ok && anyName.test(e, model, ctx).ok && others.every((f) => f.test(e, model, ctx).ok)) count++;
    if (count) out.push({ type, via, count });
  }
  return out.sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1));
}

export function skippedNote(skipped) {
  if (!skipped.length) return null;
  const total = skipped.reduce((n, x) => n + x.count, 0);
  const list = skipped.slice(0, 4).map((x) => `${x.count.toLocaleString("en-US")} ${x.type} (a subclass of ${x.via})`).join(", ") + (skipped.length > 4 ? `, and ${skipped.length - 4} more class(es)` : "");
  return `not checked: ${total.toLocaleString("en-US")} element(s) of subclasses the entity facet does not name: ${list}. IDS entity names do not include subclasses; add these class names to the entity facet to check them`;
}

function prefilter(f, model) {
  const m = model;
  switch (f.kind) {
    case "attribute": {
      // AttributeFacet.test fails when the type has no attribute by that name.
      const byType = new Map();
      return (e) => {
        let ok = byType.get(e.type);
        if (ok === undefined) byType.set(e.type, (ok = m.schema.attrs(e.type).some((a) => f.name.matchString(a.name))));
        return ok;
      };
    }
    case "property": {
      // PropertyFacet.test fails (absent) when no set psetsOf reads for the
      // element has a name the facet takes. Each distinct set name is tested
      // once (psetHolders), so most entities (geometry) cost one lookup, and
      // psetsOf runs only where a set of a matching name exists
      // (eval/psets-cache-2026-11-18.md).
      const ids = new Set();
      for (const [n, holders] of psetHolders(m)) if (f.propertySet.matchString(n)) for (const e of holders) ids.add(e.id);
      return (e) => ids.has(e.id);
    }
    case "classification":
      // classificationsOf: own associations, external references, the type's.
      return (e) => m.classRels.has(e.id) || m.extRefs.has(e.id) || m.typeOf.has(e.id);
    case "material":
      // materialNames: own association or the type's.
      return (e) => m.matRels.has(e.id) || m.typeOf.has(e.id);
    case "partOf": {
      // PartOfFacet.wholes takes its first step through these relationships.
      const rels = (f.relation === VOIDS_FILLS ? ["IFCRELFILLSELEMENT", "IFCRELVOIDSELEMENT"] : f.relation ? [f.relation] : PARTOF_RELS).map((r) => m.parents[r]).filter(Boolean);
      return (e) => rels.some((map) => map.has(e.id));
    }
    default:
      return null;
  }
}

function checkRequirement(f, e, model, ctx) {
  const r = f.test(e, model, ctx);
  if (f.kind === "entity") return { pass: r.ok, why: r.why };
  if (f.cardinality === "prohibited") return { pass: !r.ok, why: r.ok ? `has ${f.describe()}, which is prohibited` : null };
  if (f.cardinality === "optional") return { pass: r.ok || !!r.absent, why: r.why };
  return { pass: r.ok, why: r.why };
}

export function checkIds(idsText, ifcText, opts = {}) {
  const ids = typeof idsText === "string" ? parseIds(idsText) : idsText;
  const model = ifcText instanceof Model ? ifcText : new Model(ifcText, opts.schemas);
  model.measureUnits = opts.measureUnits || null;
  // opts.facetCache === false turns off the applicability and facet-verdict
  // caches (applies-cache.test.mjs compares the two).
  const ctx = { typeMap: opts.typeMap || null, noCache: opts.facetCache === false };
  // The IDS audit (audit.mjs): a specification with an error is reported as
  // invalid and not run (template errors excepted, below). opts.audit === false
  // turns it off.
  const audit = opts.audit === false ? [] : auditIds(ids, { schemas: opts.auditSchemas || opts.schemas, typeMap: ctx.typeMap, psets: opts.psets });
  const specs = [];
  for (const [si, spec] of ids.specs.entries()) {
    const s = { name: spec.name, description: spec.description, optionality: spec.optionality, ifcVersion: spec.ifcVersion, applicability: spec.applicability.map((f) => f.describe()), requirements: spec.requirements.map((f) => (f.kind === "entity" ? "" : f.cardinality + " ") + f.describe()), applicable: 0, passed: 0, failed: [], status: "pass", note: null };
    // The IDS test suite treats ifcVersion as metadata: the check still runs.
    if (!versionMatches(spec, model)) s.warning = `written for ${spec.ifcVersion.join(", ")}; the model is ${model.schemaRaw}`;
    const mine = audit.filter((x) => x.spec === si);
    // Property set template errors (pset-*: a non-standard Pset_ name or
    // property, a data type the template does not give) make the IDS invalid by
    // the standard, but a project's model can still carry exactly what it asks
    // (national requirement sets extend Pset_DoorCommon and the like), so the
    // specification runs and the finding is shown as a warning.
    const templateOnly = (x) => x.level === "error" && x.code.startsWith("pset-");
    // A break of ids.xsd (structure.mjs) makes validating tools refuse the
    // file, but this reader still reads what the author meant (IDS 0.9's
    // minOccurs on <specification>, ifcVersion IFC4X3), so the specification
    // runs and the finding is a warning, as for template errors.
    const xsdOnly = (x) => x.level === "error" && x.structure;
    const warns = mine.filter((x) => x.level === "warning" || templateOnly(x) || xsdOnly(x)).map((x) => (templateOnly(x) ? "not standard IFC (an IDS audit rejects this): " : xsdOnly(x) ? "not valid IDS 1.0, so validating tools refuse the file: " : "") + x.message);
    if (warns.length) s.auditWarnings = warns;
    const errors = mine.filter((x) => x.level === "error" && !templateOnly(x) && !xsdOnly(x));
    if (errors.length) {
      s.status = "invalid";
      s.invalid = errors.map((x) => x.message);
      s.note = "invalid IDS, not checked: " + s.invalid.join("; ");
      // A prohibited specification with requirements is invalid (buildingSMART's
      // ids/invalid-prohibited_specifications_invalid_if_requirements_are_specified),
      // but its intent is plain: nothing may match. Say how many elements do, so
      // the report does not read as a clean model (eval/corpus-crosscheck-2026-11-17.md).
      if (mine.some((x) => x.code === "prohibited-requirements")) {
        const n = applies(spec, model, ctx).length;
        s.matching = n;
        s.note += `; ${n.toLocaleString("en-US")} element(s) in this model match its applicability${n ? " and would fail it once the requirements are removed" : ""}`;
      }
      specs.push(s);
      continue;
    }
    const hits = applies(spec, model, ctx);
    s.applicable = hits.length;
    const skipped = skippedSubclasses(spec, model, ctx);
    if (skipped.length) { s.skippedSubclasses = skipped; s.hint = skippedNote(skipped); }
    if (spec.optionality === "prohibited") {
      if (hits.length) {
        s.status = "fail";
        s.note = `${hits.length} element(s) match a prohibited specification`;
        s.failed = hits.slice(0, Math.min(500, opts.maxFailed ?? 500)).map((e) => ({ id: e.id, type: e.type, globalId: globalId(model, e), name: nameOf(model, e), reasons: ["matches the applicability of a prohibited specification"] }));
      }
      specs.push(s);
      continue;
    }
    // opts.maxFailed keeps the first N failing elements of a spec and counts
    // the rest in s.failedCount (set only when some were dropped). CI uses it:
    // a spec with no entity facet applies to every entity, and on a 40 MB MEP
    // export (665,224 entities) one such spec held ~440 MB of reasons.
    const maxFailed = opts.maxFailed ?? Infinity;
    let failing = 0;
    // Where a requirement facet's prefilter is false the facet is absent, so
    // its verdict follows from the cardinality alone, with no arguments read.
    // An element is first judged that way, stopping at the first unmet
    // requirement; the full tests run only to write the reasons of a failing
    // element the report keeps. Specifications applying to every entity check
    // millions of geometry items this way (eval/no-entity-facet-2026-11-17.md).
    const reqPre = spec.requirements.map((f) => prefilter(f, model));
    const reqSlots = spec.requirements.map((f) => verdictSlot(f, model, ctx, hits.length));
    const meets = (e) => {
      for (let k = 0; k < spec.requirements.length; k++) {
        const f = spec.requirements[k];
        const p = reqPre[k];
        const pass = p && !p(e) ? f.cardinality === "prohibited" || f.cardinality === "optional" : reqSlots[k] ? passFromVerdict(f, verdict(reqSlots[k], f, e, model, ctx)) : checkRequirement(f, e, model, ctx).pass;
        if (!pass) return false;
      }
      return true;
    };
    for (const e of hits) {
      if (meets(e)) { s.passed++; continue; }
      if (failing >= maxFailed) { failing++; continue; }
      const reasons = [];
      for (const f of spec.requirements) {
        const r = checkRequirement(f, e, model, ctx);
        if (!r.pass) reasons.push(`${f.kind === "entity" ? "" : f.cardinality + " "}${f.describe()}: ${r.why || "not met"}`);
      }
      if (reasons.length) { if (failing++ < maxFailed) s.failed.push({ id: e.id, type: e.type, globalId: globalId(model, e), name: nameOf(model, e), reasons }); }
      else s.passed++;
    }
    if (failing > s.failed.length) s.failedCount = failing;
    if (failing) s.status = "fail";
    else if (spec.optionality === "required" && hits.length === 0) {
      s.status = "fail";
      s.note = "required, but nothing in the model matches the applicability";
    }
    specs.push(s);
  }
  const counted = specs.filter((s) => s.status !== "skipped");
  return {
    title: ids.title,
    schema: model.schemaRaw,
    entityCount: model.entities.size,
    parseErrors: model.parseErrors.slice(0, 20),
    // A model fault, not an IDS verdict: it does not change pass (IDS checks
    // what the IDS asks), but every rendering says so.
    duplicateGlobalIds: duplicateGlobalIds(model),
    pass: counted.every((s) => s.status === "pass"),
    valid: !specs.some((s) => s.status === "invalid"),
    audit,
    specs,
  };
}

// IfcRoot's uniqueness rule UR1 (every schema: IFC2X3, IFC4, IFC4X3) says no
// two rooted objects share a GlobalId. Real exports break it (the HHS Office
// construction and MEP files, eval/duplicate-globalids-2026-11-17.md), and the
// tools downstream key on it: a BCF topic selects components by IfcGuid, a
// GitLab report and most model-diff tools match revisions by it, so a
// duplicate makes those point at the wrong element or at two. Returns every
// GlobalId held by more than one IfcRoot instance, each with its elements (by
// #id), sorted by GlobalId; cached on the model, since CI checks one parsed
// model against several IDS files.
export function duplicateGlobalIds(model) {
  if (model._dupGids) return model._dupGids;
  const seen = new Map();
  const dups = new Map();
  for (const [type, list] of model.byType) {
    if (!model.schema.isA(type, "IFCROOT")) continue;
    const i = model.schema.attrs(type).index.get("GlobalId");
    if (i === undefined) continue;
    for (const e of list) {
      const g = e.args[i];
      if (typeof g !== "string" || g === "") continue;
      const first = seen.get(g);
      if (first === undefined) { seen.set(g, e); continue; }
      let l = dups.get(g);
      if (!l) dups.set(g, (l = [first]));
      l.push(e);
    }
  }
  const out = [...dups].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([g, es]) => ({
    globalId: g,
    elements: es.sort((a, b) => a.id - b.id).map((e) => ({ id: e.id, type: e.type, name: nameOf(model, e) })),
  }));
  model._dupGids = out;
  return out;
}

// Every GlobalId of an IfcRoot instance in the model, to the first element
// holding it ({ id, type, name }). ci.mjs crossModelGlobalIds compares these
// between the models of one run (a federated coordination set), where a
// discipline file holding another file's GlobalId is the fault UR1 cannot see.
// Cached on the parsed model; kept small so a run can hold one per model after
// the model itself is dropped.
export function globalIdIndex(model) {
  if (model._gidIndex) return model._gidIndex;
  const out = new Map();
  for (const [type, list] of model.byType) {
    if (!model.schema.isA(type, "IFCROOT")) continue;
    const i = model.schema.attrs(type).index.get("GlobalId");
    if (i === undefined) continue;
    for (const e of list) {
      const g = e.args[i];
      if (typeof g !== "string" || g === "" || out.has(g)) continue;
      const entry = { id: e.id, type: e.type, name: nameOf(model, e), kind: kindOf(type) };
      if (model.schema.isA(type, "IFCRELATIONSHIP")) entry.refs = rootRefs(e);
      out.set(g, entry);
    }
  }
  model._gidIndex = out;
  return out;
  // The GlobalIds of the IfcRoot objects a relationship names (RelatedObjects,
  // RelatingType, ...), so a relationship shared between federated models can
  // be told apart as one that only follows shared elements (ci.mjs
  // crossModelGlobalIds groups it under them).
  function rootRefs(e) {
    const refs = [];
    const walk = (v) => {
      if (Array.isArray(v)) { for (const x of v) walk(x); return; }
      const t = model.get(v);
      if (!t || !model.schema.isA(t.type, "IFCROOT")) return;
      const gi = model.schema.attrs(t.type).index.get("GlobalId");
      const g = gi === undefined ? null : t.args[gi];
      if (typeof g === "string" && g) refs.push(g);
    };
    for (const a of e.args.slice(4)) walk(a);
    return refs;
  }
  function kindOf(type) {
    const S = model.schema;
    // The shared frame a federated set is built on: project, site, building,
    // storeys, spaces, facilities (IFC2X3 IfcSpatialStructureElement, IFC4
    // IfcSpatialElement) and grids. Discipline files exported from one
    // template or a copy-monitored link often hold these on purpose.
    if (type === "IFCPROJECT" || S.isA(type, "IFCCONTEXT") || S.isA(type, "IFCSPATIALELEMENT") || S.isA(type, "IFCSPATIALSTRUCTUREELEMENT") || S.isA(type, "IFCGRID")) return "frame";
    if (S.isA(type, "IFCELEMENT")) return "element";
    return "other";
  }
}

function globalId(model, e) {
  const g = model.attr(e, "GlobalId");
  return typeof g === "string" ? g : null;
}
function nameOf(model, e) {
  const n = model.attr(e, "Name");
  return typeof n === "string" ? n : null;
}
