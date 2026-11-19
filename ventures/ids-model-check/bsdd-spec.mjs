// An IDS specification from a bSDD class and its property list.
//
// bSDD (the buildingSMART Data Dictionary) publishes, for each class, the
// properties an object of that class carries: the property set, the code,
// the data type, whether it is required, and allowed values or bounds. An
// IDS author today copies those rows by hand into an IDS editor, which is
// how the slips eval/bsdd-links-2026-11-19.md found get in (a link pasted
// from the next row, a dataType the dictionary does not give).
//
// specFromBsddClass(cls, { schema, sets }) turns one class answer of
// GET /api/Class/v1?Uri=...&IncludeClassProperties=true into the spec shape
// editor.mjs buildIds() writes:
//   applicability: the IFC entity (an IFC-dictionary class is itself an
//     entity, with its predefined type when the code carries one; another
//     dictionary's class names its relatedIfcEntityNames) and, for a class
//     outside IFC, a classification facet with the dictionary as system and
//     the class code as value;
//   requirements: that classification again with the class's uri (ids.xsd
//     allows uri only on requirement facets), then one property facet per
//     class property with propertySet, baseName = the property code, the
//     property's dictionary uri, a dataType, the allowed values or bounds,
//     and cardinality required when bSDD says isRequired, optional otherwise
//     (optional in IDS: if the property is there, it must fit). Properties in
//     bSDD's pseudo-set "Attributes" are IFC attributes and become attribute
//     facets (which carry no uri in IDS 1.0).
// It returns { spec, notes }: notes say what could not be carried over.
//
// fetchBsddClass(uri, { fetch }) makes the one GET (bsdd.mjs's getJson, with
// its 429 retry); bsddIds(uris, opts) builds a whole IDS document from
// several classes, looking up the IFC dictionary's property entry where a
// class property names an IFC property without the IFC type in its text.

import { getJson, BSDD_API } from "./bsdd.mjs";

const IFC_DICT = /^https:\/\/identifier\.buildingsmart\.org\/uri\/buildingsmart\/ifc\/([\d.]+)$/i;
const IFC_VERSION_OF = { "4.3": "IFC4X3_ADD2", "4.0": "IFC4", "2.3": "IFC2X3" };

// bSDD's data types and the IFC type a facet asks for when the dictionary
// names no IFC type. Real becomes IFCREAL: a measure needs a unit, and bSDD's
// own units are not mapped here (see notes).
const BSDD_TO_IFC = { boolean: "IFCBOOLEAN", character: "IFCLABEL", string: "IFCLABEL", integer: "IFCINTEGER", real: "IFCREAL", time: "IFCDATETIME" };

// "in IFC this property takes 'IfcBoolean' as value" -- the IFC dictionary's
// note naming the exact type.
export const ifcTypeIn = (text) => {
  const m = /takes '(Ifc\w+)' as value/.exec(text || "");
  return m ? m[1].toUpperCase() : null;
};

export function isIfcDictionary(uri) {
  return IFC_DICT.test(String(uri || "").replace(/\/$/, ""));
}

// The IFC entity (and predefined type) an IFC-dictionary class code names:
// IfcWall -> IFCWALL; IfcWallSHEAR (parent IfcWall) -> IFCWALL + SHEAR.
export function ifcEntityOf(cls, schema) {
  const code = String(cls.code || "");
  const up = code.toUpperCase();
  if (!schema || schema.has(up)) return { entity: up, predefinedType: null };
  const parent = cls.parentClassReference && cls.parentClassReference.code;
  if (parent && code.startsWith(parent) && code.length > parent.length && schema.has(parent.toUpperCase())) {
    return { entity: parent.toUpperCase(), predefinedType: code.slice(parent.length) };
  }
  return null;
}

// The value restriction of a class property, in buildIds' value shapes.
function valueOf(p, notes, label) {
  const allowed = (p.allowedValues || []).map((a) => (a.value ?? a.code)).filter((x) => x !== undefined && x !== null && x !== "");
  const bounds = { minInclusive: p.minInclusive, maxInclusive: p.maxInclusive, minExclusive: p.minExclusive, maxExclusive: p.maxExclusive };
  const hasBounds = Object.values(bounds).some((x) => x !== undefined && x !== null);
  // Many dictionaries answer predefinedValue "None" for no value (165 of 170
  // in eval/bsdd-spec-2026-11-19.md, on Real and Boolean properties too); a
  // value outside the property's own allowed values is not one either.
  let pre = p.predefinedValue;
  if (pre === "None" || (pre !== undefined && pre !== null && allowed.length && !allowed.map(String).includes(String(pre)))) {
    if (pre !== "None") notes.push(`${label}: predefinedValue "${pre}" is not among its allowed values; left out`);
    pre = null;
  }
  if (pre !== undefined && pre !== null && pre !== "") {
    if (hasBounds || p.pattern) notes.push(`${label}: predefinedValue "${pre}" written; the bounds or pattern next to it left out`);
    return { equals: String(pre) };
  }
  if (allowed.length) {
    if (hasBounds || p.pattern) notes.push(`${label}: allowed values written; bounds or a pattern next to them left out (IDS takes one restriction per value)`);
    return allowed.length === 1 ? { equals: String(allowed[0]) } : { oneOf: [...new Set(allowed.map(String))] };
  }
  if (hasBounds || p.pattern) {
    const r = { enumeration: [], pattern: p.pattern ? [p.pattern] : [] };
    for (const [k, v] of Object.entries(bounds)) if (v !== undefined && v !== null) r[k] = String(v);
    return { r };
  }
  return null;
}

// The IFC data type for a class property: the IFC dictionary's note on the
// class property, then on the property entry (ifcTypes, looked up by the
// caller), then bSDD's data type.
// A standard set's template (psets-*.json) wins over all of them: it is what
// the audit holds a facet to, and bSDD's IFC class lists leave the type note
// off quantities and some text properties (eval/bsdd-spec-2026-11-19.md).
function templateTypes(psets, schema, set, name) {
  const t = psets && Object.hasOwn(psets, set) && Object.hasOwn(psets[set].props, name) ? psets[set].props[name] : null;
  if (!t) return null;
  const types = (t.types || (t.type ? [t.type] : [])).filter((x) => !schema || schema.types[x]);
  return types.length ? types : null;
}

function dataTypeOf(p, ifcTypes, schema) {
  const own = ifcTypeIn(p.description);
  if (own && (!schema || schema.prim(own) !== "unknown")) return own;
  const looked = ifcTypes && ifcTypes.get(String(p.propertyUri || "").toLowerCase());
  if (looked && (!schema || schema.prim(looked) !== "unknown")) return looked;
  return BSDD_TO_IFC[String(p.dataType || "").toLowerCase()] || null;
}

export function specFromBsddClass(cls, { schema = null, psets = null, sets = null, ifcTypes = null, dictionaryName = null } = {}) {
  const notes = [];
  const ifc = isIfcDictionary(cls.dictionaryUri);
  const applicability = [];
  const requirements = [];
  if (ifc) {
    const e = ifcEntityOf(cls, schema);
    if (!e) notes.push(`${cls.code}: not an entity of the chosen IFC schema; no entity facet`);
    else applicability.push({ kind: "entity", names: [e.entity], predefinedType: e.predefinedType });
  } else {
    const related = (cls.relatedIfcEntityNames || []).map((x) => String(x).toUpperCase());
    const known = schema ? related.filter((x) => schema.has(x)) : related;
    for (const x of related) if (!known.includes(x)) notes.push(`${cls.code}: related IFC entity ${x} is not in the chosen IFC schema; left out`);
    if (known.length) applicability.push({ kind: "entity", names: known });
    const system = dictionaryName || cls.dictionaryName || cls.dictionaryUri;
    const value = cls.referenceCode || cls.code;
    applicability.push({ kind: "classification", system, value: { equals: value } });
    requirements.push({ kind: "classification", system, value: { equals: value }, uri: cls.uri, cardinality: "required" });
  }
  const props = (cls.classProperties || []).filter((p) => !sets || sets.includes(p.propertySet));
  const seen = new Set();
  for (const p of props) {
    const label = `${p.propertySet || "(no set)"}.${p.propertyCode || p.name}`;
    if (p.propertyStatus === "Inactive") { notes.push(`${label}: Inactive in bSDD; left out`); continue; }
    // An IfcComplexProperty: IDS 1.0 has no facet that reaches inside one.
    if (p.propertyValueKind === "Complex" || p.propertyValueKind === "ComplexList") { notes.push(`${label}: a complex property (value kind ${p.propertyValueKind}), which an IDS 1.0 facet cannot check; left out`); continue; }
    if (!String(p.propertyCode || "").trim()) { notes.push(`${label}: no property code in bSDD; left out`); continue; }
    const key = `${p.propertySet}\u0000${p.propertyCode}`;
    if (seen.has(key)) { notes.push(`${label}: listed twice in the class; written once`); continue; }
    seen.add(key);
    const cardinality = p.isRequired ? "required" : "optional";
    const value = valueOf(p, notes, label);
    if (p.propertySet === "Attributes") {
      // Only attributes every applicable entity has (bSDD's IFC classes list
      // ElementType, an attribute of the type objects, on IfcWall itself).
      const ents = (applicability.find((f) => f.kind === "entity") || { names: [] }).names;
      const missing = schema ? ents.filter((e) => !schema.attrs(e).some((a) => a.name === p.propertyCode && !a.derived)) : [];
      if (missing.length) { notes.push(`${label}: ${missing.join(", ")} has no explicit attribute ${p.propertyCode}; left out`); continue; }
      const a = { kind: "attribute", name: p.propertyCode, cardinality };
      if (value) a.value = value;
      requirements.push(a);
      continue;
    }
    if (!p.propertySet) {
      // ids.xsd needs a propertySet; bSDD lets a dictionary leave it out. The
      // dictionary's own name is the convention bSDD's IFC mapping documents
      // for such properties.
      notes.push(`${label}: no property set in bSDD; written in set "${dictionaryName || cls.dictionaryName || "bSDD"}"`);
    }
    // A set named as a pattern (Dura Vermeer's "Pset_.*Common"): written as
    // an xs:pattern, which is what such a name can only mean.
    const setName = p.propertySet || dictionaryName || cls.dictionaryName || "bSDD";
    const f = {
      kind: "property",
      set: /\.[*+]|[\[\]()|\\]/.test(setName) ? { pattern: setName } : setName,
      name: p.propertyCode || p.name,
      dataType: null,
      cardinality,
      uri: p.propertyUri || undefined,
    };
    const fromBsdd = dataTypeOf(p, ifcTypes, schema);
    const tpl = typeof f.set === "string" ? templateTypes(psets, schema, f.set, f.name) : null;
    f.dataType = tpl ? (tpl.includes(fromBsdd) ? fromBsdd : tpl[0]) : fromBsdd;
    const named = ifcTypeIn(p.description);
    if (tpl && named && !tpl.includes(named)) notes.push(`${label}: bSDD names ${named}, the IFC templates ${tpl.join(" or ")}; the template's written`);
    if (!f.dataType) notes.push(`${label}: bSDD data type "${p.dataType ?? ""}" has no IFC counterpart; no dataType`);
    if (value) f.value = value;
    if (p.propertyValueKind && p.propertyValueKind !== "Single") notes.push(`${label}: value kind ${p.propertyValueKind}; written as a plain property facet (IDS 1.0 has no bounded, list or table value)`);
    requirements.push(f);
  }
  const what = ifc ? cls.code : `${cls.name || cls.code}`;
  const spec = {
    name: what,
    description: cls.definition ? String(cls.definition).replace(/\s+/g, " ").slice(0, 500) : undefined,
    instructions: `Generated from bSDD ${cls.uri}`,
    optionality: "optional",
    applicability,
    requirements,
  };
  return { spec, notes };
}

export async function fetchBsddClass(uri, { fetch: fetchFn = globalThis.fetch, api = BSDD_API, wait } = {}) {
  return getJson(fetchFn, `${api.replace(/\/$/, "")}/api/Class/v1?Uri=${encodeURIComponent(uri)}&IncludeClassProperties=true`, wait);
}

// A whole IDS document from bSDD classes. opts: { fetch, schema (a Schema),
// schemaId ("IFC4X3"), sets, title }. The IFC version is the one the IFC
// dictionary's version names when a class is in it, else opts.schemaId.
export async function bsddIds(uris, opts = {}) {
  const { buildIds } = await import("./editor.mjs");
  const fetchFn = opts.fetch || globalThis.fetch;
  const api = opts.api || BSDD_API;
  const notes = [];
  const specs = [];
  const dictNames = new Map();
  const ifcTypes = new Map();
  for (const uri of uris) {
    const r = await fetchBsddClass(uri, { fetch: fetchFn, api, wait: opts.wait });
    if (r.notFound) { notes.push(`${uri}: bSDD has no class here`); continue; }
    if (r.failed) { notes.push(`${uri}: bSDD did not answer (${r.failed})`); continue; }
    const cls = r.json;
    if (!isIfcDictionary(cls.dictionaryUri) && cls.dictionaryUri && !dictNames.has(cls.dictionaryUri)) {
      const d = await getJson(fetchFn, `${api}/api/Dictionary/v1?Uri=${encodeURIComponent(cls.dictionaryUri)}`, opts.wait);
      dictNames.set(cls.dictionaryUri, (d.json && d.json.dictionaries && d.json.dictionaries[0] && d.json.dictionaries[0].name) || null);
    }
    // IFC properties a class lists without the IFC dictionary's type note
    // (another dictionary's class reusing IFC's Name or FireRating): ask the
    // IFC dictionary once per property.
    for (const p of cls.classProperties || []) {
      const pu = String(p.propertyUri || "");
      if (p.propertySet === "Attributes" || ifcTypeIn(p.description) || !isIfcDictionary(p.propertyDictionaryUri) || ifcTypes.has(pu.toLowerCase())) continue;
      const e = await getJson(fetchFn, `${api}/api/Property/v5?Uri=${encodeURIComponent(pu)}`, opts.wait);
      ifcTypes.set(pu.toLowerCase(), e.json ? ifcTypeIn(e.json.description) : null);
    }
    const m = IFC_DICT.exec(String(cls.dictionaryUri || "").replace(/\/$/, ""));
    const version = m ? IFC_VERSION_OF[m[1]] : null;
    const schema = opts.schemas ? opts.schemas[version ? version.replace("_ADD2", "") : opts.schemaId || "IFC4X3"] : opts.schema || null;
    const sid = version ? version.replace("_ADD2", "") : opts.schemaId || "IFC4X3";
    const psets = opts.psets ? opts.psets[sid] : null;
    const { spec, notes: n } = specFromBsddClass(cls, { schema, psets, sets: opts.sets, ifcTypes, dictionaryName: dictNames.get(cls.dictionaryUri) });
    spec.ifcVersion = [version || (opts.schemaId === "IFC4" ? "IFC4" : opts.schemaId === "IFC2X3" ? "IFC2X3" : "IFC4X3_ADD2")];
    specs.push(spec);
    notes.push(...n.map((x) => `${uri}: ${x}`));
  }
  const title = opts.title || (specs.length === 1 ? `${specs[0].name} (from bSDD)` : `${specs.length} bSDD classes`);
  return { text: buildIds({ title, schema: "IFC4X3", specs }, opts.schema || (opts.schemas && opts.schemas.IFC4X3)), specs, notes };
}
