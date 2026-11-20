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

import { temporalKind, temporalKey, lexRange } from "./temporal.mjs";
import { nearName } from "./audit.mjs";
import { fixStructure } from "./fix.mjs";

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
// The template type (`tt`, IFC4 and IFC4X3) narrows that: an occurrence set
// (PSET_/QTO_OCCURRENCEDRIVEN, Pset_FanOccurrence) is not offered on a type
// object, and a performance set (PSET_PERFORMANCEDRIVEN, Pset_FanPHistory)
// is offered on IFCPERFORMANCEHISTORY, which carries it, not on the fan. The
// audit's pset-occurrence and pset-performance warnings read the same field.
function setApplies(S, cls, set, typeMap) {
  if (!set.classes.length) return false;
  const anc = ancestors(S, cls);
  if (set.tt === "PSET_PERFORMANCEDRIVEN") return anc.includes("IFCPERFORMANCEHISTORY");
  if (set.classes.some((c) => anc.includes(c))) return true;
  if (cls.endsWith("TYPE") && !/OCCURRENCEDRIVEN$/.test(set.tt || "")) {
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

// Classes a schema still defines but tells writers not to use: IFC 4.3
// deprecates IfcWallStandardCase ("IfcWall with IfcMaterialLayerSetUsage is
// used instead") and IfcElectricDistributionBoard ("Use IfcDistributionBoard
// instead"; buildingSMART/IFC4.3.x-development docs). They are the only
// deprecated element classes left in IFC4X3_ADD2 (the other IFC4 standard and
// elemented cases were deleted), and no IFC4X3 export read has one
// (eval/deprecated-subclasses-2026-11-19.md: 0 in 57 files), while IFC4
// exports still carry IfcWallStandardCase (151 of 572 walls). IFC4 and IFC2X3
// list none here.
export const DEPRECATED = {
  IFC4X3_ADD2: new Set(["IFCWALLSTANDARDCASE", "IFCELECTRICDISTRIBUTIONBOARD", "IFCELECTRICDISTRIBUTIONBOARDTYPE"]),
};
const NONE = new Set();
// The deprecated classes a specification's subclass boxes leave out: the
// page schema's, unless the specification also names an older schema in its
// own ifcVersion (an "IFC4 IFC4X3_ADD2" specification checks IFC4 models,
// where IFCWALLSTANDARDCASE is a quarter of the walls).
export function deprecatedFor(S, spec) {
  const d = (S && own(DEPRECATED, S.name)) || NONE;
  if (!d.size) return d;
  const ids = schemaIdsOf(spec && spec.ifcVersion);
  return ids.some((id) => id !== "IFC4X3") ? NONE : d;
}
// What a ticked "and its subclasses" box writes for `cls`: its concrete
// subclasses without the deprecated ones (`subs`), and the deprecated ones it
// leaves out (`left`), which the page names beside the box. A model that does
// carry one still gets the "would not check" warning (modelSubclassesLeftOut)
// and its Add button.
export function boxSubclasses(S, cls, spec) {
  const all = S.entities[cls] ? subclasses(S, cls) : [];
  const dep = deprecatedFor(S, spec);
  return { subs: all.filter((c) => !dep.has(c)), left: all.filter((c) => dep.has(c)) };
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

// The XSD date, time or duration a dataType holds (IDS's DataTypes table:
// IFCDATE xs:date, IFCDATETIME xs:dateTime, IFCTIME xs:time, IFCDURATION
// xs:duration), or null. IFC writes them as strings; ids.mjs orders range
// bounds on them as dates, times and durations (temporal.mjs).
const TEMPORAL = { IFCDATE: "date", IFCDATETIME: "dateTime", IFCTIME: "time", IFCDURATION: "duration" };
export const temporalType = (dataType) => (dataType && Object.hasOwn(TEMPORAL, String(dataType).toUpperCase()) ? TEMPORAL[String(dataType).toUpperCase()] : null);
// An example of each form, for a range row's placeholders and hints.
export const TEMPORAL_EXAMPLE = { date: ["2024-01-01", "2030-12-31"], dateTime: ["2024-01-01T00:00:00", "2030-12-31T23:59:59"], time: ["07:00:00", "19:00:00"], duration: ["PT30M", "P1Y"] };

// An XSD pattern that matches the ISO dates (YYYY-MM-DD, with or without a
// time zone) a date range asks for, or null when a bound is not a plain date.
// IfcTester 0.9.0 reads range bounds only as numbers (float("2024-01-01")
// fails), so it fails every object on an xs:date range that this checker and
// IDS 1.0's DataTypes table accept; a pattern both read the same way
// (eval/date-ranges-2026-11-17.md). Fixed-width dates order as strings, so the
// pattern is the lexical range between the bounds, built digit by digit.
// Exclusive bounds move one day inward. The pattern matches only well-formed
// dates' shape between the bounds; it does not check a day exists.
const DAY = 86400000;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
export function datePattern(min, max, minEx = false, maxEx = false) {
  const blank = (x) => x === "" || x == null;
  if (blank(min) && blank(max)) return null;
  if ((!blank(min) && !PLAIN_DATE.test(min)) || (!blank(max) && !PLAIN_DATE.test(max))) return null;
  const t = (d) => Date.parse(d + "T00:00:00Z");
  if ((!blank(min) && Number.isNaN(t(min))) || (!blank(max) && Number.isNaN(t(max)))) return null;
  const lo = blank(min) ? "0000-00-00" : minEx ? isoDay(t(min) + DAY) : min;
  const hi = blank(max) ? "9999-99-99" : maxEx ? isoDay(t(max) - DAY) : max;
  if (lo > hi) return null;
  const body = lexRange(lo, hi);
  return body === null ? null : `${body}(Z|[+\\-]\\d{2}:\\d{2})?`;
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
//   { min: "1", max: "9", minEx, maxEx } (either bound may be absent; inclusive
//   unless minEx / maxEx is true, then xs:minExclusive / xs:maxExclusive) |
//   { r: { base, enumeration, pattern, minInclusive, maxInclusive,
//          minExclusive, maxExclusive, length, minLength, maxLength } }
//   (any restriction, as an opened IDS file had it; its own base wins);
//   { equals: "", exact: true } writes an empty simpleValue an opened file had
// Returns "" for no restriction.
const R_BOUNDS = ["minInclusive", "minExclusive", "maxInclusive", "maxExclusive", "length", "minLength", "maxLength"];
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
  } else if (v.oneOf && v.oneOf.length) {
    // A one-of on a date, time or duration is written on that XSD base (or on
    // xs:string, as an opened file had it: `oneOfBase`).
    if (v.base) base = v.base;
    for (const x of v.oneOf) parts.push(`<xs:enumeration value="${escAttr(x)}"/>`);
  }
  else if (v.pattern) parts.push(`<xs:pattern value="${escAttr(v.pattern)}"/>`);
  else {
    // A range on a date, time or duration is written on that XSD base.
    if (v.base) base = v.base;
    if (v.min !== undefined && v.min !== "") parts.push(`<xs:${v.minEx ? "minExclusive" : "minInclusive"} value="${escAttr(v.min)}"/>`);
    if (v.max !== undefined && v.max !== "") parts.push(`<xs:${v.maxEx ? "maxExclusive" : "maxInclusive"} value="${escAttr(v.max)}"/>`);
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
  // A bSDD uri: ids.xsd allows it on requirement property, classification
  // and material facets only, before cardinality.
  const card = inRequirements ? (f.uri && ["property", "classification", "material"].includes(f.kind) ? ` uri="${escAttr(f.uri)}"` : "") + cardinalityAttr(f.cardinality) : "";
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

export const blankReq = () => ({ kind: "property", set: "", name: "", custom: false, untyped: false, dataType: "", cardinality: "required", mode: "any", equals: "", oneOf: [], min: "", max: "", minEx: false, maxEx: false, pattern: "", system: "", relation: "IFCRELCONTAINEDINSPATIALSTRUCTURE", entity: "IFCBUILDINGSTOREY" });
export const blankSpec = () => ({ name: "", description: "", instructions: "", optionality: "required", cls: "", also: [], alsoSub: [], withSub: true, predefinedType: "", reqs: [blankReq()], app: [] });

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
  const first = spec.withSub && S.entities[spec.cls] ? [spec.cls, ...boxSubclasses(S, spec.cls, spec).subs] : [spec.cls];
  const ticked = new Set(spec.alsoSub || []);
  const rest = (spec.also || []).filter(Boolean).flatMap((c) => (ticked.has(c) && S.entities[c] ? [c, ...boxSubclasses(S, c, spec).subs] : [c]));
  return [...new Set([...first, ...rest])];
}

// An entity facet's class list read back as the classes a person picked:
// [{ cls, withSub }] in the file's order. A name whose concrete subclasses are
// all in the list (and that is not itself below another such name) stands for
// itself and its subclasses; the subclasses it covers are not listed again;
// every other name is an exact class. So `IFCWALL IFCWALLSTANDARDCASE
// IFCWALLELEMENTEDCASE IFCSLAB IFCSLABSTANDARDCASE IFCSLABELEMENTEDCASE`
// opens as IFCWALL and IFCSLAB, each with its subclasses ticked, not as six
// exact classes. The written facet names the same set of classes. A box
// covers only the subclasses it writes (boxSubclasses: in IFC4X3 no
// deprecated ones), so a deprecated class the list names stays an exact class
// and is written back, and one the list leaves out does not stop the box
// opening ticked (the bSDD templates' IFCBUILTELEMENT without
// IFCWALLSTANDARDCASE). `spec` gives the ifcVersion (deprecatedFor).
export function classListBases(S, names, spec = null) {
  const up = [...new Set(names)];
  const inList = new Set(up);
  const subsOf = new Map();
  for (const c of up) {
    if (!S.entities[c]) continue;
    const subs = boxSubclasses(S, c, spec).subs;
    if (subs.length && subs.every((x) => inList.has(x))) subsOf.set(c, subs);
  }
  // Only the topmost: IFCBUILTELEMENT's group already holds IFCWALL's.
  const top = [...subsOf.keys()].filter((c) => !ancestors(S, c).some((a) => a !== c && subsOf.has(a)));
  const covered = new Set(top.flatMap((c) => subsOf.get(c)));
  return up.filter((c) => top.includes(c) || !covered.has(c)).map((cls) => ({ cls, withSub: top.includes(cls) }));
}

// Classes in a loaded model (inv.classes: [{ cls, count }]) that are a
// subclass of a class the specification names but are not named themselves:
// IDS has no inheritance, so a facet naming IFCWALL never looks at the
// model's IFCWALLSTANDARDCASE objects (most walls in Revit's IFC2X3 exports;
// eval/corpus-crosscheck-2026-11-17.md). [{ cls, count, via }], most first.
export function modelSubclassesLeftOut(S, spec, invClasses) {
  const named = new Set(specClassNames(S, spec));
  const bases = specBases(spec).filter((c) => S.entities[c]);
  const out = [];
  for (const { cls, count } of invClasses || []) {
    if (!count || named.has(cls) || !S.entities[cls]) continue;
    const up = ancestors(S, cls);
    const via = bases.find((b) => up.includes(b));
    if (via) out.push({ cls, count, via });
  }
  return out.sort((x, y) => y.count - x.count || (x.cls < y.cls ? -1 : 1));
}

// The specification "Add a specification" starts from a class in the open
// model's list: the class, plus the model's own objects of its subclasses
// (IFCWALL with the model's IFCWALLSTANDARDCASE), so the new specification
// does not open with a "would not check" warning to click away. Only classes
// the model has: the schema's other subclasses stay behind the checkbox.
export function modelSpec(S, cls, invClasses) {
  const nice = S.entities[cls] ? S.entities[cls].name.replace(/^Ifc/, "") : cls;
  const spec = { ...blankSpec(), name: `${nice} requirements`, cls, withSub: false };
  spec.also = modelSubclassesLeftOut(S, spec, invClasses).map((x) => x.cls);
  return spec;
}

// Standard sets every one of `classes` can carry.
// A specification with no class applies to every object the other
// applicability facets select (IDS 1.0), so any standard set may be named:
// every set a template gives to some class.
// With a predefinedType chosen, a set the templates give only to other types
// of these classes is left out (setTypeLimit).
export function commonSets(L, classes, predefinedType = "") {
  const cs = classes.filter(Boolean);
  if (!cs.length) return anySets(L.psets);
  if (!cs.every((c) => knownClass(L, c))) return [];
  let out = setsFor(L.psets, L.S, cs[0], L.tm);
  for (const c of cs.slice(1)) { const s = new Set(setsFor(L.psets, L.S, c, L.tm)); out = out.filter((x) => s.has(x)); }
  if (predefinedType) {
    const pt = predefinedType.toLowerCase();
    out = out.filter((x) => { const lim = setTypeLimit(L, x, cs); return !lim || lim.some((v) => v.toLowerCase() === pt); });
  }
  return out;
}

// The predefined types a standard set is limited to on `classes` (IFC4 and
// IFC4X3 templates: Pset_ActuatorTypeElectricActuator is for
// IFCACTUATOR/ELECTRICACTUATOR), or null when some class carries it whatever
// its type. Classes with no PredefinedType attribute (IFC4's IfcMaterial/Concrete
// names a category) are never limited. The audit's pset-predefined warning
// reads the same `pt` field (audit.mjs, predefinedIssue).
export function setTypeLimit(L, setName, classes) {
  const set = own(L.psets, setName);
  if (!set || !set.pt) return null;
  const out = new Set();
  for (const c of classes.filter(Boolean)) {
    if (!predefinedTypes(L.S, c).length) return null;
    const via = set.classes.filter((t) => setApplies(L.S, c, { classes: [t] }, L.tm));
    if (!via.length) continue;
    if (via.some((t) => !own(set.pt, t))) return null;
    for (const t of via) for (const v of set.pt[t]) out.add(v);
  }
  return out.size ? [...out] : null;
}

// Attributes every one of `classes` has and the page can edit. Their types
// may differ (PredefinedType is IfcSlabTypeEnum on a slab, IfcBeamTypeEnum on
// a beam); sameAttributeType() says when one enumeration can be offered.
export function commonAttributes(S, classes) {
  const cs = classes.filter(Boolean);
  if (!cs.length) return anyAttributes(S);
  if (cs.length === 1) return editableAttributes(S, cs[0]);
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
  let cs = (Array.isArray(classes) ? classes : [classes]).filter(Boolean);
  // No class: the attribute on every class that has it, typed only when
  // every one of them gives it the same single, stored type (Version is
  // IFCLABEL on all three classes that have it; Name is a label on most
  // classes but IFCSIUNITNAME on IFCSIUNIT, so it stays free text).
  if (!cs.length && name) {
    const occ = attributeOccurrences(S).get(name);
    if (!occ || occ.types.size !== 1 || occ.mixed || !occ.editable) return { kind: "text", enumVals: null, base: "xs:string" };
    const k = attributeValueKind(S, [occ.firstEditable], name);
    return occ.derivedOn.length ? { ...k, derivedOn: [...occ.derivedOn] } : k;
  }
  const a = name && S.entities[cs[0]] && sameAttributeType(S, cs, name) && S.attrs(cs[0]).find((x) => x.name === name);
  if (!a) return { kind: "text", enumVals: null, base: "xs:string" };
  const t = S.types[a.type];
  if (t && t.kind === "enum") return { kind: "text", enumVals: t.values, base: "xs:string" };
  const prim = S.prim(a.type);
  const kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
  const temporal = kind === "text" ? temporalType(a.type) : null;
  return { kind, enumVals: null, base: kind === "text" ? "xs:string" : xsBase(S, a.type), ...(temporal ? { temporal } : {}) };
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

// For a specification with no class (an applicability of attributes or
// properties alone, as buildingSMART's IDS-Audit-tool RichFileAttribute files
// write it): every attribute the page could edit on some class, and how each
// is typed across all the classes that have it. Cached per schema.
const occCache = new WeakMap();
function attributeOccurrences(S) {
  let m = occCache.get(S);
  if (m) return m;
  m = new Map();
  for (const cls of Object.keys(S.entities)) {
    const ok = new Set(editableAttributes(S, cls));
    for (const a of S.attrs(cls)) {
      let o = m.get(a.name);
      if (!o) m.set(a.name, (o = { types: new Set(), editable: false, mixed: false, firstEditable: null, derivedOn: [] }));
      o.types.add(a.type);
      // A subclass that redeclares the attribute as derived, in the same type
      // (CoordinateSpaceDimension and Precision on
      // IfcGeometricRepresentationSubContext): its objects always fail a
      // value check (IDS's derived-attributes test case) but the attribute is
      // still the same number everywhere it is stored, so it stays typed.
      if (ok.has(a.name)) { o.editable = true; o.firstEditable = o.firstEditable || cls; }
      else if (a.derived && !a.aggregate) o.derivedOn.push(cls);
      else o.mixed = true;
    }
  }
  occCache.set(S, m);
  return m;
}
// The four IfcRoot names most specifications use first, then the rest A to Z.
const ROOT_ATTRS = ["Name", "Description", "ObjectType", "Tag"];
export function anyAttributes(S) {
  const m = attributeOccurrences(S);
  const rest = [...m].filter(([n, o]) => o.editable && !ROOT_ATTRS.includes(n)).map(([n]) => n).sort();
  return [...ROOT_ATTRS.filter((n) => m.has(n)), ...rest];
}
export function anySets(psets) {
  return Object.keys(psets || {}).filter((n) => psets[n].classes && psets[n].classes.length)
    .sort((a, b) => (a.startsWith("Qto_") - b.startsWith("Qto_")) || a.localeCompare(b));
}

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
const blankTally = () => ({ count: 0, empty: 0, vals: new Map(), distinct: 0, more: false, min: null, max: null, exact: new Set(), exactNone: false, tkind: null, tmin: null, tmax: null });
function mergeTally(q, p) {
  q.count += p.count;
  q.empty += p.empty || 0;
  for (const [v, n] of p.values || []) q.vals.set(v, (q.vals.get(v) || 0) + n);
  q.distinct = Math.max(q.distinct, p.distinct || 0);
  if (p.more || (p.distinct || 0) > (p.values || []).length) q.more = true;
  if (p.min !== null && p.min !== undefined) q.min = q.min === null ? p.min : Math.min(q.min, p.min);
  if (p.max !== null && p.max !== undefined) q.max = q.max === null ? p.max : Math.max(q.max, p.max);
  // The exact numbers (inventory.mjs MAX_EXACT): unknown once any class's are.
  if (p.exact === null || (p.min != null && !Array.isArray(p.exact))) q.exactNone = true;
  else for (const x of p.exact || []) q.exact.add(x);
  // Temporal ranges: one form across every class, else "mixed".
  if (p.tkind && q.tkind !== "mixed") {
    if (p.tkind === "mixed" || (q.tkind && q.tkind !== p.tkind)) { q.tkind = "mixed"; q.tmin = q.tmax = null; }
    else {
      q.tkind = p.tkind;
      if (q.tmin === null || temporalKey(p.tmin) < temporalKey(q.tmin)) q.tmin = p.tmin;
      if (q.tmax === null || temporalKey(p.tmax) > temporalKey(q.tmax)) q.tmax = p.tmax;
    }
  }
}
function tallyOut(q) {
  const values = [...q.vals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { count: q.count, empty: q.empty, values, distinct: Math.max(q.distinct, values.length), more: q.more, min: q.min, max: q.max,
    exact: q.exactNone ? null : [...q.exact].sort((a, b) => Number(a) - Number(b)), tkind: q.tkind, tmin: q.tmin, tmax: q.tmax };
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
//     as it is (null when the list is incomplete, the kind is bool, or a
//     number row holds more than NUMBER_ONEOF_MAX values at 12 digits or
//     twice that exactly; a number list names the exact values, mp.exact),
//     empty: objects that carry it with no value (an empty attribute, a
//     classification with no code), which any value check fails,
//     tmin, tmax: for a row of temporal type (temporalType(): "date",
//     "dateTime", "time", "duration"), the earliest and latest value when
//     every value the model holds has that form, else null; a range between
//     them, inclusive, passes every object that carries a value (IDS
//     compares temporal bounds exactly, so no rounding outward is needed) }
export const NUMBER_ONEOF_MAX = 12;
export function modelValueOffer(mp, kind, enumVals = null, temporal = null) {
  if (!mp || !mp.values || !mp.values.length || !kind) return null;
  const isNum = (v) => v.trim() !== "" && Number.isFinite(Number(v));
  const fits = kind === "number" ? (v) => isNum(v) : kind === "bool" ? (v) => v === "true" || v === "false" : () => true;
  const usable = mp.values.filter(([v]) => fits(v));
  const values = enumVals ? usable.filter(([v]) => enumVals.includes(v)) : usable;
  const outside = enumVals ? usable.filter(([v]) => !enumVals.includes(v)) : [];
  const complete = !mp.more && usable.length === mp.values.length && mp.values.length >= (mp.distinct || 0);
  // A number list is offered when it is short (a handful of standard sizes),
  // naming every value exactly as the model holds it (`exact`: Revit's
  // 2.8000000001193297 next to 2.8), so a checker comparing without IDS's
  // tolerance (IfcTester 0.9.0) passes it too; a long one is a range's job.
  const exact = kind === "number" && Array.isArray(mp.exact) && mp.exact.length <= 2 * NUMBER_ONEOF_MAX ? mp.exact : null;
  const oneOf = !complete || outside.length || !values.length ? null
    : kind === "text" ? values.map(([v]) => v).sort()
    : kind === "number" && values.length <= NUMBER_ONEOF_MAX && exact ? [...exact] : null;
  const num = kind === "number" && typeof mp.min === "number" && typeof mp.max === "number";
  return { values, outside, complete, min: num ? mp.min : null, max: num ? mp.max : null,
    rangeMin: num ? outwardBound(mp.min, -1) : null, rangeMax: num ? outwardBound(mp.max, 1) : null, oneOf, empty: mp.empty || 0,
    ...modelTemporalRange(mp, temporal) };
}

// { tmin, tmax } of a value tally for a row of temporal form `temporal`, or
// nulls when the model holds anything else in it.
function modelTemporalRange(mp, temporal) {
  const ok = temporal && mp.tkind === temporal && typeof mp.tmin === "string" && typeof mp.tmax === "string";
  return { tmin: ok ? mp.tmin : null, tmax: ok ? mp.tmax : null };
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
    const blank = (x) => x === "" || x == null;
    // Dates, times and durations: the bounds and the model's values in one
    // ISO form, ordered as ids.mjs orders them (temporal.mjs).
    const tk = [r.min, r.max].filter((x) => !blank(x)).map((x) => temporalKind(String(x)));
    if (tk.length && tk.every(Boolean)) {
      if (tk.some((k) => k !== tk[0])) return 0;
      const lo = blank(r.min) ? -Infinity : temporalKey(String(r.min)), hi = blank(r.max) ? Infinity : temporalKey(String(r.max));
      const key = (v) => (temporalKind(v) === tk[0] ? temporalKey(v) : NaN);
      return tally((v) => { const k = key(v); return (r.minEx ? k > lo : k >= lo) && (r.maxEx ? k < hi : k <= hi); });
    }
    const lo = r.min === "" || r.min == null ? -Infinity : Number(r.min), hi = r.max === "" || r.max == null ? Infinity : Number(r.max);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
    return tally((v) => (r.minEx ? Number(v) > lo : Number(v) >= lo) && (r.maxEx ? Number(v) < hi : Number(v) <= hi));
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
  let kind = "text", enumVals = null, p = null, temporal = null, integer = false;
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
    temporal = temporalType(dt);
    integer = prim === "integer";
  } else if (r.kind === "property") {
    p = r.set ? propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name) : null;
    // A standard property in the dataType the opened file gave it, not the
    // template's (fileTypeOf): the row offers that type's values and keeps it.
    if (p && r.fileType) p = fileTypeProp(L, p, r.fileType);
    if (!p || !p.dataType) kind = null;
    else {
      const prim = L.S.prim(p.dataType);
      kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
      enumVals = p.enum;
      temporal = temporalType(p.dataType);
      integer = prim === "integer";
    }
  } else if (r.kind === "attribute") {
    let base;
    ({ kind, enumVals, temporal = null, base } = attributeValueKind(L.S, classes, r.name));
    integer = base === "xs:integer" || (kind === "number" && r.numBase === "xs:integer");
  } else if (r.kind === "partOf") kind = null;
  const modes = [];
  if (kind) {
    modes.push("any", "equals");
    // "one of" a standard's enumeration, or of values the author lists (text
    // or numbers: a cardinal point 1 to 9, a few standard thicknesses).
    if (enumVals || kind === "text" || kind === "number") modes.push("oneOf");
    // A date, time or duration (IFCDATE, IFCDATETIME, IFCTIME, IFCDURATION)
    // takes a range too: "built after 2024-01-01", "a warranty of at least P2Y".
    if (kind === "number" || temporal) modes.push("range");
    if (kind === "text" && !enumVals) modes.push("pattern");
    if (kind === "bool") modes.splice(1, 1, "true", "false");
  }
  return { kind, enumVals, modes, prop: p, temporal, integer: kind === "number" && integer };
}

// Why a value listed on a number row cannot be written as it is, or null:
// IDS reads an xs:double literal like 42.3 or 1e-3 (no thousands separator,
// no unit) and an xs:integer one as digits only, as the audit checks them.
// NaN and INF are valid xs:double but match no measured value, so the row
// refuses them too.
export function numberValueProblem(text, integer = false) {
  const t = String(text);
  if (integer) return /^[-+]?[0-9]+$/.test(t) ? null : /^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$/.test(t) && Number.isInteger(Number(t)) ? `${t} is a whole number written with a point or exponent; an integer is written as digits only (${Number(t)})` : `${t} is not an integer`;
  return /^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$/.test(t) ? null : `${t} is not a number IDS can read (write it like 42.3, with a point and no thousands separator or unit)`;
}

// A range row's value: inclusive bounds unless the row says a bound is
// exclusive ("more than" / "less than"), as IDS's restriction test cases write them.
const rangeValue = (r, temporal) => ({ min: r.min, max: r.max, ...(r.minEx ? { minEx: true } : {}), ...(r.maxEx ? { maxEx: true } : {}), ...(temporal ? { base: "xs:" + temporal } : {}) });
// A one-of row's value. On a date, time or duration (IFCDATE, IFCDATETIME,
// IFCTIME, IFCDURATION) the enumeration takes the XSD base IDS 1.0's DataTypes
// table gives that type (xs:date, ...), as it does for a range; a row opened
// from a file that wrote it on xs:string keeps that (`oneOfBase`), so the file
// is written back as it was.
const oneOfValue = (r, temporal) => ({ oneOf: r.oneOf, ...(temporal ? { base: r.oneOfBase || "xs:" + temporal } : {}) });
function reqFacet(L, r, classes = []) {
  if (r.fixed) return r.fixed;
  const p = r.kind !== "property" ? null : r.untyped ? { dataType: null, untyped: true } : r.custom ? { dataType: r.dataType && L.S.types[r.dataType] ? r.dataType : null } : r.fileType ? { dataType: r.fileType } : propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name);
  const temporal = r.mode !== "oneOf" && r.mode !== "range" ? null : r.kind === "property" ? temporalType(p && p.dataType) : r.kind === "attribute" ? attributeValueKind(L.S, classes, r.name).temporal || null : null;
  const value = r.cardinality === "prohibited" || (p && !p.dataType && !p.untyped) ? null
    : r.mode === "equals" ? { equals: r.equals } : r.mode === "true" || r.mode === "false" ? { equals: r.mode }
    : r.mode === "oneOf" ? oneOfValue(r, temporal) : r.mode === "range" ? rangeValue(r, temporal) : r.mode === "pattern" ? { pattern: r.pattern } : null;
  const k = r.kind === "attribute" && value ? attributeValueKind(L.S, classes, r.name) : null;
  const base = k ? (k.kind === "number" && r.numBase) || k.base : undefined;
  return { kind: r.kind, set: r.set, name: r.name, dataType: p ? p.dataType : null, value, base, cardinality: r.cardinality, system: r.system, relation: r.relation, entity: r.entity, uri: r.uri };
}

// An applicability row: the same row as a requirement, written without a
// cardinality (IDS 1.0 applicability facets have none; an object either
// matches the facet or the specification does not apply to it).
const appFacet = (L, r, classes = []) => reqFacet(L, { ...r, cardinality: "required" }, classes);

// A property row with no dataType (`untyped`, as an opened file had it)
// given the dataType the page would write: the template's for a standard
// property, the model's for an own-set one (`modelType`, when it is a type the
// page offers). The value carries over when it fits the type: TRUE/FALSE in
// any case to true/false, numbers to equals or one of when every value is
// written as IDS reads that number type (otherwise "any value" with `dropped`
// set), an enumeration's members as they are. Returns
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
  return carryValue(L, r, row, null, dt, enumVals);
}

// A row's value moved from data type `from` (null: no dataType) to `dt`, with
// `enumVals` the enumeration the new type offers. It carries over when it fits
// the new type: TRUE/FALSE in any case to true/false, numbers to equals or one
// of (and a range's bounds) when each is written as IDS reads that number
// type, text values when the enumeration has them, a pattern when there is no
// enumeration, a date range to the same kind of date. Otherwise the row asks
// for any value and `dropped` is set. Returns { row, dropped }.
function carryValue(L, r, row, from, dt, enumVals) {
  const prim = L.S.prim(dt);
  const kind = prim === "double" || prim === "integer" ? "number" : prim === "boolean" || prim === "logical" ? "bool" : "text";
  const vals = r.mode === "equals" ? [r.equals] : r.mode === "oneOf" ? r.oneOf : r.mode === "true" || r.mode === "false" ? [r.mode] : [];
  const temporal = temporalType(dt);
  let keep = r.mode === "any" || !r.mode;
  if (kind === "bool" && vals.length === 1 && /^(true|false)$/i.test(vals[0])) { row.mode = vals[0].toLowerCase(); keep = true; }
  else if (kind === "number" && (r.mode === "equals" || r.mode === "oneOf") && vals.length && vals.every((v) => !numberValueProblem(v, prim === "integer"))) keep = true;
  else if (kind === "number" && r.mode === "range" && !temporalType(from) && [r.min, r.max].every((v) => v === "" || v === undefined || !numberValueProblem(v, prim === "integer"))) keep = true;
  else if (kind === "text" && temporal && r.mode === "range" && temporalType(from) === temporal) keep = true;
  else if (kind === "text" && (r.mode === "true" || r.mode === "false") && !enumVals) { row.mode = "equals"; row.equals = r.mode; keep = true; }
  else if (kind === "text" && (r.mode === "equals" || r.mode === "oneOf") && (!enumVals || vals.every((v) => enumVals.includes(v)))) keep = true;
  else if (kind === "text" && !enumVals && r.mode === "pattern") keep = true;
  // A date one-of keeps an xs:string base only on a date type that had it.
  if (row.oneOfBase && (!temporal || temporalType(from) !== temporal)) delete row.oneOfBase;
  if (!keep) { row.mode = "any"; row.equals = ""; row.oneOf = []; row.pattern = ""; row.min = ""; row.max = ""; row.minEx = false; row.maxEx = false; delete row.oneOfBase; }
  return { row, dropped: !keep };
}

// The template's property as a row with the file's dataType (`fileType`)
// sees it: that one type, and the template's enumeration only while the file's
// type holds text.
function fileTypeProp(L, p, fileType) {
  const prim = L.S.prim(fileType);
  const text = !["double", "integer", "boolean", "logical"].includes(prim);
  return { ...p, dataType: fileType, dataTypes: [fileType], enum: text ? p.enum : null };
}

// The dataType an opened file gave a standard property when it is not the one
// the page writes for it (the template's first), and the schema knows it:
// Pset_ManufacturerOccurrence.SerialNumber as IFCTEXT (template IFCIDENTIFIER),
// Spain's Qto_SpaceBaseQuantities.NetFloorArea as IFCREAL. The row keeps it,
// so the file is written back as it was; when the templates do not allow it
// the audit's pset-datatype error stands and templateTypeRow offers the fix.
export function fileTypeOf(L, set, name, dataType) {
  if (!dataType || !set || !name || !L.S.types[dataType]) return null;
  const p = propertiesOf(L.psets, L.S, set).find((x) => x.name === name);
  return p && p.dataType !== dataType ? dataType : null;
}

// Whether a fileType row's type is one the templates refuse (the audit's
// pset-datatype error), rather than one they also allow.
export function fileTypeRefused(L, r) {
  if (!r || r.kind !== "property" || !r.fileType || r.custom || r.untyped) return false;
  const p = propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name);
  return !!(p && p.dataTypes.length && !p.dataTypes.includes(r.fileType));
}

// "Use the template's type": a row kept in the file's dataType (fileType)
// moved to the template's, the value carried over as carryValue says.
// Returns { row, dropped, dataType } or null when the row has no file type or
// the template gives no single type.
export function templateTypeRow(L, r) {
  if (r.kind !== "property" || !r.fileType || r.custom || r.untyped || r.fixed) return null;
  const p = propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name);
  if (!p || !p.dataType) return null;
  const row = { ...r };
  delete row.fileType;
  return { ...carryValue(L, r, row, r.fileType, p.dataType, p.enum), dataType: p.dataType };
}

// The other way: a standard-set row whose model writes the property in a
// data type the template does not give (`modelType`; Revit writes
// Pset_*Common.Reference as IFCLABEL where IFC2X3 says IFCIDENTIFIER). A
// requirement with the template's dataType fails every such object, and one
// with the model's dataType is a template error in the audit. Without a
// dataType the property is checked whatever type it holds. Returns
// { row, dropped } with the row untyped (the text modes, written with no
// dataType: presence only audits clean, a value draws the value-no-datatype
// warning), or null when the row is not such a row. A text value carries
// over; true/false becomes that literal; a range cannot (untyped rows offer
// no range), nor can any value on a real-number model type (`real`), so
// those become "any value" with `dropped` set. typeRow turns it back.
export function untypeRow(L, r, modelType) {
  if (r.kind !== "property" || r.custom || r.untyped || r.fixed || !r.set || !r.name || !modelType) return null;
  const p = propertiesOf(L.psets, L.S, r.set).find((x) => x.name === r.name);
  if (!p || !p.dataTypes.length || p.dataTypes.includes(String(modelType).toUpperCase())) return null;
  const row = { ...r, untyped: true, dataType: "" };
  delete row.fileType;
  // A real number written with no dataType is where checkers part: this one
  // reads Revit's IFCPOSITIVELENGTHMEASURE(29.99999999999999) mm as 0.03 m
  // and matches "0.03", IfcTester 0.8.0 does not
  // (eval/model-any-type-2026-11-17.md), so only presence carries over.
  const real = (L.S.types[String(modelType).toUpperCase()] && L.S.prim(String(modelType).toUpperCase())) === "double";
  let keep = !r.mode || r.mode === "any" || (!real && (r.mode === "equals" || r.mode === "oneOf" || r.mode === "pattern"));
  if (!real && (r.mode === "true" || r.mode === "false")) { row.mode = "equals"; row.equals = r.mode; keep = true; }
  if (!keep) { row.mode = "any"; row.equals = ""; row.oneOf = []; row.pattern = ""; row.min = ""; row.max = ""; }
  return { row, dropped: !keep, real };
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
  if (f.uri) out.uri = f.uri;
  return out;
}

// A page row for a parsed requirement, when the page can show and edit it
// without changing what it asks; null otherwise.
function editableRow(L, classes, f) {
  const cls = classes[0];
  const r = { ...blankReq(), kind: f.kind, cardinality: f.cardinality, oneOf: [] };
  // A bSDD link rides along unchanged (the page does not edit it).
  if (f.uri) r.uri = f.uri;
  if (f.kind === "property") {
    r.set = simpleOf(f.propertySet); r.name = simpleOf(f.baseName);
    if (!r.set || !r.name) return null;
    if (!commonSets(L, classes).includes(r.set)) {
      // A set of the project's own (Acme_Wall): an editable row when its
      // dataType, if any, is one the page offers.
      if (!ownSetName(r.set) || (f.dataType && !valueTypes(L.S).includes(f.dataType))) return null;
      r.custom = true; r.dataType = f.dataType || "";
    }
    // A standard property with no dataType stays without one (valueChoices,
    // typeRow), with a value or without: a presence-only requirement written
    // with no dataType accepts the property in any type, and the template's
    // dataType would narrow it (Rotterdam's permit checks, bim2sim's window
    // ThermalTransmittance).
    if (!f.dataType && (!r.custom || (f.value && f.value.present))) r.untyped = true;
    // A standard property in a dataType the page would not write for it: the
    // row keeps the file's (templateTypeRow offers the template's).
    if (!r.custom && f.dataType) { const ft = fileTypeOf(L, r.set, r.name, f.dataType); if (ft) r.fileType = ft; }
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
  const v = f.value;
  // A number attribute of an EXPRESS NUMBER type (IfcCountMeasure in IFC2X3
  // and IFC4: BarCount, CountValue) the file restricts on xs:integer: the row
  // keeps that base and asks for whole numbers, so it writes back the same.
  // A checker reads each value against the attribute's own type, so 27 on
  // xs:integer and 27 on xs:double ask for the same thing.
  if (f.kind === "attribute" && v && v.r && v.r.base === "integer" && attributeValueKind(L.S, classes, r.name).base === "xs:double") r.numBase = "xs:integer";
  const ch = valueChoices(L, classes, r);
  if (!v || !v.present) return r;
  if (r.cardinality === "prohibited" || !ch.kind) return null;
  const s = simpleOf(v), en = onlyEnum(v);
  if (s !== null) {
    if (ch.modes.includes("true") && (s === "true" || s === "false")) r.mode = s;
    else if (ch.modes.includes("equals") && (!ch.enumVals || ch.enumVals.includes(s))) { r.mode = "equals"; r.equals = s; }
    else return null;
  } else if (en) {
    if (!ch.modes.includes("oneOf") || (ch.enumVals && !en.every((x) => ch.enumVals.includes(x)))) return null;
    // A number one-of opens as a row only when every listed value is one the
    // row would accept; otherwise the audit's fault is kept as written.
    if (ch.kind === "number" && en.some((x) => numberValueProblem(x, ch.integer))) return null;
    r.mode = "oneOf"; r.oneOf = [...en];
    // A date, time or duration one-of: on its DataTypes base, or on xs:string
    // (the editor wrote that before 2026-11-17; kept so it writes back the same).
    if (ch.temporal && v.r.base === "string") r.oneOfBase = "xs:string";
  } else if (v.r.pattern.length === 1 && !v.r.enumeration.length && R_BOUNDS.every((k) => v.r[k] === undefined)) {
    if (!ch.modes.includes("pattern")) return null;
    r.mode = "pattern"; r.pattern = v.r.pattern[0];
  } else if (!v.r.enumeration.length && !v.r.pattern.length && ["length", "minLength", "maxLength"].every((k) => v.r[k] === undefined)
    && (v.r.minInclusive === undefined || v.r.minExclusive === undefined) && (v.r.maxInclusive === undefined || v.r.maxExclusive === undefined)) {
    // A range: each bound inclusive or exclusive, at most one of each per side.
    if (!ch.modes.includes("range")) return null;
    r.mode = "range"; r.min = v.r.minInclusive ?? v.r.minExclusive ?? ""; r.max = v.r.maxInclusive ?? v.r.maxExclusive ?? "";
    r.minEx = v.r.minExclusive !== undefined; r.maxEx = v.r.maxExclusive !== undefined;
  } else return null;
  return r;
}

// The standard set and property a kept property facet most likely meant,
// when it names a Pset_/Qto_ set the templates lack (Pset_WallComon) or a
// property its set's template lacks (Portugal's Qto_DuctSegmentBaseQuantities
// Lenght, Rotterdam's AkousticRating): { set, name, fromSet, fromName }, or
// null. The audit's nearName picks the name (same letters ignoring case, or
// one slip on a short name, two on a long one; null on a tie), so the page
// offers exactly the audit's "did you mean". A standard set the class cannot
// carry, or a word that is no slip (Mark, Verblijfsruimte), gets none.
export function nameSuggestion(L, classes, f) {
  if (!f || f.kind !== "property") return null;
  const set = simpleOf(f.propertySet), name = simpleOf(f.baseName);
  if (!set || !name) return null;
  const sets = commonSets(L, classes);
  let toSet = set;
  if (!sets.includes(set)) {
    if (!/^(Pset|Qto)_/.test(set) || own(L.psets, set)) return null;
    toSet = nearName(set, sets);
    if (!toSet) return null;
  }
  const props = propertiesOf(L.psets, L.S, toSet).map((p) => p.name);
  const toName = props.includes(name) ? name : nearName(name, props);
  if (!toName || (toSet === set && toName === name)) return null;
  return { set: toSet, name: toName, fromSet: set, fromName: name };
}

// A parsed facet with the suggested set and property names, everything else
// as written.
const renamedFacet = (f, sug) => ({ ...f, propertySet: { present: true, simple: sug.set }, baseName: { present: true, simple: sug.name } });

// A kept requirement with a nameSuggestion: { kind, fixed, rename }, where
// rename.row is the editable row the corrected facet opens as (when the page
// writes it back unchanged bar the names) and rename.fixed the corrected facet
// kept as written otherwise. renameRow() applies it.
function keptRequirement(L, classes, f) {
  const out = { kind: f.kind, fixed: facetFromParsed(f) };
  const sug = nameSuggestion(L, classes, f);
  if (!sug) return out;
  const g = renamedFacet(f, sug);
  const row = editableRow(L, classes, g);
  const ok = row && facetXml(reqFacet(L, row, classes), L.S, true) === facetXml(facetFromParsed(g), L.S, true);
  out.rename = { ...sug, row: ok ? row : null, fixed: facetFromParsed(g) };
  return out;
}

// The rename a requirement row offers: a kept facet's (keptRequirement, set
// when the file was opened), or, on an editable standard row whose property
// its set's template lacks (Rotterdam's AkousticRating written with no
// dataType opens as a row), the audit's nearest name. Null otherwise.
export function renameSuggestion(L, classes, r) {
  if (!r || r.kind !== "property") return null;
  if (r.fixed) return r.rename || null;
  if (r.custom || !r.set || !r.name) return null;
  const props = propertiesOf(L.psets, L.S, r.set).map((p) => p.name);
  if (!props.length || props.includes(r.name)) return null;
  const name = nearName(r.name, props);
  return name ? { set: r.set, name, fromSet: r.set, fromName: r.name } : null;
}

// "Use Length": the row moved to the name renameSuggestion offers, as an
// editable row when it opens as one, the corrected facet kept as written
// otherwise; null when it has none. A row with no dataType keeps none (and
// its value): only the name changes. A typed editable row with a property
// the template lacks does not write back unchanged, so it was kept on open.
export function renameRow(L, classes, r) {
  const sug = renameSuggestion(L, classes, r);
  if (!sug) return null;
  if (r.fixed) return r.rename.row ? { ...r.rename.row } : { kind: r.kind, fixed: r.rename.fixed };
  const row = { ...r, set: sug.set, name: sug.name };
  delete row.fileType;
  return row;
}

// The schema an opened IDS is mostly written for: the one most specifications
// name first (IFC4 on a tie or when none is named).
const vid = (v) => (v.startsWith("IFC4X3") ? "IFC4X3" : v === "IFC4" ? "IFC4" : v === "IFC2X3" ? "IFC2X3" : null);
// The schema ids an ifcVersion list names ("IFC2X3 IFC4" -> IFC2X3, IFC4).
export const schemaIdsOf = (ifcVersion) => [...new Set((ifcVersion || []).map(vid).filter(Boolean))];
export function idsSchema(parsed) {
  const tally = {};
  for (const s of parsed.specs) { const id = s.ifcVersion.map(vid).find(Boolean); if (id) tally[id] = (tally[id] || 0) + 1; }
  return Object.entries(tally).sort((a, b) => b[1] - a[1] || (a[0] === "IFC4" ? -1 : b[0] === "IFC4" ? 1 : 0))[0]?.[0] || "IFC4";
}

// The schemas the page audits a draft against, as the CLI's audit does: the
// page's own, and every one a specification's own ifcVersion names (an
// "IFC2X3 IFC4" specification is valid when either schema has what it asks).
// In the CLI's order (IFC2X3, IFC4, IFC4X3), which decides which schema's
// reason an error names when every schema has one.
export const auditSchemaIds = (doc) => {
  const want = new Set([doc.schema, ...(doc.specs || []).flatMap((s) => schemaIdsOf(s.ifcVersion))]);
  return ["IFC2X3", "IFC4", "IFC4X3"].filter((id) => want.has(id));
};

// The schemas every specification of an opened IDS is written for (a
// specification naming none fits any). The page edits in one schema, so a
// file whose specifications all say "IFC2X3 IFC4" can be opened in either;
// importIds picks the one that leaves the most facets editable. Empty when no
// schema is named by them all; then idsSchema's pick stands.
export function idsSchemaChoices(parsed) {
  let common = null;
  for (const s of parsed.specs) {
    const ids = schemaIdsOf(s.ifcVersion);
    if (!ids.length) continue;
    common = common ? common.filter((x) => ids.includes(x)) : ids;
  }
  return common || [];
}

// An IDS file's text as the editor opens it: the ids.xsd faults with one right
// answer (fix.mjs: IDS 0.9 names, a bare "&", IFC4X3 for IFC4X3_ADD2, children
// out of order, a pattern in another regex dialect) repaired first, so facets
// kept as written are written back valid and patterns mean in every checker
// what their authors wrote (eval/editor-open-repair-2026-11-18.md).
// `parse` is parseIds; the repair is used only when its result parses.
// Returns { text, fixes: [{ code, line, message }], remaining: [structure findings] }.
export function repairOnOpen(text, parse) {
  let fx;
  try { fx = fixStructure(text); } catch { return { text, fixes: [], remaining: [] }; }
  if (fx.error || !fx.fixes.length || fx.text === text) return { text, fixes: [], remaining: fx.error ? [] : fx.remaining };
  try { parse(fx.text); } catch { return { text, fixes: [], remaining: [] }; }
  return { text: fx.text, fixes: fx.fixes, remaining: fx.remaining };
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
  // Several schemas every specification names (IFC2X3 IFC4): open in the one
  // that edits most, the usual pick on a tie. The audit reads each
  // specification in every schema it names, so a standard set IFC4 has and
  // IFC2X3 lacks (Qto_SpaceBaseQuantities) is valid there and editable here.
  const first = idsSchema(parsed);
  const choices = idsSchemaChoices(parsed);
  if (choices.length > 1) {
    const order = [first, "IFC4", "IFC4X3", "IFC2X3"];
    const tried = choices.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((id) => importIdsAs(parsed, loadFor, id));
    const best = tried.reduce((a, b) => (b.rows > a.rows ? b : a));
    return { ...best, schemaRows: Object.fromEntries(tried.map((t) => [t.state.schema, t.rows])) };
  }
  return importIdsAs(parsed, loadFor, first);
}

// importIds in a given schema (eval/multi-version.mjs compares the picks).
export function importIdsAs(parsed, loadFor, schema) {
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
        // Each class whose concrete subclasses are all listed opens with its
        // subclass box ticked (classListBases).
        let cls = null, withSub = false, also = [], alsoSub = [];
        if (up.length === 1) cls = up[0];
        else if (up.length > 1) {
          const bases = classListBases(L.S, up, spec);
          cls = bases[0].cls; withSub = bases[0].withSub;
          also = bases.slice(1).map((b) => b.cls);
          alsoSub = bases.slice(1).filter((b) => b.withSub).map((b) => b.cls);
        }
        const pt = f.predefinedType.present ? simpleOf(f.predefinedType) : "";
        const known = cls && [cls, ...also].every((c) => knownClass(L, c));
        const ptOk = !f.predefinedType.present || (pt && cls && commonPredefinedTypes(L.S, [cls, ...also]).includes(pt));
        if (known && ptOk) {
          spec.cls = cls; spec.also = also; spec.alsoSub = alsoSub; spec.withSub = withSub; spec.predefinedType = pt;
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
      else { spec.reqs.push(keptRequirement(L, specBases(spec), f)); kept++; }
    }
    state.specs.push(spec);
  }
  return { state, kept, rows, dropped, droppedIn };
}
