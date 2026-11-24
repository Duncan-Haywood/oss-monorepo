// What a model already carries, for the IDS editor: every object class in it
// with how many of each, the property and quantity sets those objects carry
// (standard or a project's own), each set's properties with the data type the
// model writes them in, and the classification systems and materials in use.
//
// modelInventory(model, measureUnits) -> {
//   schema, schemaRaw, format, entityCount,
//   classes: [{ cls, count, predefinedTypes: [[PT, n]], withMaterial,
//               systems: [[name, n]],
//               attrs: [{ name, count, empty, values, distinct, more, min, max }],
//               codes: [{ system, count, empty, values, distinct, more }],
//               sets: [{ name, count, props: [{ name, count, dataType, dataTypes, typeCounts,
//                        values, distinct, more, min, max }] }] }],
//   systems: [[name, n]]   (every classification system, by elements using it)
// }
// Counts are of elements of that exact class; a set or property counts an
// element once, whether it comes from the element or its type (the same
// inheritance the checker uses, ids.mjs psetsOf). Plain JSON, so a worker can
// post it to the page. The model is read by the checker's own reader, so the
// editor offers exactly the names a check will find.
//
// A property's values are read the way the checker reads them
// (PropertyFacet.values: list members one by one, measures in SI units), so a
// value the editor offers is one a check of that model accepts. `values` is
// [[lexical form, objects carrying it]] for the most common MAX_LISTED;
// `distinct` counts different values up to MAX_TRACKED (`more` when there were
// further ones); `min`/`max` are the numeric range, exact (not rounded);
// `tmin`/`tmax` the earliest and latest value when every value is an ISO date,
// date-time, time or duration of one form `tkind` ("mixed" otherwise).
//
// Attributes (`attrs`, those the editor offers: stored, single, comparable;
// not GlobalId, one value per object)
// are read as AttributeFacet reads them: the value as written, enumerations by
// name, no unit conversion; `count` objects have it set, `empty` of those hold
// an empty string or UNKNOWN (a check fails them whatever it asks). Codes
// (`codes`, one per classification system) are each reference's own code, as
// ClassificationFacet compares them (classificationsOf, a type's references
// inherited); `count` objects are classified in the system and `empty` of them
// carry no code, so a check that asks for a code fails them.

import { psetsOf, classificationsOf, materialNames, QUANTITY_MEASURE, PropertyFacet } from "./ids.mjs";
import { editableAttributes } from "./editor.mjs";
import { temporalKind, temporalKey } from "./temporal.mjs";

export const MAX_LISTED = 50;
export const MAX_TRACKED = 500;
// Numbers are listed at 12 significant digits, but a "one of" built from them
// must name each value exactly as the model holds it: IfcTester 0.9.0 compares
// a listed number with Python's `in`, without IDS's tolerance
// (eval/number-oneof-2026-11-17.md). So each tally also keeps the exact
// numbers (String(num), the shortest form that reads back as the same double),
// up to MAX_EXACT; past that `exact` is null.
export const MAX_EXACT = 64;
const readValues = PropertyFacet.prototype.values;

// A value as an IDS file writes it: strings as is, booleans true/false,
// numbers at 12 significant digits (unit conversion leaves 2.4000000000000004).
export function lexical(x) {
  let v = x.v;
  if (v && typeof v === "object" && typeof v.enum === "string") v = v.enum;
  if (typeof v === "boolean") return { text: String(v), num: null };
  // num stays exact: IDS ranges compare without tolerance (tolerance.md), so a
  // range built from a rounded bound would fail the object it came from.
  if (typeof v === "number" && Number.isFinite(v)) return { text: String(Number(v.toPrecision(12))), num: v };
  if (typeof v === "string") {
    if (x.prim === "boolean" || x.prim === "logical") { const u = v.toUpperCase(); if (u === "T" || u === "TRUE") return { text: "true", num: null }; if (u === "F" || u === "FALSE") return { text: "false", num: null }; return null; }
    return { text: v, num: null };
  }
  return null;
}

// The distinct lexical values one property holds on one object.
function valuesOf(model, p) {
  let r;
  try { r = readValues(model, p); } catch { return []; }
  if (!r || r.unsupported) return [];
  const out = new Map();
  for (const x of r.values || []) { const l = lexical(x); if (l && !out.has(l.text)) out.set(l.text, l.num); }
  return [...out.entries()];
}

// The IFC type a property's values are written in, as an IDS dataType names
// it (IFCLABEL, IFCLENGTHMEASURE...), or null when the model does not say.
export function propertyDataType(model, p) {
  if (p.predefined) return p.attr && !p.attr.aggregate && /^IFC/.test(p.attr.type || "") ? p.attr.type.toUpperCase() : null;
  const typed = (v) => (v && typeof v === "object" && v.typed ? v.typed : null);
  const first = (list) => (Array.isArray(list) ? list.map(typed).find(Boolean) || null : null);
  switch (p.type) {
    case "IFCPROPERTYSINGLEVALUE": return typed(model.attr(p, "NominalValue"));
    case "IFCPROPERTYENUMERATEDVALUE": return first(model.attr(p, "EnumerationValues"));
    case "IFCPROPERTYLISTVALUE": return first(model.attr(p, "ListValues"));
    case "IFCPROPERTYBOUNDEDVALUE": return typed(model.attr(p, "LowerBoundValue")) || typed(model.attr(p, "UpperBoundValue")) || typed(model.attr(p, "SetPointValue"));
    default: {
      const q = Object.hasOwn(QUANTITY_MEASURE, p.type) ? QUANTITY_MEASURE[p.type] : null;
      return q ? q[1] : null;
    }
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const tally = () => ({ count: 0, empty: 0, values: new Map(), more: false, min: null, max: null, tkind: null, tmin: null, tmax: null, exact: new Set(), exactMore: false });
// The earliest and latest of a value list's dates, date-times, times or
// durations, over every value (not only the listed ones), ordered as the
// checker orders range bounds (temporal.mjs). tkind is the one ISO form every
// value has, or "mixed" when a value has another form or none: then no range
// passes them all, and the editor offers none.
function addTemporal(t, text) {
  if (t.tkind === "mixed") return;
  const k = temporalKind(text);
  if (!k || (t.tkind && t.tkind !== k)) { t.tkind = "mixed"; t.tmin = t.tmax = null; return; }
  t.tkind = k;
  const v = temporalKey(text);
  if (t.tmin === null || v < temporalKey(t.tmin)) t.tmin = text;
  if (t.tmax === null || v > temporalKey(t.tmax)) t.tmax = text;
}
// One object's distinct [text, num] values into a tally.
function addValues(t, vals) {
  for (const [text, num] of vals) {
    if (t.values.has(text) || t.values.size < MAX_TRACKED) bump(t.values, text);
    else t.more = true;
    if (num !== null) {
      if (t.min === null || num < t.min) t.min = num;
      if (t.max === null || num > t.max) t.max = num;
      const s = String(num);
      if (!t.exact.has(s)) { if (t.exact.size < MAX_EXACT) t.exact.add(s); else t.exactMore = true; }
    }
    addTemporal(t, text);
  }
}
const exactOut = (t) => (t.exactMore ? null : [...t.exact].sort((a, b) => Number(a) - Number(b)));
const tallyOut = (t) => ({ count: t.count, empty: t.empty, values: ranked(t.values).slice(0, MAX_LISTED), distinct: t.values.size, more: t.more, min: t.min, max: t.max, exact: exactOut(t), tkind: t.tkind, tmin: t.tmin, tmax: t.tmax });

// The attributes of `cls` the editor offers, with their index and primitive.
function attrSlots(S, cls) {
  const names = new Set(editableAttributes(S, cls));
  return S.attrs(cls).map((a, i) => ({ a, i, prim: S.prim(a.type) })).filter((x) => names.has(x.a.name) && !x.a.derived && x.a.name !== "GlobalId");
}
const ranked = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

// measureUnits: the checker's measure-units.json (resources().measureUnits);
// without it measures are reported in the model's own units, as written.
export function modelInventory(model, measureUnits = null) {
  if (measureUnits && !model.measureUnits) model.measureUnits = measureUnits;
  const S = model.schema;
  const byClass = new Map();
  const allSystems = new Map();
  for (const [type, list] of model.byType) {
    if (!S.entities[type] || !S.isA(type, "IFCOBJECTDEFINITION")) continue;
    const c = { cls: type, count: list.length, pts: new Map(), sets: new Map(), systems: new Map(), withMaterial: 0, attrs: new Map(), codes: new Map() };
    const slots = attrSlots(S, type);
    for (const e of list) {
      for (const { a, i, prim } of slots) {
        const v = e.args[i];
        if (v === null || v === undefined || (v && v.derived)) continue;
        let t = c.attrs.get(a.name);
        if (!t) c.attrs.set(a.name, (t = tally()));
        t.count++;
        if (v === "" || (v && v.unknown) || Array.isArray(v) || (v && (v.ref !== undefined || v.typed))) { t.empty++; continue; }
        const l = lexical({ v, prim });
        if (l) addValues(t, [[l.text, l.num]]); else t.empty++;
      }
      const pt = model.attr(e, "PredefinedType");
      if (pt && pt.enum) bump(c.pts, pt.enum);
      for (const [name, slot] of psetsOf(model, e)) {
        let s = c.sets.get(name);
        if (!s) c.sets.set(name, (s = { count: 0, props: new Map() }));
        s.count++;
        for (const [pn, p] of slot.props) {
          let pr = s.props.get(pn);
          if (!pr) s.props.set(pn, (pr = { ...tally(), types: new Map() }));
          pr.count++;
          addValues(pr, valuesOf(model, p));
          const dt = propertyDataType(model, p);
          if (dt) bump(pr.types, dt);
        }
      }
      const seen = new Set();
      const codes = new Map();
      for (const r of classificationsOf(model, e)) {
        if (typeof r.system !== "string" || !r.system) continue;
        if (!seen.has(r.system)) { seen.add(r.system); bump(c.systems, r.system); bump(allSystems, r.system); codes.set(r.system, new Set()); }
        if (typeof r.codes[0] === "string" && r.codes[0] !== "") codes.get(r.system).add(r.codes[0]);
      }
      for (const [sys, set] of codes) {
        let t = c.codes.get(sys);
        if (!t) c.codes.set(sys, (t = tally()));
        t.count++;
        if (!set.size) t.empty++;
        addValues(t, [...set].map((x) => [x, null]));
      }
      const mats = materialNames(model, e);
      if (mats && mats.length) c.withMaterial++;
    }
    byClass.set(type, c);
  }
  const classes = [...byClass.values()].map((c) => ({
    cls: c.cls,
    count: c.count,
    predefinedTypes: ranked(c.pts),
    withMaterial: c.withMaterial,
    systems: ranked(c.systems),
    attrs: [...c.attrs.entries()].map(([name, t]) => ({ name, ...tallyOut(t) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    codes: [...c.codes.entries()].map(([system, t]) => { const { min, max, exact, tkind, tmin, tmax, ...o } = tallyOut(t); return { system, ...o }; }).sort((a, b) => b.count - a.count || a.system.localeCompare(b.system)),
    sets: [...c.sets.entries()].map(([name, s]) => ({
      name,
      count: s.count,
      props: [...s.props.entries()].map(([pn, pr]) => {
        const typeCounts = ranked(pr.types);
        const types = typeCounts.map(([t]) => t);
        return { name: pn, count: pr.count, dataType: types[0] || null, dataTypes: types, typeCounts, values: ranked(pr.values).slice(0, MAX_LISTED), distinct: pr.values.size, more: pr.more, min: pr.min, max: pr.max, exact: exactOut(pr), tkind: pr.tkind, tmin: pr.tmin, tmax: pr.tmax };
      }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  })).sort((a, b) => b.count - a.count || a.cls.localeCompare(b.cls));
  return { schema: model.schemaId, schemaRaw: model.schemaRaw, format: model.format, entityCount: model.entities.size, classes, systems: ranked(allSystems) };
}
