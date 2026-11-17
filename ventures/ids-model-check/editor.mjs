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
//   { kind: "attribute", name, value, base, cardinality }  (base: xs:string unless given)
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
    // base: the xs: type of a numeric or boolean attribute (attributeValueKind).
    const v = valueXml(f.value, f.base || "xs:string");
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
// The page edits a plainer state than an IDS: a class (or a few) per specification and
// requirement rows with a value "mode". stateToDoc() turns it into the shape
// buildIds() writes; importIds() turns an opened IDS file into it.

export const blankReq = () => ({ kind: "property", set: "", name: "", custom: false, untyped: false, dataType: "", cardinality: "required", mode: "any", equals: "", oneOf: [], min: "", max: "", pattern: "", system: "", relation: "IFCRELCONTAINEDINSPATIALSTRUCTURE", entity: "IFCBUILDINGSTOREY" });
export const blankSpec = () => ({ name: "", description: "", instructions: "", optionality: "required", cls: "", also: [], withSub: true, predefinedType: "", reqs: [blankReq()], app: [] });

// ------------------------------------------------- several classes per spec --
// A specification may apply to several classes (IFCSLAB, IFCBEAM, IFCCOLUMN):
// `cls` is the first, with its concrete subclasses when `withSub` is set, and
// `also` lists further exact classes. IDS writes them as one entity facet whose
// name is an enumeration, and an object matches when its class is any of them.
// A requirement then has to make sense for every class, so the page offers
// what all of them share: the standard sets each can carry, the attributes
// each has (with the same type) and the predefined types each allows.

const knownClass = (L, c) => !!(c && (L.S.entities[c] || (L.tm && Object.hasOwn(L.tm, c))));

// The classes a specification names before subclasses are added: [cls, ...also].
export const specBases = (spec) => [...new Set([spec.cls, ...(spec.also || [])].filter(Boolean))];

// The exact class names the specification's entity facet writes, in order.
export function specClassNames(S, spec) {
  if (!spec.cls) return [];
  const first = spec.withSub && S.entities[spec.cls] ? [spec.cls, ...subclasses(S, spec.cls)] : [spec.cls];
  return [...new Set([...first, ...(spec.also || []).filter(Boolean)])];
}

// Standard sets every one of `classes` can carry.
export function commonSets(L, classes) {
  const cs = classes.filter(Boolean);
  if (!cs.length || !cs.every((c) => knownClass(L, c))) return [];
  let out = setsFor(L.psets, L.S, cs[0], L.tm);
  for (const c of cs.slice(1)) { const s = new Set(setsFor(L.psets, L.S, c, L.tm)); out = out.filter((x) => s.has(x)); }
  return out;
}

// Attributes every one of `classes` has and the page can edit. Their types
// may differ (PredefinedType is IfcSlabTypeEnum on a slab, IfcBeamTypeEnum on
// a beam); sameAttributeType() says when one enumeration can be offered.
export function commonAttributes(S, classes) {
  const cs = classes.filter(Boolean);
  if (cs.length <= 1) return editableAttributes(S, cs[0]);
  return editableAttributes(S, cs[0]).filter((n) => cs.every((c) => editableAttributes(S, c).includes(n)));
}
const attrType = (S, c, n) => (S.entities[c] ? (S.attrs(c).find((a) => a.name === n) || {}).type : undefined);
export const sameAttributeType = (S, classes, n) => classes.filter(Boolean).every((c) => attrType(S, c, n) === attrType(S, classes[0], n));

// How the page asks for an attribute's value on these classes:
// { kind: "number" | "bool" | "text", enumVals, base }. A number (OverallHeight,
// Elevation, an integer count) gets a range, a boolean or logical true/false,
// an enumeration its values; `base` is the xs: type a restriction on it is
// written with (xs:double for OverallHeight, as IDS's own test cases write a
// bounds restriction on a measure attribute). Classes that type the attribute
// differently, or an attribute the schema does not know, stay free text.
export function attributeValueKind(S, classes, name) {
  const cs = (Array.isArray(classes) ? classes : [classes]).filter(Boolean);
  const a = name && S.entities[cs[0]] && sameAttributeType(S, cs, name) && S.attrs(cs[0]).find((x) => x.name === name);
  if (!a) return { kind: "text", enumVals: null, base: "xs:string" };
  const t = S.types[a.type];
  if (t && t.kind === "enum") return { kind: "text", enumVals: t.values, base: "xs:string" };
  const prim = S.prim(a.type);
  const kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
  return { kind, enumVals: null, base: kind === "text" ? "xs:string" : xsBase(S, a.type) };
}

// Predefined types every one of `classes` allows (one predefinedType applies
// to every name in the entity facet).
export function commonPredefinedTypes(S, classes) {
  const cs = classes.filter(Boolean);
  if (!cs.length) return [];
  let out = predefinedTypes(S, cs[0]);
  for (const c of cs.slice(1)) { const s = new Set(predefinedTypes(S, c)); out = out.filter((x) => s.has(x)); }
  return out;
}

// Splits what an author typed for "also applies to" into class names.
export const parseClassList = (text) => [...new Set(String(text || "").toUpperCase().split(/[\s,;]+/).filter(Boolean))];

// Attributes the page offers for a class: stored, single, comparable by value.
export function editableAttributes(S, cls) {
  if (!S.entities[cls]) return ["Name", "Description", "ObjectType", "Tag"];
  return S.attrs(cls).filter((a) => !a.derived && !a.aggregate && ["string", "double", "integer", "boolean", "logical", "enum"].includes(S.prim(a.type))).map((a) => a.name);
}

// The dataTypes a row of the author's own set can name: the schema's defined
// types IDS can compare (text, numbers, booleans), the common ones first.
const COMMON_TYPES = ["IFCLABEL", "IFCTEXT", "IFCIDENTIFIER", "IFCBOOLEAN", "IFCLOGICAL", "IFCINTEGER", "IFCREAL", "IFCLENGTHMEASURE", "IFCPOSITIVELENGTHMEASURE", "IFCAREAMEASURE", "IFCVOLUMEMEASURE", "IFCMASSMEASURE", "IFCCOUNTMEASURE", "IFCPOSITIVERATIOMEASURE", "IFCRATIOMEASURE", "IFCTHERMALTRANSMITTANCEMEASURE", "IFCDATE", "IFCDATETIME"];
export function valueTypes(S) {
  const ok = (t) => S.types[t] && S.types[t].kind === "defined" && ["string", "double", "integer", "boolean", "logical"].includes(S.prim(t));
  const rest = Object.keys(S.types).filter((t) => ok(t) && !COMMON_TYPES.includes(t)).sort();
  return [...COMMON_TYPES.filter(ok), ...rest];
}

// A set name the page lets an author write as their own: not a standard set
// for the class, and not in buildingSMART's reserved Pset_/Qto_ prefixes (a
// Pset_ name the standard lacks is the audit's pset-unknown error).
export const ownSetName = (name) => typeof name === "string" && name.trim() !== "" && !/^(Pset|Qto)_/.test(name);

// The sets a loaded model's objects of these classes carry (modelInventory()
// in inventory.mjs), merged: [{ name, count, of, standard, props: [{ name,
// count, dataType, values, distinct, more, min, max }] }], where `count` of the
// `of` objects carry the set and `values` are [[value, objects]], most common
// first (see modelValueOffer).
// `standard` says whether it is a template set the class can carry; the page
// offers those as standard rows and the rest as the author's own.
export function modelSets(inv, classes, standardSets = []) {
  if (!inv) return [];
  const want = new Set(classes);
  const out = new Map();
  let of = 0;
  for (const c of inv.classes) {
    if (!want.has(c.cls)) continue;
    of += c.count;
    for (const s of c.sets) {
      let m = out.get(s.name);
      if (!m) out.set(s.name, (m = { name: s.name, count: 0, props: new Map() }));
      m.count += s.count;
      for (const p of s.props) {
        let q = m.props.get(p.name);
        if (!q) m.props.set(p.name, (q = { ...blankTally(), name: p.name, dataType: p.dataType }));
        else q.dataType = q.dataType || p.dataType;
        mergeTally(q, p);
      }
    }
  }
  const prop = (q) => ({ name: q.name, dataType: q.dataType, ...tallyOut(q) });
  return [...out.values()].map((m) => ({ name: m.name, count: m.count, of, standard: standardSets.includes(m.name), props: [...m.props.values()].map(prop).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Value tallies (inventory.mjs) merged across classes. A class's list holds
// its MAX_LISTED commonest values; one that lists fewer than it holds
// (`distinct`) leaves the merged list incomplete.
const blankTally = () => ({ count: 0, empty: 0, vals: new Map(), distinct: 0, more: false, min: null, max: null });
function mergeTally(q, p) {
  q.count += p.count;
  q.empty += p.empty || 0;
  for (const [v, n] of p.values || []) q.vals.set(v, (q.vals.get(v) || 0) + n);
  q.distinct = Math.max(q.distinct, p.distinct || 0);
  if (p.more || (p.distinct || 0) > (p.values || []).length) q.more = true;
  if (p.min !== null && p.min !== undefined) q.min = q.min === null ? p.min : Math.min(q.min, p.min);
  if (p.max !== null && p.max !== undefined) q.max = q.max === null ? p.max : Math.max(q.max, p.max);
}
function tallyOut(q) {
  const values = [...q.vals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { count: q.count, empty: q.empty, values, distinct: Math.max(q.distinct, values.length), more: q.more, min: q.min, max: q.max };
}
function mergeBy(inv, classes, field, key) {
  if (!inv) return [];
  const want = new Set(classes);
  const out = new Map();
  let of = 0;
  for (const c of inv.classes) {
    if (!want.has(c.cls)) continue;
    of += c.count;
    for (const a of c[field] || []) {
      let q = out.get(a[key]);
      if (!q) out.set(a[key], (q = blankTally()));
      mergeTally(q, a);
    }
  }
  return [...out.entries()].map(([k, q]) => ({ [key]: k, of, ...tallyOut(q) })).sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));
}

// The attribute values a model's objects of these classes hold (inventory.mjs
// `attrs`), merged: [{ name, count, of, empty, values, distinct, more, min,
// max }]; `count` of the `of` objects have it set, `empty` of them to an empty
// string or UNKNOWN. Each is one modelValueOffer() can take.
export const modelAttributes = (inv, classes) => mergeBy(inv, classes, "attrs", "name");

// The codes a model's objects of these classes carry in each classification
// system (inventory.mjs `codes`), merged: [{ system, count, of, empty, values,
// distinct, more }]; `empty` of the `count` objects are classified in the
// system with no code. Each is one modelValueOffer() can take, as text.
export const modelCodes = (inv, classes) => mergeBy(inv, classes, "codes", "system");

// What a model's values offer a property row of this value kind (number,
// text, bool) and standard enumeration (or null): mp is one prop of
// modelSets(). -> null when the model holds no value, else
//   { values: [[v, n]] usable for the row, outside: [[v, n]] the standard's
//     enumeration lacks (a check limited to it fails those objects),
//     complete: every value the model holds is listed, min, max,
//     oneOf: the values a "one of" restriction should list to pass the model
//     as it is (null when the list is incomplete or the kind is not text),
//     empty: objects that carry it with no value (an empty attribute, a
//     classification with no code), which any value check fails }
export function modelValueOffer(mp, kind, enumVals = null) {
  if (!mp || !mp.values || !mp.values.length || !kind) return null;
  const isNum = (v) => v.trim() !== "" && Number.isFinite(Number(v));
  const fits = kind === "number" ? (v) => isNum(v) : kind === "bool" ? (v) => v === "true" || v === "false" : () => true;
  const usable = mp.values.filter(([v]) => fits(v));
  const values = enumVals ? usable.filter(([v]) => enumVals.includes(v)) : usable;
  const outside = enumVals ? usable.filter(([v]) => !enumVals.includes(v)) : [];
  const complete = !mp.more && usable.length === mp.values.length && mp.values.length >= (mp.distinct || 0);
  const oneOf = kind === "text" && complete && !outside.length && values.length ? values.map(([v]) => v).sort() : null;
  const num = kind === "number" && typeof mp.min === "number" && typeof mp.max === "number";
  return { values, outside, complete, min: num ? mp.min : null, max: num ? mp.max : null,
    rangeMin: num ? outwardBound(mp.min, -1) : null, rangeMax: num ? outwardBound(mp.max, 1) : null, oneOf, empty: mp.empty || 0 };
}

// How many of the model's objects an applicability row lets through, from the
// inventory's tally for it (`mp`, one entry of modelSets' props,
// modelAttributes or modelCodes; `offer`, modelValueOffer's for it), or null
// when the tally cannot say exactly: a value list cut short, values outside
// the row's kind, objects holding several values, a classification code (one
// object may carry several in a system), a material or a place.
//   r: the row ({ kind, mode, equals, oneOf, min, max, pattern });
//   valueKind: "number" | "text" | "bool" (numbers compare with IDS's
//   tolerance, |a - b| <= |b| x 1e-6 + 1e-6)
export function appMatchCount(mp, offer, r, valueKind = "text") {
  if (r.kind === "material" || r.kind === "partOf") return null;
  if (!mp) return 0;
  const held = mp.count - (mp.empty || 0);
  // Any value: an empty one or UNKNOWN fails an attribute facet, while a
  // classification facet naming only its system passes a reference with no
  // code. A property counted here carries the property.
  if (r.mode === "any" || !r.mode) return r.kind === "classification" ? mp.count : held;
  if (r.kind === "classification" || !offer || !offer.complete || offer.outside.length) return null;
  if (offer.values.reduce((t, [, n]) => t + n, 0) > held) return null;
  const tally = (pick) => offer.values.filter(([v]) => pick(v)).reduce((t, [, n]) => t + n, 0);
  const same = (v, w) => (valueKind === "number" ? Math.abs(Number(v) - Number(w)) <= Math.abs(Number(w)) * 1e-6 + 1e-6 : v === w);
  if (r.mode === "equals") return valueKind === "number" && !Number.isFinite(Number(r.equals)) ? null : tally((v) => same(v, r.equals));
  if (r.mode === "true" || r.mode === "false") return tally((v) => v === r.mode);
  if (r.mode === "oneOf") return tally((v) => r.oneOf.some((w) => same(v, w)));
  if (r.mode === "range") {
    const lo = r.min === "" || r.min == null ? -Infinity : Number(r.min), hi = r.max === "" || r.max == null ? Infinity : Number(r.max);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
    return tally((v) => Number(v) >= lo && Number(v) <= hi);
  }
  if (r.mode === "pattern") {
    let re;
    try { re = new RegExp(`^(?:${r.pattern})$`, "u"); } catch { return null; }
    return tally((v) => re.test(v));
  }
  return null;
}

// The shortest decimal at or beyond v (dir -1: at or below, 1: at or above)
// that stays within IDS's equality tolerance of it (|v| x 1e-6 + 1e-6). IDS
// ranges take no tolerance (ImplementersDocumentation/tolerance.md), and unit
// conversion leaves 0.254 m as 0.25399999999999995: a range from 0.254 fails
// that object, one from 0.253999 passes it. Returned as a string.
export function outwardBound(v, dir) {
  if (!Number.isFinite(v)) return null;
  const tol = Math.abs(v) * 1e-6 + 1e-6;
  for (let k = 0; k <= 15; k++) {
    const f = 10 ** k;
    let d = Number(((dir < 0 ? Math.floor(v * f) : Math.ceil(v * f)) / f).toFixed(k));
    if (dir < 0 && d > v) d = Number((d - 1 / f).toFixed(k));
    if (dir > 0 && d < v) d = Number((d + 1 / f).toFixed(k));
    if (Math.abs(d - v) <= tol && (dir < 0 ? d <= v : d >= v)) return String(d);
  }
  return String(v);
}

// What value modes the page offers for a requirement row, and the
// enumeration it offers them from (null when free text).
//   L = { S, psets, tm }
export function valueChoices(L, cls, r) {
  const classes = Array.isArray(cls) ? cls : [cls];
  cls = classes[0];
  let kind = "text", enumVals = null, p = null;
  if (r.kind === "property" && r.untyped) {
    // A value with no dataType, as an opened file wrote it: IDS 1.0 allows it
    // and a checker compares the value with whatever type the model holds, so
    // the page offers the text modes and writes no dataType (typeRow adds one).
    p = r.custom ? { name: r.name, dataType: null, dataTypes: [], enum: null } : (r.set ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null) || null;
  } else if (r.kind === "property" && r.custom) {
    const dt = r.dataType && L.S.types[r.dataType] ? r.dataType : null;
    p = { name: r.name, dataType: dt, dataTypes: dt ? [dt] : [], enum: null };
    const prim = dt ? L.S.prim(dt) : null;
    kind = !dt ? null : prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
  } else if (r.kind === "property") {
    p = r.set ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null;
    if (!p || !p.dataType) kind = null;
    else {
      const prim = L.S.prim(p.dataType);
      kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
      enumVals = p.enum;
    }
  } else if (r.kind === "attribute") {
    ({ kind, enumVals } = attributeValueKind(L.S, classes, r.name));
  } else if (r.kind === "partOf") kind = null;
  const modes = [];
  if (kind) {
    modes.push("any", "equals");
    // "one of" a standard's enumeration, or of values the author lists (text).
    if (enumVals || kind === "text") modes.push("oneOf");
    if (kind === "number") modes.push("range");
    if (kind === "text" && !enumVals) modes.push("pattern");
    if (kind === "bool") modes.splice(1, 1, "true", "false");
  }
  return { kind, enumVals, modes, prop: p };
}

function reqFacet(L, r, classes = []) {
  if (r.fixed) return r.fixed;
  const p = r.kind !== "property" ? null : r.untyped ? { dataType: null, untyped: true } : r.custom ? { dataType: r.dataType && L.S.types[r.dataType] ? r.dataType : null } : propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name);
  const value = r.cardinality === "prohibited" || (p && !p.dataType && !p.untyped) ? null
    : r.mode === "equals" ? { equals: r.equals } : r.mode === "true" || r.mode === "false" ? { equals: r.mode }
    : r.mode === "oneOf" ? { oneOf: r.oneOf } : r.mode === "range" ? { min: r.min, max: r.max } : r.mode === "pattern" ? { pattern: r.pattern } : null;
  const base = r.kind === "attribute" && value ? attributeValueKind(L.S, classes, r.name).base : undefined;
  return { kind: r.kind, set: r.set, name: r.name, dataType: p ? p.dataType : null, value, base, cardinality: r.cardinality, system: r.system, relation: r.relation, entity: r.entity };
}

// An applicability row: the same row as a requirement, written without a
// cardinality (IDS 1.0 applicability facets have none; an object either
// matches the facet or the specification does not apply to it).
const appFacet = (L, r, classes = []) => reqFacet(L, { ...r, cardinality: "required" }, classes);

// A property row with no dataType (`untyped`, as an opened file had it)
// given the dataType the page would write: the template's for a standard
// property, the model's for an own-set one (`modelType`, when it is a type the
// page offers). The value carries over when it fits the type: TRUE/FALSE in
// any case to true/false, numbers to equals or one of (a list of numbers
// cannot be a one-of on a number row, so it becomes "any value" with
// `dropped` set), an enumeration's members as they are. Returns
// { row, dropped } or null when no type is known.
export function typeRow(L, r, modelType = null) {
  if (r.kind !== "property" || !r.untyped) return null;
  let dt = null, enumVals = null;
  if (r.custom) dt = modelType && valueTypes(L.S).includes(modelType) ? modelType : null;
  else {
    const p = r.set ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null;
    if (p) { dt = p.dataType; enumVals = p.enum; }
  }
  if (!dt) return null;
  const row = { ...r, untyped: false, dataType: r.custom ? dt : r.dataType };
  const prim = L.S.prim(dt);
  const kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
  const vals = r.mode === "equals" ? [r.equals] : r.mode === "oneOf" ? r.oneOf : [];
  let keep = r.mode === "any" || !r.mode;
  if (kind === "bool" && vals.length === 1 && /^(true|false)$/i.test(vals[0])) { row.mode = vals[0].toLowerCase(); keep = true; }
  else if (kind === "number" && r.mode === "equals" && vals[0].trim() !== "" && Number.isFinite(Number(vals[0]))) keep = true;
  else if (kind === "text" && (r.mode === "equals" || r.mode === "oneOf") && (!enumVals || vals.every((v) => enumVals.includes(v)))) keep = true;
  else if (kind === "text" && !enumVals && r.mode === "pattern") keep = true;
  if (!keep) { row.mode = "any"; row.equals = ""; row.oneOf = []; row.pattern = ""; }
  return { row, dropped: !keep };
}

export const reqComplete = (r) => r.fixed || (r.kind === "property" ? r.set && r.name : r.kind === "attribute" ? r.name : r.kind === "partOf" ? r.entity : true);

// The page state as the document buildIds() writes.
export function stateToDoc(state, L) {
  return {
    title: state.title, description: state.description, schema: state.schema, info: state.info,
    specs: state.specs.map((s) => ({
      name: s.name || (s.cls ? `${s.cls} requirements` : "Unnamed specification"),
      description: s.description, instructions: s.instructions, optionality: s.optionality,
      ifcVersion: s.ifcVersion || null, requirementsDescription: s.requirementsDescription || null,
      applicability: [...(s.cls ? [{ kind: "entity", names: specClassNames(L.S, s), predefinedType: s.predefinedType || null }] : []),
        ...(s.app || []).filter(reqComplete).map((r) => appFacet(L, r, specBases(s))), ...(s.fixedApp || [])],
      requirements: s.reqs.filter(reqComplete).map((r) => reqFacet(L, r, specBases(s))),
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
function editableRow(L, classes, f) {
  const cls = classes[0];
  const r = { ...blankReq(), kind: f.kind, cardinality: f.cardinality, oneOf: [] };
  if (f.kind === "property") {
    r.set = simpleOf(f.propertySet); r.name = simpleOf(f.baseName);
    if (!r.set || !r.name) return null;
    if (!commonSets(L, classes).includes(r.set)) {
      // A set of the project's own (Acme_Wall): an editable row when its
      // dataType, if any, is one the page offers.
      if (!ownSetName(r.set) || (f.dataType && !valueTypes(L.S).includes(f.dataType))) return null;
      r.custom = true; r.dataType = f.dataType || "";
    }
    // A value with no dataType stays without one (valueChoices, typeRow).
    if (!f.dataType && f.value && f.value.present) r.untyped = true;
  } else if (f.kind === "attribute") {
    r.name = simpleOf(f.name);
    if (!r.name || !commonAttributes(L.S, classes).includes(r.name)) return null;
  } else if (f.kind === "classification") {
    r.system = f.system.present ? simpleOf(f.system) : "";
    if (r.system === null) return null;
  } else if (f.kind === "partOf") {
    if (!f.relation || !Object.hasOwn(PARTOF_RELATIONS, f.relation) || !f.entity || f.entity.predefinedType.present) return null;
    r.relation = f.relation; r.entity = simpleOf(f.entity.name);
    if (!r.entity) return null;
    return r;
  }
  const ch = valueChoices(L, classes, r);
  const v = f.value;
  if (!v || !v.present) return r;
  if (r.cardinality === "prohibited" || !ch.kind) return null;
  const s = simpleOf(v), en = onlyEnum(v);
  if (s !== null) {
    if (ch.modes.includes("true") && (s === "true" || s === "false")) r.mode = s;
    else if (ch.modes.includes("equals") && (!ch.enumVals || ch.enumVals.includes(s))) { r.mode = "equals"; r.equals = s; }
    else return null;
  } else if (en) {
    if (!ch.modes.includes("oneOf") || (ch.enumVals && !en.every((x) => ch.enumVals.includes(x)))) return null;
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
    const spec = { ...blankSpec(), name: s.name === "(unnamed)" ? "" : s.name, description: s.description || "", instructions: s.instructions || "", optionality: s.optionality, reqs: [], fixedApp: [], app: [] };
    if (s.requirementsDescription) spec.requirementsDescription = s.requirementsDescription;
    if (s.ifcVersion.join(" ") !== IFC_VERSION[schema]) spec.ifcVersion = s.ifcVersion;
    // The class first, so the other facets' rows know what it offers.
    const appIn = [...s.applicability.filter((f) => f.kind === "entity"), ...s.applicability.filter((f) => f.kind !== "entity")];
    for (const f of appIn) {
      // A facet beyond the class: an editable row when the page writes it back
      // unchanged (no cardinality in applicability).
      if (f.kind !== "entity") {
        const row = editableRow(L, specBases(spec), { ...f, cardinality: "required" });
        if (row && facetXml(appFacet(L, row, specBases(spec)), L.S, false) === facetXml(facetFromParsed(f), L.S, false)) { spec.app.push({ ...row, cardinality: "required" }); rows++; continue; }
      }
      if (f.kind === "entity" && !spec.cls && !spec.fixedApp.some((x) => x.kind === "entity")) {
        // A class list matches as a set: one name, or a class and all its
        // concrete subclasses in any order, is what the page writes.
        const names = simpleOf(f.name) !== null ? [simpleOf(f.name)] : onlyEnum(f.name);
        const up = names ? [...new Set(names)] : [];
        // Otherwise several classes: the first named, then the rest as
        // written, each an exact class.
        let cls = null, withSub = false, also = [];
        if (up.length === 1) cls = up[0];
        else if (up.length > 1) {
          const base = up.find((c) => L.S.entities[c] && [c, ...subclasses(L.S, c)].sort().join() === [...up].sort().join());
          if (base) { cls = base; withSub = true; }
          else { cls = up[0]; also = up.slice(1); }
        }
        const pt = f.predefinedType.present ? simpleOf(f.predefinedType) : "";
        const known = cls && [cls, ...also].every((c) => knownClass(L, c));
        const ptOk = !f.predefinedType.present || (pt && cls && commonPredefinedTypes(L.S, [cls, ...also]).includes(pt));
        if (known && ptOk) {
          spec.cls = cls; spec.also = also; spec.withSub = withSub; spec.predefinedType = pt;
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
      const row = editableRow(L, specBases(spec), f);
      // The row must write the same XML the facet had, or it is kept as written.
      if (row && facetXml(reqFacet(L, row, specBases(spec)), L.S, true) === facetXml(facetFromParsed(f), L.S, true)) { spec.reqs.push(row); rows++; }
      else { spec.reqs.push({ kind: f.kind, fixed: facetFromParsed(f) }); kept++; }
    }
    state.specs.push(spec);
  }
  return { state, kept, rows, dropped, droppedIn };
}
