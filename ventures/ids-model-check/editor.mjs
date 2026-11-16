// IDS editor logic: what a specification author can pick, and the IDS 1.0 XML
// for what they picked. No DOM here, so the page and the tests share it.
//
// The choices come from the same facts the audit checks against: the IFC
// schema (schema/ifc*.json, through Schema) and buildingSMART's property set
// templates (schema/psets-*.json). An author picks a class, then a standard
// set that class can carry, then one of that set's properties, and the editor
// writes the template's dataType for it. So the IDS it writes cannot name a
// misspelt set, a property the set lacks or a dataType the standard does not
// give: the faults auditIds() finds in 21 of 64 public IDS files.

const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

// The ifcVersion token IDS 1.0 accepts for each schema id.
export const IFC_VERSION = { IFC2X3: "IFC2X3", IFC4: "IFC4", IFC4X3: "IFC4X3_ADD2" };

// Partof relations IDS 1.0 allows, with a reader's name for each.
export const PARTOF_RELATIONS = {
  IFCRELCONTAINEDINSPATIALSTRUCTURE: "contained in (storey, space, building)",
  IFCRELAGGREGATES: "part of an aggregate (assembly, building, site)",
  IFCRELNESTS: "nested in",
  IFCRELASSIGNSTOGROUP: "assigned to a group or system",
  "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT": "in an opening of (a door or window in a wall)",
};

function ancestors(S, cls) {
  const out = [];
  for (let t = cls, g = 0; t && S.entities[t] && g < 40; t = S.entities[t].super, g++) out.push(t);
  return out;
}

// Does a standard set apply to exact class `cls`? When the template names
// the class or an ancestor of it (Pset_WallCommon names IFCWALL, so it applies
// to IFCWALLSTANDARDCASE too), or, for a type object, when it names the
// occurrence the type is for (IFCWALLTYPE carries Pset_WallCommon). IFC2X3
// occurrences in the type mapping table also carry their type's sets
// (IFCFLOWTERMINAL typed as an air terminal).
function setApplies(S, cls, set, typeMap) {
  if (!set.classes.length) return false;
  const anc = ancestors(S, cls);
  if (set.classes.some((c) => anc.includes(c))) return true;
  if (cls.endsWith("TYPE")) {
    for (const t of anc) {
      if (!t.endsWith("TYPE")) continue;
      const occ = t.slice(0, -4);
      if (set.classes.includes(occ) || set.classes.includes(occ + "STANDARDCASE")) return true;
    }
  }
  const mapped = own(typeMap, cls);
  if (mapped && mapped[0] !== cls) return setApplies(S, mapped[0], set, null) || (!!mapped[1] && setApplies(S, mapped[1], set, null));
  return false;
}

// Standard sets (Pset_ and Qto_) an object of exact class `cls` can carry,
// sorted with property sets before quantity sets.
export function setsFor(psets, S, cls, typeMap = null) {
  const out = [];
  for (const [name, set] of Object.entries(psets || {})) if (setApplies(S, cls, set, typeMap)) out.push(name);
  return out.sort((a, b) => (a.startsWith("Qto_") - b.startsWith("Qto_")) || a.localeCompare(b));
}

// Every non-abstract class that can carry at least one standard set, plus
// IFC2X3 type-mapping names, sorted. These are the classes the editor offers.
export function classesWithSets(psets, S, typeMap = null) {
  const sets = Object.values(psets || {});
  const names = Object.keys(S.entities).filter((c) => !S.entities[c].abstract);
  if (typeMap) for (const k of Object.keys(typeMap)) if (!S.entities[k]) names.push(k);
  return names.filter((c) => {
    const m = S.entities[c] ? null : own(typeMap, c);
    return sets.some((set) => setApplies(S, m ? m[0] : c, set, typeMap));
  }).sort();
}

// Non-abstract classes below `cls`. IDS matches exact classes, so an
// applicability naming IFCWALL misses IFCWALLSTANDARDCASE unless both are listed.
export function subclasses(S, cls) {
  return Object.keys(S.entities).filter((c) => c !== cls && !S.entities[c].abstract && ancestors(S, c).includes(cls)).sort();
}

// The class's PredefinedType enumeration members, or [].
export function predefinedTypes(S, cls) {
  if (!S.entities[cls]) return [];
  const a = S.attrs(cls).find((x) => x.name === "PredefinedType");
  const d = a && S.types[a.type];
  return d && d.kind === "enum" ? d.values : [];
}

// The template's properties: name, the dataType to write (the template's own,
// when the schema has that type) and its enumeration members, if any.
export function propertiesOf(psets, S, setName) {
  const set = own(psets, setName);
  if (!set) return [];
  return Object.entries(set.props).map(([name, tpl]) => {
    const types = (tpl.types || (tpl.type ? [tpl.type] : [])).filter((t) => S.types[t]);
    return { name, dataType: types[0] || null, dataTypes: types, enum: tpl.enum && tpl.enum.length ? tpl.enum : null };
  });
}

// The XSD base IDS uses for a value restriction on this dataType.
export function xsBase(S, dataType) {
  const p = dataType ? S.prim(dataType) : "string";
  return p === "double" ? "xs:double" : p === "integer" ? "xs:integer" : p === "boolean" || p === "logical" ? "xs:boolean" : "xs:string";
}

const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");

// An IDS value element body for a restriction:
//   { equals: "x" } | { oneOf: ["a", "b"] } | { pattern: "..." } |
//   { min: "1", max: "9" } (either may be absent; inclusive) |
//   { r: { base, enumeration, pattern, minInclusive, maxInclusive,
//          minExclusive, maxExclusive, length, minLength, maxLength } }
//   (any restriction, as an opened IDS file had it; its own base wins);
//   { equals: "", exact: true } writes an empty simpleValue an opened file had
// Returns "" for no restriction.
const R_BOUNDS = ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive", "length", "minLength", "maxLength"];
function valueXml(v, base) {
  if (!v) return "";
  if (v.equals !== undefined && (v.equals !== "" || v.exact)) return `<simpleValue>${escText(v.equals)}</simpleValue>`;
  const parts = [];
  if (v.r) {
    for (const x of v.r.enumeration || []) parts.push(`<xs:enumeration value="${escAttr(x)}"/>`);
    for (const x of v.r.pattern || []) parts.push(`<xs:pattern value="${escAttr(x)}"/>`);
    for (const k of R_BOUNDS) if (v.r[k] !== undefined && v.r[k] !== null) parts.push(`<xs:${k} value="${escAttr(v.r[k])}"/>`);
    if (v.r.base) base = "xs:" + v.r.base;
    if (!parts.length) return `<xs:restriction base="${base}"/>`;
  } else if (v.oneOf && v.oneOf.length) for (const x of v.oneOf) parts.push(`<xs:enumeration value="${escAttr(x)}"/>`);
  else if (v.pattern) parts.push(`<xs:pattern value="${escAttr(v.pattern)}"/>`);
  else {
    if (v.min !== undefined && v.min !== "") parts.push(`<xs:minInclusive value="${escAttr(v.min)}"/>`);
    if (v.max !== undefined && v.max !== "") parts.push(`<xs:maxInclusive value="${escAttr(v.max)}"/>`);
  }
  if (!parts.length) return "";
  return `<xs:restriction base="${base}">${parts.join("")}</xs:restriction>`;
}

const nameValue = (names) => (names.length === 1 ? `<simpleValue>${escText(names[0])}</simpleValue>` : `<xs:restriction base="xs:string">${names.map((n) => `<xs:enumeration value="${escAttr(n)}"/>`).join("")}</xs:restriction>`);
// A name-like field: a string, a list of names, or a value object.
const nameXml = (x) => (typeof x === "string" ? `<simpleValue>${escText(x)}</simpleValue>` : Array.isArray(x) ? nameValue(x) : valueXml(x, "xs:string"));

function cardinalityAttr(c) {
  return c && c !== "required" ? ` cardinality="${c}"` : "";
}

// One facet. Facet shapes:
//   { kind: "entity", names: [...], predefinedType }  (or name: a value object)
//   { kind: "property", set, name, dataType, value, cardinality }
//   { kind: "attribute", name, value, cardinality }
//   { kind: "classification", system, value, cardinality }
//   { kind: "material", value, cardinality }
//   { kind: "partOf", relation, entity, cardinality }  (entity: a class name or an entity facet)
// Names (set, name, system, predefinedType) may also be value objects.
export function facetXml(f, S, inRequirements) {
  const card = inRequirements ? cardinalityAttr(f.cardinality) : "";
  if (f.kind === "entity") {
    const ptx = f.predefinedType ? nameXml(f.predefinedType) : "";
    const pt = ptx ? `<predefinedType>${ptx}</predefinedType>` : "";
    return `<entity><name>${f.name ? nameXml(f.name) : f.names ? nameValue(f.names) : ""}</name>${pt}</entity>`;
  }
  if (f.kind === "property") {
    const dt = f.dataType ? ` dataType="${escAttr(f.dataType)}"` : "";
    const v = valueXml(f.value, xsBase(S, f.dataType));
    return `<property${dt}${card}><propertySet>${f.set ? nameXml(f.set) : ""}</propertySet><baseName>${f.name ? nameXml(f.name) : ""}</baseName>${v ? `<value>${v}</value>` : ""}</property>`;
  }
  if (f.kind === "attribute") {
    const v = valueXml(f.value, "xs:string");
    return `<attribute${card}><name>${f.name ? nameXml(f.name) : ""}</name>${v ? `<value>${v}</value>` : ""}</attribute>`;
  }
  if (f.kind === "classification") {
    const v = valueXml(f.value, "xs:string");
    const sx = f.system ? nameXml(f.system) : "";
    const sys = sx ? `<system>${sx}</system>` : "";
    return `<classification${card}>${v ? `<value>${v}</value>` : ""}${sys}</classification>`;
  }
  if (f.kind === "material") {
    const v = valueXml(f.value, "xs:string");
    return v ? `<material${card}><value>${v}</value></material>` : `<material${card}/>`;
  }
  if (f.kind === "partOf") {
    const rel = f.relation ? ` relation="${escAttr(f.relation)}"` : "";
    const en = !f.entity ? "" : typeof f.entity === "string" ? `<entity><name><simpleValue>${escText(f.entity)}</simpleValue></name></entity>` : facetXml(f.entity, S, false);
    return en ? `<partOf${rel}${card}>${en}</partOf>` : `<partOf${rel}${card}/>`;
  }
  throw new Error(`unknown facet kind ${f.kind}`);
}

// IDS 1.0 (ids.xsd) fixes the facet order inside applicability and requirements.
const FACET_ORDER = ["entity", "partOf", "classification", "attribute", "property", "material"];
const ordered = (facets) => [...facets].sort((a, b) => FACET_ORDER.indexOf(a.kind) - FACET_ORDER.indexOf(b.kind));

// The IDS document for an editor state:
//   { title, description, schema: "IFC4", specs: [{ name, description,
//     instructions, optionality, applicability: [facet], requirements: [facet] }] }
// `S` is the Schema the specifications are written for.
export function buildIds(doc, S) {
  const ver = own(IFC_VERSION, doc.schema) || doc.schema;
  const ind = (n) => "  ".repeat(n);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">`,
    `${ind(1)}<info>`,
    `${ind(2)}<title>${escText(doc.title || "Untitled IDS")}</title>`,
  ];
  // The other info fields, in ids.xsd's order (an opened file's are kept).
  const info = { ...(doc.info || {}), description: doc.description, date: doc.date || (doc.info && doc.info.date) };
  for (const k of ["copyright", "version", "description", "author", "date", "purpose", "milestone"]) if (info[k]) lines.push(`${ind(2)}<${k}>${escText(info[k])}</${k}>`);
  lines.push(`${ind(1)}</info>`, `${ind(1)}<specifications>`);
  for (const s of doc.specs || []) {
    const sver = Array.isArray(s.ifcVersion) && s.ifcVersion.length ? s.ifcVersion.join(" ") : ver;
    let attrs = ` name="${escAttr(s.name || "Unnamed specification")}" ifcVersion="${escAttr(sver)}"`;
    if (s.description) attrs += ` description="${escAttr(s.description)}"`;
    if (s.instructions) attrs += ` instructions="${escAttr(s.instructions)}"`;
    lines.push(`${ind(2)}<specification${attrs}>`);
    const occ = s.optionality === "optional" ? ` minOccurs="0" maxOccurs="unbounded"` : s.optionality === "prohibited" ? ` minOccurs="0" maxOccurs="0"` : ` minOccurs="1" maxOccurs="unbounded"`;
    lines.push(`${ind(3)}<applicability${occ}>`);
    for (const f of ordered(s.applicability || [])) lines.push(ind(4) + facetXml(f, S, false));
    lines.push(`${ind(3)}</applicability>`);
    // A prohibited specification has no requirements (the audit's rule).
    const req = s.optionality === "prohibited" ? [] : s.requirements || [];
    if (req.length) {
      lines.push(`${ind(3)}<requirements${s.requirementsDescription ? ` description="${escAttr(s.requirementsDescription)}"` : ""}>`);
      for (const f of ordered(req)) lines.push(ind(4) + facetXml(f, S, true));
      lines.push(`${ind(3)}</requirements>`);
    }
    lines.push(`${ind(2)}</specification>`);
  }
  lines.push(`${ind(1)}</specifications>`, `</ids>`, "");
  return lines.join("\n");
}

// The applicability entity facet for a class, with its concrete subclasses
// when asked (IDS matches exact classes).
export function entityFacet(S, cls, { withSubclasses = false, predefinedType = null } = {}) {
  const names = withSubclasses ? [cls, ...subclasses(S, cls)] : [cls];
  return { kind: "entity", names, predefinedType: predefinedType || null };
}

// ------------------------------------------------------------ the page state --
// The page edits a plainer state than an IDS: one class per specification and
// requirement rows with a value "mode". stateToDoc() turns it into the shape
// buildIds() writes; importIds() turns an opened IDS file into it.

export const blankReq = () => ({ kind: "property", set: "", name: "", cardinality: "required", mode: "any", equals: "", oneOf: [], min: "", max: "", pattern: "", system: "", relation: "IFCRELCONTAINEDINSPATIALSTRUCTURE", entity: "IFCBUILDINGSTOREY" });
export const blankSpec = () => ({ name: "", description: "", instructions: "", optionality: "required", cls: "", withSub: true, predefinedType: "", reqs: [blankReq()] });

// Attributes the page offers for a class: stored, single, comparable by value.
export function editableAttributes(S, cls) {
  if (!S.entities[cls]) return ["Name", "Description", "ObjectType", "Tag"];
  return S.attrs(cls).filter((a) => !a.derived && !a.aggregate && ["string", "double", "integer", "boolean", "logical", "enum"].includes(S.prim(a.type))).map((a) => a.name);
}

// What value modes the page offers for a requirement row, and the
// enumeration it offers them from (null when free text).
//   L = { S, psets, tm }
export function valueChoices(L, cls, r) {
  let kind = "text", enumVals = null, p = null;
  if (r.kind === "property") {
    p = r.set ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null;
    if (!p || !p.dataType) kind = null;
    else {
      const prim = L.S.prim(p.dataType);
      kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
      enumVals = p.enum;
    }
  } else if (r.kind === "attribute") {
    const a = L.S.entities[cls] && L.S.attrs(cls).find((x) => x.name === r.name);
    if (a && L.S.types[a.type] && L.S.types[a.type].kind === "enum") enumVals = L.S.types[a.type].values;
  } else if (r.kind === "partOf") kind = null;
  const modes = [];
  if (kind) {
    modes.push("any", "equals");
    if (enumVals) modes.push("oneOf");
    if (kind === "number") modes.push("range");
    if (kind === "text" && !enumVals) modes.push("pattern");
    if (kind === "bool") modes.splice(1, 1, "true", "false");
  }
  return { kind, enumVals, modes, prop: p };
}

function reqFacet(L, r) {
  if (r.fixed) return r.fixed;
  const p = r.kind === "property" ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null;
  const value = r.cardinality === "prohibited" || (p && !p.dataType) ? null
    : r.mode === "equals" ? { equals: r.equals } : r.mode === "true" || r.mode === "false" ? { equals: r.mode }
    : r.mode === "oneOf" ? { oneOf: r.oneOf } : r.mode === "range" ? { min: r.min, max: r.max } : r.mode === "pattern" ? { pattern: r.pattern } : null;
  return { kind: r.kind, set: r.set, name: r.name, dataType: p ? p.dataType : null, value, cardinality: r.cardinality, system: r.system, relation: r.relation, entity: r.entity };
}

const reqComplete = (r) => r.fixed || (r.kind === "property" ? r.set && r.name : r.kind === "attribute" ? r.name : r.kind === "partOf" ? r.entity : true);

// The page state as the document buildIds() writes.
export function stateToDoc(state, L) {
  return {
    title: state.title, description: state.description, schema: state.schema, info: state.info,
    specs: state.specs.map((s) => ({
      name: s.name || (s.cls ? `${s.cls} requirements` : "Unnamed specification"),
      description: s.description, instructions: s.instructions, optionality: s.optionality,
      ifcVersion: s.ifcVersion || null, requirementsDescription: s.requirementsDescription || null,
      applicability: [...(s.cls ? [entityFacet(L.S, s.cls, { withSubclasses: s.withSub && !!L.S.entities[s.cls], predefinedType: s.predefinedType })] : []), ...(s.fixedApp || [])],
      requirements: s.reqs.filter(reqComplete).map((r) => reqFacet(L, r)),
    })),
  };
}

// A parsed IdsValue as a value object valueXml() writes back unchanged.
function valueOf(v) {
  if (!v || !v.present) return null;
  if (v.simple !== undefined) return { equals: v.simple, exact: true };
  const { regexes, ...r } = v.r;
  return { r };
}
const simpleOf = (v) => (v && v.simple !== undefined ? v.simple : null);
const onlyEnum = (v) => (v && v.r && v.r.enumeration.length && !v.r.pattern.length && R_BOUNDS.every((k) => v.r[k] === undefined) ? v.r.enumeration : null);

// A parsed facet (ids.mjs) in the shape facetXml() writes, keeping everything.
export function facetFromParsed(f) {
  const out = { kind: f.kind, cardinality: f.cardinality };
  if (f.kind === "entity") return { kind: "entity", name: valueOf(f.name), predefinedType: valueOf(f.predefinedType) };
  if (f.kind === "property") Object.assign(out, { set: valueOf(f.propertySet), name: valueOf(f.baseName), dataType: f.dataType, value: valueOf(f.value) });
  if (f.kind === "attribute") Object.assign(out, { name: valueOf(f.name), value: valueOf(f.value) });
  if (f.kind === "classification") Object.assign(out, { system: valueOf(f.system), value: valueOf(f.value) });
  if (f.kind === "material") out.value = valueOf(f.value);
  if (f.kind === "partOf") Object.assign(out, { relation: f.relation, entity: f.entity ? facetFromParsed(f.entity) : null });
  return out;
}

// A page row for a parsed requirement, when the page can show and edit it
// without changing what it asks; null otherwise.
function editableRow(L, cls, f) {
  const r = { ...blankReq(), kind: f.kind, cardinality: f.cardinality, oneOf: [] };
  if (f.kind === "property") {
    r.set = simpleOf(f.propertySet); r.name = simpleOf(f.baseName);
    if (!r.set || !r.name) return null;
    if (!setsFor(L.psets, L.S, cls, L.tm).includes(r.set)) return null;
  } else if (f.kind === "attribute") {
    r.name = simpleOf(f.name);
    if (!r.name || !editableAttributes(L.S, cls).includes(r.name)) return null;
  } else if (f.kind === "classification") {
    r.system = f.system.present ? simpleOf(f.system) : "";
    if (r.system === null) return null;
  } else if (f.kind === "partOf") {
    if (!f.relation || !Object.hasOwn(PARTOF_RELATIONS, f.relation) || !f.entity || f.entity.predefinedType.present) return null;
    r.relation = f.relation; r.entity = simpleOf(f.entity.name);
    if (!r.entity) return null;
    return r;
  }
  const ch = valueChoices(L, cls, r);
  const v = f.value;
  if (!v || !v.present) return r;
  if (r.cardinality === "prohibited" || !ch.kind) return null;
  const s = simpleOf(v), en = onlyEnum(v);
  if (s !== null) {
    if (ch.modes.includes("true") && (s === "true" || s === "false")) r.mode = s;
    else if (ch.modes.includes("equals") && (!ch.enumVals || ch.enumVals.includes(s))) { r.mode = "equals"; r.equals = s; }
    else return null;
  } else if (en) {
    if (!ch.modes.includes("oneOf") || !en.every((x) => ch.enumVals.includes(x))) return null;
    r.mode = "oneOf"; r.oneOf = [...en];
  } else if (v.r.pattern.length === 1 && !v.r.enumeration.length && R_BOUNDS.every((k) => v.r[k] === undefined)) {
    if (!ch.modes.includes("pattern")) return null;
    r.mode = "pattern"; r.pattern = v.r.pattern[0];
  } else if (!v.r.enumeration.length && !v.r.pattern.length && ["minExclusive", "maxExclusive", "length", "minLength", "maxLength"].every((k) => v.r[k] === undefined)) {
    if (!ch.modes.includes("range")) return null;
    r.mode = "range"; r.min = v.r.minInclusive ?? ""; r.max = v.r.maxInclusive ?? "";
  } else return null;
  return r;
}

// The schema an opened IDS is mostly written for: the one most specifications
// name first (IFC4 on a tie or when none is named).
export function idsSchema(parsed) {
  const vid = (v) => (v.startsWith("IFC4X3") ? "IFC4X3" : v === "IFC4" ? "IFC4" : v === "IFC2X3" ? "IFC2X3" : null);
  const tally = {};
  for (const s of parsed.specs) { const id = s.ifcVersion.map(vid).find(Boolean); if (id) tally[id] = (tally[id] || 0) + 1; }
  return Object.entries(tally).sort((a, b) => b[1] - a[1] || (a[0] === "IFC4" ? -1 : b[0] === "IFC4" ? 1 : 0))[0]?.[0] || "IFC4";
}

// An opened IDS file as page state. `parsed` is parseIds(text); `loadFor(id)`
// returns { S, psets, tm } for "IFC2X3" | "IFC4" | "IFC4X3".
// Returns { state, kept, rows, dropped }: `kept` counts the facets the page
// holds as written (shown, removable, not editable), `rows` the ones it can
// edit and `dropped` the requirements of prohibited specifications (named in
// `droppedIn`), which IDS 1.0 cannot evaluate (the audit's prohibited-requirements).
// The state is built so that, written back, the IDS asks for what it asked
// before; a facet the page's controls would change is kept as written.
export function importIds(parsed, loadFor) {
  const schema = idsSchema(parsed);
  const L = loadFor(schema);
  const info = { ...(parsed.info || {}) };
  delete info.title; delete info.description;
  const state = { title: parsed.title || "", description: (parsed.info && parsed.info.description) || "", schema, info, specs: [] };
  let kept = 0, rows = 0, dropped = 0;
  const droppedIn = [];
  for (const s of parsed.specs) {
    const spec = { ...blankSpec(), name: s.name === "(unnamed)" ? "" : s.name, description: s.description || "", instructions: s.instructions || "", optionality: s.optionality, reqs: [], fixedApp: [] };
    if (s.requirementsDescription) spec.requirementsDescription = s.requirementsDescription;
    if (s.ifcVersion.join(" ") !== IFC_VERSION[schema]) spec.ifcVersion = s.ifcVersion;
    for (const f of s.applicability) {
      if (f.kind === "entity" && !spec.cls && !spec.fixedApp.some((x) => x.kind === "entity")) {
        // A class list matches as a set: one name, or a class and all its
        // concrete subclasses in any order, is what the page writes.
        const names = simpleOf(f.name) !== null ? [simpleOf(f.name)] : onlyEnum(f.name);
        const up = names ? [...new Set(names)] : [];
        let cls = null, withSub = false;
        if (up.length === 1) cls = up[0];
        else if (up.length > 1) {
          const base = up.find((c) => L.S.entities[c] && [c, ...subclasses(L.S, c)].sort().join() === [...up].sort().join());
          if (base) { cls = base; withSub = true; }
        }
        const pt = f.predefinedType.present ? simpleOf(f.predefinedType) : "";
        const known = cls && (L.S.entities[cls] || (L.tm && Object.hasOwn(L.tm, cls)));
        const ptOk = !f.predefinedType.present || (pt && cls && predefinedTypes(L.S, cls).includes(pt));
        if (known && ptOk) {
          spec.cls = cls; spec.withSub = withSub; spec.predefinedType = pt;
          rows++;
          continue;
        }
      }
      spec.fixedApp.push(facetFromParsed(f)); kept++;
    }
    // A prohibited specification has no requirements (the audit's rule); any
    // the file had are counted, not kept.
    if (s.optionality === "prohibited" && s.requirements.length) { dropped += s.requirements.length; droppedIn.push(s.name); }
    else for (const f of s.requirements) {
      const row = spec.cls || f.kind !== "property" ? editableRow(L, spec.cls, f) : null;
      // The row must write the same XML the facet had, or it is kept as written.
      if (row && facetXml(reqFacet(L, row), L.S, true) === facetXml(facetFromParsed(f), L.S, true)) { spec.reqs.push(row); rows++; }
      else { spec.reqs.push({ kind: f.kind, fixed: facetFromParsed(f) }); kept++; }
    }
    state.specs.push(spec);
  }
  return { state, kept, rows, dropped, droppedIn };
}
