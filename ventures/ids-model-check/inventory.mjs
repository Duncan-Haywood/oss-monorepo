// What a model already carries, for the IDS editor: every object class in it
// with how many of each, the property and quantity sets those objects carry
// (standard or a project's own), each set's properties with the data type the
// model writes them in, and the classification systems and materials in use.
//
// modelInventory(model) -> {
//   schema, schemaRaw, format, entityCount,
//   classes: [{ cls, count, predefinedTypes: [[PT, n]], withMaterial,
//               systems: [[name, n]],
//               sets: [{ name, count, props: [{ name, count, dataType, dataTypes }] }] }],
//   systems: [[name, n]]   (every classification system, by elements using it)
// }
// Counts are of elements of that exact class; a set or property counts an
// element once, whether it comes from the element or its type (the same
// inheritance the checker uses, ids.mjs psetsOf). Plain JSON, so a worker can
// post it to the page. The model is read by the checker's own reader, so the
// editor offers exactly the names a check will find.

import { psetsOf, classificationsOf, materialNames, QUANTITY_MEASURE } from "./ids.mjs";

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

export function modelInventory(model) {
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
          if (!pr) s.props.set(pn, (pr = { count: 0, types: new Map() }));
          pr.count++;
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
        return { name: pn, count: pr.count, dataType: types[0] || null, dataTypes: types };
      }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  })).sort((a, b) => b.count - a.count || a.cls.localeCompare(b.cls));
  return { schema: model.schemaId, schemaRaw: model.schemaRaw, format: model.format, entityCount: model.entities.size, classes, systems: ranked(allSystems) };
}
