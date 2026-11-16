// IDS 1.0 checker: does an IFC model meet an Information Delivery Specification?
//
// checkIds(idsText, ifcText, { schemas, typeMap, measureUnits }) -> report
//
// Runs in Node and in the browser (no imports beyond the two readers). The
// schema facts (entities, attributes, defined types) come from schema/*.json,
// built from buildingSMART's EXPRESS files by schema/gen-schema.mjs; the caller
// passes them in (see node.mjs for Node, index.html for the page).
//
// Semantics follow the IDS 1.0 user manual and implementer docs, and are
// scored against buildingSMART's own IFC/IDS test pairs (eval/run-testcases.mjs).

import { parseStep } from "./step.mjs";
import { parseXml, kids, kid } from "./xml.mjs";

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
    const key = type + ">" + ancestor;
    let r = this._sub.get(key);
    if (r !== undefined) return r;
    r = false;
    for (let t = type; t; t = this.entities[t] && this.entities[t].super) if (t === ancestor) { r = true; break; }
    this._sub.set(key, r);
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
    const p = parseStep(text);
    this.parseErrors = p.errors;
    this.entities = p.entities;
    const raw = (p.schema || "").toUpperCase();
    this.schemaId = raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : raw;
    this.schemaRaw = raw;
    const sj = schemas[this.schemaId];
    if (!sj) throw new Error(`IFC schema ${raw || "(none)"} is not supported (IFC2X3, IFC4, IFC4X3)`);
    this.schema = sj instanceof Schema ? sj : new Schema(sj);
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
export function xsdRegex(p) {
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

export class IdsValue {
  constructor(node) {
    this.simple = undefined;
    this.r = null;
    if (!node) return;
    const sv = kid(node, "simpleValue");
    if (sv) { this.simple = sv.text.trim() === sv.text ? sv.text : sv.text; return; }
    const r = kid(node, "restriction");
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
      if (typeof sv !== "string" || isNum) return false;
      if (!r.regexes.some((re) => re && re.test(sv))) return false;
    }
    const bounds = [r.minInclusive, r.maxInclusive, r.minExclusive, r.maxExclusive];
    if (bounds.some((b) => b !== undefined)) {
      if (typeof v !== "number") return false;
      if (r.minInclusive !== undefined && !(v >= Number(r.minInclusive))) return false;
      if (r.maxInclusive !== undefined && !(v <= Number(r.maxInclusive))) return false;
      if (r.minExclusive !== undefined && !(v > Number(r.minExclusive))) return false;
      if (r.maxExclusive !== undefined && !(v < Number(r.maxExclusive))) return false;
    }
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
      const ty = model.typeOf.get(e.id);
      for (const [idsName, [occ, tyName]] of Object.entries(typeMap)) {
        if (e.type === occ && ty && ty.type === tyName) out.push(idsName);
      }
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
    const attrs = S.attrs(e.type);
    const hits = attrs.map((a, i) => [a, i]).filter(([a]) => this.name.matchString(a.name));
    if (!hits.length) return { ok: false, absent: true, why: `has no attribute ${this.name}` };
    const set = hits.filter(([a, i]) => !a.derived && !isNull(e.args[i]));
    if (!set.length) return { ok: false, absent: true, why: `attribute ${this.name} is not set` };
    const present = set.filter(([, i]) => !isEmpty(e.args[i]));
    if (present.length < set.length) return { ok: false, why: `attribute ${this.name} is empty or unknown` };
    if (!this.value.present) return { ok: true };
    for (const [a, i] of present) {
      const v = e.args[i];
      const prim = S.prim(a.type);
      if (a.aggregate || Array.isArray(v)) return { ok: false, why: `${a.name} is a list; IDS cannot compare its value` };
      if (v && (v.ref !== undefined || v.typed)) return { ok: false, why: `${a.name} refers to an object or a select; IDS cannot compare its value` };
      if (prim === "entity" || prim === "select" || prim === "aggregate" || prim === "binary") return { ok: false, why: `${a.name} cannot be compared by value` };
      if (!this.value.match(v, prim)) return { ok: false, why: `${a.name} is ${fmt(v)}, not ${this.value}` };
    }
    return { ok: true };
  }
  describe() { return `attribute ${this.name}${this.value.present ? " = " + this.value : ""}`; }
}

const fmt = (v) => (v && v.enum ? "." + v.enum + "." : JSON.stringify(v));

const QUANTITY_MEASURE = {
  IFCQUANTITYLENGTH: ["LengthValue", "IFCLENGTHMEASURE"],
  IFCQUANTITYAREA: ["AreaValue", "IFCAREAMEASURE"],
  IFCQUANTITYVOLUME: ["VolumeValue", "IFCVOLUMEMEASURE"],
  IFCQUANTITYCOUNT: ["CountValue", "IFCCOUNTMEASURE"],
  IFCQUANTITYWEIGHT: ["WeightValue", "IFCMASSMEASURE"],
  IFCQUANTITYTIME: ["TimeValue", "IFCTIMEMEASURE"],
  IFCQUANTITYNUMBER: ["NumberValue", "IFCNUMERICMEASURE"],
};

// Property sets of an element by name: {name -> {props: Map(name -> propEntity), entity}}
// Type psets are inherited and an occurrence's pset of the same name overrides
// per property.
function psetsOf(model, e) {
  const out = new Map();
  const add = (pset) => {
    const name = model.attr(pset, "Name");
    if (typeof name !== "string") return;
    let slot = out.get(name);
    if (!slot) out.set(name, (slot = { props: new Map(), entities: [] }));
    slot.entities.push(pset);
    if (pset.type === "IFCPROPERTYSET" || pset.type === "IFCELEMENTQUANTITY" || pset.type === "IFCMATERIALPROPERTIES" || pset.type === "IFCEXTENDEDMATERIALPROPERTIES" || pset.type === "IFCPROFILEPROPERTIES") {
      const listName = pset.type === "IFCELEMENTQUANTITY" ? "Quantities" : pset.type === "IFCEXTENDEDMATERIALPROPERTIES" ? "ExtendedProperties" : pset.type === "IFCPROPERTYSET" ? "HasProperties" : "Properties";
      for (const p of model.refs(pset, listName)) {
        const pn = model.attr(p, "Name");
        if (typeof pn === "string") slot.props.set(pn, p);
      }
    } else if (model.isA(pset, "IFCPREDEFINEDPROPERTYSET")) {
      const attrs = model.schema.attrs(pset.type);
      for (let i = 4; i < attrs.length; i++) slot.props.set(attrs[i].name, { predefined: true, owner: pset, attr: attrs[i], value: pset.args[i] });
    }
  };
  const ty = model.typeOf.get(e.id);
  if (ty) for (const p of model.refs(ty, "HasPropertySets")) add(p);
  if (model.isA(e, "IFCTYPEOBJECT")) for (const p of model.refs(e, "HasPropertySets")) add(p);
  for (const p of model.psetRels.get(e.id) || []) add(p);
  if (e.type === "IFCMATERIAL" || model.isA(e, "IFCMATERIALDEFINITION")) for (const p of model.materialProps.get(e.id) || []) add(p);
  return out;
}

export class PropertyFacet {
  constructor(node) {
    this.kind = "property";
    this.propertySet = new IdsValue(kid(node, "propertySet"));
    this.baseName = new IdsValue(kid(node, "baseName"));
    this.value = new IdsValue(kid(node, "value"));
    this.dataType = (node.attrs.dataType || "").toUpperCase() || null;
  }
  // The values one property holds, each {v, type} with v converted to SI units.
  values(model, p) {
    const S = model.schema;
    const out = [];
    const unitOf = (p, type) => {
      const u = model.get(model.attr(p, "Unit"));
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
      case "IFCPROPERTYSINGLEVALUE": push(model.attr(p, "NominalValue"), p); break;
      case "IFCPROPERTYENUMERATEDVALUE": for (const x of model.attr(p, "EnumerationValues") || []) push(x, p); break;
      case "IFCPROPERTYLISTVALUE": for (const x of model.attr(p, "ListValues") || []) push(x, p); break;
      case "IFCPROPERTYBOUNDEDVALUE": {
        const lo = model.attr(p, "LowerBoundValue");
        const hi = model.attr(p, "UpperBoundValue");
        const sp = model.attr(p, "SetPointValue");
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
        for (const x of model.attr(p, "DefiningValues") || []) push(x, p);
        for (const x of model.attr(p, "DefinedValues") || []) push(x, p);
        break;
      default:
        if (own(QUANTITY_MEASURE, p.type)) {
          const [an, mt] = own(QUANTITY_MEASURE, p.type);
          const v = model.attr(p, an);
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
function classificationsOf(model, e) {
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
function materialNames(model, e) {
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

export class PartOfFacet {
  constructor(node) {
    this.kind = "partOf";
    this.relation = (node.attrs.relation || "").toUpperCase() || null;
    const en = kid(node, "entity");
    this.entity = en ? new EntityFacet(en) : null;
  }
  wholes(model, e) {
    const seen = new Set();
    const out = [];
    const rels = this.relation ? [this.relation] : PARTOF_RELS;
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
    const ws = this.wholes(model, e);
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
    out.push(f);
  }
  return out;
}

// -------------------------------------------------------------------- IDS ----

export function parseIds(text) {
  const root = parseXml(text);
  if (root.local !== "ids") throw new Error(`not an IDS file: root element is <${root.name}>`);
  const info = kid(root, "info");
  const title = info && kid(info, "title") ? kid(info, "title").text.trim() : null;
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
  return { title, specs };
}

function versionMatches(spec, model) {
  if (!spec.ifcVersion.length) return true;
  return spec.ifcVersion.some((v) => v === model.schemaRaw || v === model.schemaId || (model.schemaId === "IFC4X3" && v.startsWith("IFC4X3")));
}

function applies(spec, model, ctx) {
  let pool = null;
  for (const f of spec.applicability) {
    if (f.kind === "entity") {
      const c = f.candidates(model, ctx);
      if (c) { pool = c; break; }
    }
  }
  if (!pool) pool = [...model.entities.values()];
  return pool.filter((e) => spec.applicability.every((f) => f.test(e, model, ctx).ok));
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
  const ctx = { typeMap: opts.typeMap || null };
  const specs = [];
  for (const spec of ids.specs) {
    const s = { name: spec.name, description: spec.description, optionality: spec.optionality, ifcVersion: spec.ifcVersion, applicability: spec.applicability.map((f) => f.describe()), requirements: spec.requirements.map((f) => (f.kind === "entity" ? "" : f.cardinality + " ") + f.describe()), applicable: 0, passed: 0, failed: [], status: "pass", note: null };
    // The IDS test suite treats ifcVersion as metadata: the check still runs.
    if (!versionMatches(spec, model)) s.warning = `written for ${spec.ifcVersion.join(", ")}; the model is ${model.schemaRaw}`;
    const hits = applies(spec, model, ctx);
    s.applicable = hits.length;
    if (spec.optionality === "prohibited") {
      if (hits.length) {
        s.status = "fail";
        s.note = `${hits.length} element(s) match a prohibited specification`;
        s.failed = hits.slice(0, 500).map((e) => ({ id: e.id, type: e.type, globalId: globalId(model, e), name: nameOf(model, e), reasons: ["matches the applicability of a prohibited specification"] }));
      }
      specs.push(s);
      continue;
    }
    for (const e of hits) {
      const reasons = [];
      for (const f of spec.requirements) {
        const r = checkRequirement(f, e, model, ctx);
        if (!r.pass) reasons.push(`${f.kind === "entity" ? "" : f.cardinality + " "}${f.describe()}: ${r.why || "not met"}`);
      }
      if (reasons.length) s.failed.push({ id: e.id, type: e.type, globalId: globalId(model, e), name: nameOf(model, e), reasons });
      else s.passed++;
    }
    if (s.failed.length) s.status = "fail";
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
    pass: counted.every((s) => s.status === "pass"),
    specs,
  };
}

function globalId(model, e) {
  const g = model.attr(e, "GlobalId");
  return typeof g === "string" ? g : null;
}
function nameOf(model, e) {
  const n = model.attr(e, "Name");
  return typeof n === "string" ? n : null;
}
