// ifcJSON reader: turns an ifcJSON model (buildingSMART's ifcJSON-4 draft,
// github.com/buildingSMART/ifcJSON) into the same { schema, entities, errors }
// shape parseStep gives for a STEP file, so the checker runs on it unchanged.
//
// looksLikeJson(text) -> true when the first character is { or [
// ifcJsonSchemaId(text) -> "IFC2X3" | "IFC4" | "IFC4X3" | null, from the
//   header's schemaIdentifier (null when the head names none)
// parseIfcJson(text, schemas) -> { schema, entities: Map<id, {id, type, args}>, errors }
//   text may be the file's bytes (a Uint8Array); schemas is { IFC2X3, IFC4,
//   IFC4X3 } of Schema (ids.mjs): the one the header names, or, with no
//   header, the one that knows the most of the file's class names.
//
// Two flavours are read, both in the ifcJSON repository's own samples
// (eval/ifcjson-twins-2026-11-21.md):
// - IfcOpenShell's ifc2json (file_converters/ifc2json.py): a header
//   ({"type": "ifcJSON", "schemaIdentifier": "IFC4", "data": [...]}), every
//   rooted object at the top of `data`, a reference to one written
//   {"type": "IfcOwnerHistory", "ref": "<uuid>"} (or {"ref": ...} when
//   compact), other entities nested in full where they are used, simple
//   values bare ("name": "Project"), select values {"type": "IfcLabel",
//   "value": "x"}, inverse attributes ("isDefinedBy") listing references.
// - IFC.JAVA's Jackson output (Samples/buildingSMART_TestSet_JAVA): no
//   header, one object at the root, every value wrapped {"type": "IfcLabel",
//   "value": "x"}, a second use of an object written as its bare globalId
//   string, and relationships nested under an inverse attribute
//   ("isDecomposedBy", "containsElements") with their pointer back to the
//   parent left out; that pointer is put back, as for nested ifcXML.
//
// Keys are the schema's attribute names in lowerCamelCase ("globalId",
// "predefinedType"); any case is read. A globalId is written as a UUID
// ("22e66ddf-794d-40bb-8aa5-3dda450d8255") and turned back into IFC's
// 22-character form, so an IDS on GlobalId and the BCF and report keys see
// what the STEP file says. A globalId on a class that has none in the schema
// (the converters add one to owner histories, contexts and shape
// representations so they can be referenced) only identifies the object.
// Derived attributes are marked {derived:true} as a STEP file's * would be.

const U = (s) => String(s).toUpperCase();
const headOf = (text, chars) => (text instanceof Uint8Array ? new TextDecoder().decode(text.subarray(0, chars * 4)) : text).slice(0, chars);

export function looksLikeJson(text) {
  return /^\s*(\uFEFF)?\s*[{[]/.test(headOf(text, 200));
}

const versionIn = (s) => (/IFC4X3|IFC4_3/i.test(s) ? "IFC4X3" : /IFC2X3/i.test(s) ? "IFC2X3" : /IFC4/i.test(s) ? "IFC4" : null);
export function ifcJsonSchemaId(text) {
  const m = headOf(text, 4000).match(/"schemaIdentifiers?"\s*:\s*\[?\s*"([^"]*)"/);
  return m ? versionIn(m[1]) : null;
}

// IFC's GlobalId alphabet: 22 characters of 6 bits, the first carrying the
// top 2 of a UUID's 128 bits.
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
const UUID = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;
export function compressGuid(s) {
  const m = typeof s === "string" && UUID.exec(s);
  if (!m) return s;
  let n = BigInt("0x" + m.slice(1).join(""));
  let out = "";
  for (let i = 0; i < 22; i++) { out = B64[Number(n & 63n)] + out; n >>= 6n; }
  return out;
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keyOf = (o, k) => { for (const x of Object.keys(o)) if (x.toLowerCase() === k) return o[x]; return undefined; };
const typeKey = (o) => (typeof o.type === "string" ? o.type : undefined);
const guidKey = (o) => { const g = keyOf(o, "globalid"); return typeof g === "string" ? g : isObj(g) && typeof g.value === "string" ? g.value : undefined; };

export function parseIfcJson(text, schemas) {
  const errors = [];
  const src = text instanceof Uint8Array ? new TextDecoder().decode(text) : text;
  let doc;
  try {
    doc = JSON.parse(src.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { schema: null, entities: new Map(), errors: [`not valid JSON: ${e.message}`] };
  }
  let data, named = null;
  if (Array.isArray(doc)) data = doc;
  else if (isObj(doc) && Array.isArray(doc.data)) {
    data = doc.data;
    const sid = doc.schemaIdentifier ?? doc.schemaIdentifiers ?? doc.fileSchema;
    named = versionIn(Array.isArray(sid) ? sid.join(" ") : String(sid ?? ""));
  } else if (isObj(doc) && typeKey(doc)) data = [doc];
  else return { schema: null, entities: new Map(), errors: ["no ifcJSON objects found (expected a `data` list, a list, or one object with a `type`)"] };

  // Pass 1: every object with a class name and a globalId, so a reference to
  // it (a {"ref"} object or a bare id string) can be resolved wherever it is,
  // before or after the object itself; and the class names in the file.
  const names = new Set();
  const byGuid = new Map();
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!isObj(v)) return;
    const t = typeKey(v);
    if (t) names.add(U(t));
    const g = guidKey(v);
    if (t && g !== undefined && v.ref === undefined && !byGuid.has(g)) byGuid.set(g, v);
    for (const k of Object.keys(v)) if (k !== "type") walk(v[k]);
  };
  walk(data);

  // The schema: the header's, else the one knowing most of the class names
  // (IFC4 on a tie: it is the version ifcJSON's samples are mostly in).
  let id = named && schemas[named] ? named : null;
  if (!id) {
    let best = null, bestMiss = Infinity;
    for (const k of ["IFC4", "IFC4X3", "IFC2X3"]) {
      const s = schemas[k];
      if (!s) continue;
      let miss = 0;
      for (const n of names) if (!s.entities[n] && !s.types[n]) miss++;
      if (miss < bestMiss) { best = k; bestMiss = miss; }
    }
    id = best;
    if (id) errors.push(`no schemaIdentifier in the file; read as ${id}${bestMiss ? ` (${bestMiss} class name(s) it does not know)` : ""}`);
  }
  if (!id) return { schema: null, entities: new Map(), errors: [...errors, "no IFC schema to read the file with"] };
  const schema = schemas[id];

  const entities = new Map();
  let next = 1;
  const guidIds = new Map(); // json globalId -> entity number
  for (const g of byGuid.keys()) if (schema.entities[U(typeKey(byGuid.get(g)))]) guidIds.set(g, next++);
  const backrefs = []; // [relationship id, attribute, parent id]
  const noted = new Set();
  const noteOnce = (key, msg) => { if (!noted.has(key)) { noted.add(key); errors.push(msg); } };
  const unresolved = new Set();
  const cons = new Map(); // class + values -> entity number, for objects with no globalId
  const hasBack = new Set(); // objects a nested relationship points back to: never merged

  const entityName = (t) => (t && schema.entities[U(t)] ? U(t) : null);
  const definedName = (t) => (t && schema.types[U(t)] ? U(t) : null);
  const itemType = (t) => {
    for (let g = 0; g < 20 && t && schema.types[t]; g++) {
      if (schema.types[t].kind === "aggregate") return schema.types[t].of;
      t = schema.types[t].of;
    }
    return t;
  };
  // A select (or an entity) that a bare string may point into.
  const mayRef = (t) => { const p = schema.prim(t); return p === "entity" || p === "select" || p === "unknown"; };

  // A JSON scalar read as the given type name.
  function cast(v, typeName) {
    const prim = schema.prim(typeName);
    if (v === null || v === undefined) return null;
    switch (prim) {
      case "double":
      case "integer": {
        if (typeof v === "number") return v;
        const n = Number(v);
        return typeof v === "string" && v.trim() !== "" && !Number.isNaN(n) ? n : v;
      }
      case "boolean":
        return typeof v === "boolean" ? v : /^(true|t)$/i.test(v) ? true : /^(false|f)$/i.test(v) ? false : v;
      case "logical":
        return typeof v === "boolean" ? v : /^(true|t)$/i.test(v) ? true : /^(false|f)$/i.test(v) ? false : { unknown: true };
      case "enum":
        return { enum: U(v).replace(/^\.|\.$/g, "") };
      case "binary":
        return { binary: String(v) };
      case "aggregate":
        return Array.isArray(v) ? v.map((x) => value(x, itemType(typeName))) : v;
      default:
        return v;
    }
  }

  // A value of the declared type (an item type when the attribute is a list).
  function value(v, declared, inner = false) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) {
      const of = inner || schema.prim(declared) !== "aggregate" ? declared : itemType(declared);
      return v.map((x) => value(x, of, Array.isArray(x)));
    }
    if (isObj(v)) {
      if (v.ref !== undefined) return ref(String(v.ref), v);
      const t = typeKey(v);
      const ent = entityName(t);
      if (ent && !mayRef(declared) && schema.prim(declared) !== "aggregate") {
        // An entity where the schema wants plain values: IFC.JAVA writes an
        // IfcCartesianPointList3D's coordList as IfcCartesianPoint objects.
        // The row is the object's one list.
        const lists = Object.keys(v).filter((k) => Array.isArray(v[k]));
        if (lists.length === 1) return value(v[lists[0]], declared, true);
        noteOnce("ent-in:" + ent, `a ${ent} object where ${declared} values belong; left out`);
        return null;
      }
      if (ent) return { ref: entity(v, ent) };
      const def = definedName(t);
      const raw = v.value !== undefined ? v.value : Object.keys(v).filter((k) => k !== "type").map((k) => v[k])[0];
      if (def) {
        // A wrapper with no value around a string type: IFC.JAVA leaves an
        // empty string out ({"type": "IfcLabel"} for STEP's '').
        if (raw === undefined) return schema.prim(def) === "string" ? (schema.prim(declared) === "select" ? { typed: def, value: "" } : "") : null;
        const kind = schema.prim(declared);
        // A select keeps which defined type the value is, as STEP's
        // IFCLABEL('x') does; any other attribute just takes the value.
        if (kind === "select" || kind === "unknown") return { typed: def, value: Array.isArray(raw) ? raw.map((x) => cast(isObj(x) ? x.value : x, itemType(def))) : cast(raw, def) };
        return Array.isArray(raw) ? raw.map((x) => value(x, itemType(def))) : cast(raw, declared);
      }
      // An object with no class name, where the attribute's class is an
      // entity: an instance of that class (IFC.JAVA writes an owner
      // history's owningApplication and a project's unitsInContext so).
      if (!t && entityName(declared) && !schema.entities[entityName(declared)].abstract) return { ref: entity(v, entityName(declared)) };
      if (t) noteOnce("type:" + t, `"${t}" is not a class or type in ${id}; its value read as written`);
      return raw === undefined ? null : cast(raw, declared);
    }
    if (typeof v === "string" && mayRef(declared) && byGuid.has(v)) return ref(v, null);
    return cast(v, declared);
  }

  function ref(g, obj) {
    const n = guidIds.get(g);
    if (n !== undefined) return { ref: n };
    // A reference to an object the file does not hold: kept as a reference
    // to nothing, as a STEP #N with no line is, and said once.
    unresolved.add(g);
    if (obj && entityName(typeKey(obj))) {
      const k = next++;
      guidIds.set(g, k);
      return { ref: k };
    }
    return null;
  }

  function inverseOf(type, key) {
    const lower = key.toLowerCase();
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) {
      const f = schema.entities[t].inverseFor;
      if (!f) continue;
      for (const k of Object.keys(f)) if (k.toLowerCase() === lower) return f[k];
    }
    return null;
  }

  function derivedOf(type, key) {
    const lower = key.toLowerCase();
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) {
      for (const d of schema.entities[t].ownDerived || []) if (d.toLowerCase() === lower) return true;
    }
    return false;
  }

  // Builds an entity from an object; returns its number.
  function entity(o, type) {
    const g = guidKey(o);
    const known = g !== undefined ? guidIds.get(g) : undefined;
    let id1;
    if (known !== undefined) {
      // A second full copy of an object already read keeps the first.
      if (entities.has(known)) return known;
      id1 = known;
    } else id1 = next++;
    const attrs = schema.attrs(type);
    const args = attrs.map((a) => (a.derived ? { derived: true } : null));
    const rec = { id: id1, type, args };
    entities.set(id1, rec);
    const lowerIndex = new Map(attrs.map((a, i) => [a.name.toLowerCase(), i]));
    for (const k of Object.keys(o)) {
      if (k === "type" || k === "ref") continue;
      const lower = k.toLowerCase();
      const i = lowerIndex.get(lower);
      const v = o[k];
      if (i !== undefined) {
        const a = attrs[i];
        if (a.derived) continue;
        if (lower === "globalid") { args[i] = compressGuid(isObj(v) ? v.value : v); continue; }
        if (a.aggregate && v !== null && !Array.isArray(v)) args[i] = [value(v, a.type)];
        else args[i] = value(v, a.type, !!a.aggregate);
        continue;
      }
      if (lower === "globalid") continue; // an id the converter gave, not an attribute
      const inv = inverseOf(type, k);
      if (inv) {
        // Relationships nested (or referenced) under an inverse attribute:
        // each is read, and its pointer back to this object put back.
        for (const r of Array.isArray(v) ? v : [v]) {
          const rv = value(r, inv[0]);
          if (rv && rv.ref !== undefined) { backrefs.push([rv.ref, inv[1], id1]); hasBack.add(id1); }
        }
        continue;
      }
      // A derived attribute (IfcBooleanResult.Dim, IfcBSplineCurve.ControlPoints)
      // is computed, not stored: a writer that serialises it is not wrong.
      if (derivedOf(type, k)) continue;
      noteOnce(type + "." + k, `${type} has no attribute "${k}" in ${id}; left out`);
    }
    // An object with no globalId is written in full at each use, where a
    // STEP file writes one line and points at it: identical ones (same class,
    // same values, same targets) are one entity, so a specification that
    // applies to every entity counts what the STEP twin counts.
    if (g === undefined && !hasBack.has(id1)) {
      const key = type + JSON.stringify(args);
      const same = cons.get(key);
      if (same !== undefined) { entities.delete(id1); return same; }
      cons.set(key, id1);
    }
    return id1;
  }

  // Every top-level object, in file order; then each one only referenced by
  // globalId (a body nested somewhere a walk from the top did not reach is
  // still read).
  for (const o of data) {
    if (!isObj(o)) continue;
    const t = entityName(typeKey(o));
    if (t) entity(o, t);
    else if (typeKey(o)) noteOnce("type:" + typeKey(o), `"${typeKey(o)}" is not a class in ${id}; left out`);
  }
  for (const [g, o] of byGuid) {
    const n = guidIds.get(g);
    const t = entityName(typeKey(o));
    if (t && n !== undefined && !entities.has(n)) entity(o, t);
  }

  for (const [rid, attr, pid] of backrefs) {
    const r = entities.get(rid);
    if (!r) continue;
    const as = schema.attrs(r.type);
    const i = as.index.get(attr);
    if (i === undefined) continue;
    if (as[i].aggregate) {
      const list = Array.isArray(r.args[i]) ? r.args[i] : (r.args[i] = []);
      if (!list.some((x) => x && x.ref === pid)) list.push({ ref: pid });
    } else if (!r.args[i] || r.args[i].ref === undefined) r.args[i] = { ref: pid };
  }
  for (const g of unresolved) if (!byGuid.has(g)) errors.push(`reference "${g}" points at no object in the file`);
  return { schema: id, entities, errors };
}
