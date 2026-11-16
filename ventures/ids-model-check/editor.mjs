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
//   { min: "1", max: "9" } (either may be absent; inclusive)
// Returns "" for no restriction.
function valueXml(v, base) {
  if (!v) return "";
  if (v.equals !== undefined && v.equals !== "") return `<simpleValue>${escText(v.equals)}</simpleValue>`;
  const parts = [];
  if (v.oneOf && v.oneOf.length) for (const x of v.oneOf) parts.push(`<xs:enumeration value="${escAttr(x)}"/>`);
  else if (v.pattern) parts.push(`<xs:pattern value="${escAttr(v.pattern)}"/>`);
  else {
    if (v.min !== undefined && v.min !== "") parts.push(`<xs:minInclusive value="${escAttr(v.min)}"/>`);
    if (v.max !== undefined && v.max !== "") parts.push(`<xs:maxInclusive value="${escAttr(v.max)}"/>`);
  }
  if (!parts.length) return "";
  return `<xs:restriction base="${base}">${parts.join("")}</xs:restriction>`;
}

const nameValue = (names) => (names.length === 1 ? `<simpleValue>${escText(names[0])}</simpleValue>` : `<xs:restriction base="xs:string">${names.map((n) => `<xs:enumeration value="${escAttr(n)}"/>`).join("")}</xs:restriction>`);

function cardinalityAttr(c) {
  return c && c !== "required" ? ` cardinality="${c}"` : "";
}

// One facet. Facet shapes:
//   { kind: "entity", names: [...], predefinedType }
//   { kind: "property", set, name, dataType, value, cardinality }
//   { kind: "attribute", name, value, cardinality }
//   { kind: "classification", system, value, cardinality }
//   { kind: "material", value, cardinality }
//   { kind: "partOf", relation, entity, cardinality }
function facetXml(f, S, inRequirements) {
  const card = inRequirements ? cardinalityAttr(f.cardinality) : "";
  if (f.kind === "entity") {
    const pt = f.predefinedType ? `<predefinedType><simpleValue>${escText(f.predefinedType)}</simpleValue></predefinedType>` : "";
    return `<entity><name>${nameValue(f.names)}</name>${pt}</entity>`;
  }
  if (f.kind === "property") {
    const dt = f.dataType ? ` dataType="${escAttr(f.dataType)}"` : "";
    const v = valueXml(f.value, xsBase(S, f.dataType));
    return `<property${dt}${card}><propertySet><simpleValue>${escText(f.set)}</simpleValue></propertySet><baseName><simpleValue>${escText(f.name)}</simpleValue></baseName>${v ? `<value>${v}</value>` : ""}</property>`;
  }
  if (f.kind === "attribute") {
    const v = valueXml(f.value, "xs:string");
    return `<attribute${card}><name><simpleValue>${escText(f.name)}</simpleValue></name>${v ? `<value>${v}</value>` : ""}</attribute>`;
  }
  if (f.kind === "classification") {
    const v = valueXml(f.value, "xs:string");
    const sys = f.system ? `<system><simpleValue>${escText(f.system)}</simpleValue></system>` : "";
    return `<classification${card}>${v ? `<value>${v}</value>` : ""}${sys}</classification>`;
  }
  if (f.kind === "material") {
    const v = valueXml(f.value, "xs:string");
    return v ? `<material${card}><value>${v}</value></material>` : `<material${card}/>`;
  }
  if (f.kind === "partOf") {
    const rel = f.relation ? ` relation="${escAttr(f.relation)}"` : "";
    return `<partOf${rel}${card}><entity><name><simpleValue>${escText(f.entity)}</simpleValue></name></entity></partOf>`;
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
  if (doc.description) lines.push(`${ind(2)}<description>${escText(doc.description)}</description>`);
  if (doc.date) lines.push(`${ind(2)}<date>${escText(doc.date)}</date>`);
  lines.push(`${ind(1)}</info>`, `${ind(1)}<specifications>`);
  for (const s of doc.specs || []) {
    let attrs = ` name="${escAttr(s.name || "Unnamed specification")}" ifcVersion="${ver}"`;
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
      lines.push(`${ind(3)}<requirements>`);
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
