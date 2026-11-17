// What a model already carries, for the IDS editor: every object class in it
// with how many of each, the property and quantity sets those objects carry
// (standard or a project's own), each set's properties with the data type the
// model writes them in, and the classification systems and materials in use.
//
// modelInventory(model, measureUnits) -> {
//   schema, schemaRaw, format, entityCount,
//   classes: [{ cls, count, predefinedTypes: [[PT, n]], withMaterial,
//               systems: [[name, n]],
//               sets: [{ name, count, props: [{ name, count, dataType, dataTypes,
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
// further ones); `min`/`max` are the numeric range, exact (not rounded).

import { psetsOf, classificationsOf, materialNames, QUANTITY_MEASURE, PropertyFacet } from "./ids.mjs";

export const MAX_LISTED = 50;
export const MAX_TRACKED = 500;
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
    const c = { cls: type, count: list.length, pts: new Map(), sets: new Map(), systems: new Map(), withMaterial: 0 };
    for (const e of list) {
      const pt = model.attr(e, "PredefinedType");
      if (pt && pt.enum) bump(c.pts, pt.enum);
      for (const [name, slot] of psetsOf(model, e)) {
        let s = c.sets.get(name);
        if (!s) c.sets.set(name, (s = { count: 0, props: new Map() }));
        s.count++;
        for (const [pn, p] of slot.props) {
          let pr = s.props.get(pn);
          if (!pr) s.props.set(pn, (pr = { count: 0, types: new Map(), values: new Map(), more: false, min: null, max: null }));
          pr.count++;
          for (const [text, num] of valuesOf(model, p)) {
            if (pr.values.has(text) || pr.values.size < MAX_TRACKED) bump(pr.values, text);
            else pr.more = true;
            if (num !== null) { if (pr.min === null || num < pr.min) pr.min = num; if (pr.max === null || num > pr.max) pr.max = num; }
          }
          const dt = propertyDataType(model, p);
          if (dt) bump(pr.types, dt);
        }
      }
      const seen = new Set();
      for (const r of classificationsOf(model, e)) if (typeof r.system === "string" && r.system && !seen.has(r.system)) { seen.add(r.system); bump(c.systems, r.system); bump(allSystems, r.system); }
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
    sets: [...c.sets.entries()].map(([name, s]) => ({
      name,
      count: s.count,
      props: [...s.props.entries()].map(([pn, pr]) => {
        const types = ranked(pr.types).map(([t]) => t);
        return { name: pn, count: pr.count, dataType: types[0] || null, dataTypes: types, values: ranked(pr.values).slice(0, MAX_LISTED), distinct: pr.values.size, more: pr.more, min: pr.min, max: pr.max };
      }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  })).sort((a, b) => b.count - a.count || a.cls.localeCompare(b.cls));
  return { schema: model.schemaId, schemaRaw: model.schemaRaw, format: model.format, entityCount: model.entities.size, classes, systems: ranked(allSystems) };
}
