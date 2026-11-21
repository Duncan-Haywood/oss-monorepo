// IFC5 reader: turns an IFC5 alpha model (.ifcx, buildingSMART's
// github.com/buildingSMART/IFC5-development) into the same
// { schema, entities, errors } shape parseStep gives for a STEP file, so the
// IDS checker runs on it unchanged.
//
// looksLikeIfcx(text) -> true when the head carries "ifcxVersion", or a
//   "data" list whose objects have a "path"
// parseIfcx(texts, schema, psets) -> { schema: "IFC4X3", entities, errors }
//   texts is one file (string or Uint8Array) or a list of layers, weakest
//   first (hello-wall.ifcx, then hello-wall-add-fire-rating-30.ifcx);
//   schema is the IFC4X3 Schema (ids.mjs); psets is schema/psets-ifc4x3.json
//   (or null: then every property lands in a set named after its namespace).
//
// An IFC5 file is a list of nodes, each `{path, children?, inherits?,
// attributes?}`; many nodes may speak about one path and a later one wins
// (in one file, and across layers). Composition, as the format's own
// description puts it (IFC5-development, src/ifcx-core/composition):
// - children: name -> path (null removes the child);
// - inherits: name -> path (null removes it): the target's attributes and
//   children are the node's too, its own attributes winning; a type object
//   ("TypeProduct", "windowType") and a material are inherited so;
// - attributes: namespaced keys. Read here:
//     bsi::ifc::class         {code, uri}: the IFC class. A code past the
//                             class name is its predefined type
//                             ("IfcRailwayPartTRACK" = IfcRailwayPart, TRACK)
//     <ns>::prop::<Name>      a property's value (bsi::ifc::prop::IsExternal)
//     <ns>::class             {code, uri}: a classification reference
//                             (nlsfb::class), its system named <ns>
//     bsi::ifc::material      {code, uri}: a material (its code is the name),
//                             the object's own or on its unclassed parts
//     bsi::ifc::system::partofsystem  [{ref}]: the systems an element is
//                             assigned to (IfcRelAssignsToGroup, which an
//                             IDS partOf relation="IFCRELASSIGNSTOGROUP" reads)
//     bsi::ifc::system::servicesfacility  [{ref}] on a system: the spatial
//                             structure it serves (IfcRelServicesBuildings)
//     bsi::ifc::system::connectsto  [{ref}] on a port: the port it connects
//                             to (IfcRelConnectsPorts, one per pair)
//     bsi::ifc::system::flowdirection  a port's FlowDirection (SOURCE, SINK,
//                             SOURCEANDSINK, NOTDEFINED)
//   A system or other group is not placed in the spatial tree (in STEP an
//   IfcSystem is assigned, not aggregated or contained).
//   Geometry (usd::*), presentation and the rest are not read: no IDS
//   facet asks about them.
//
// What STEP says that IFC5 leaves out is put back as the checker expects it:
// - an object's GlobalId is its path, a UUID, in IFC's 22-character form
//   (the converter keeps the STEP GlobalId so: 93791d5d-5beb-437b-b8ec-
//   2f1f0ba4bf3b is hello-wall's wall 2JUHrTM_j3UxZiBnyBfByx);
// - its Name is the name its parent gives it in `children`;
// - the spatial tree: a classed node under a classed node is aggregated by it
//   (spatial in spatial, element in element), nests in it (a port on its
//   element, an alignment's layouts and segments), contained in it (element
//   in a spatial structure), voids it (an opening), or fills it (a door or window
//   in an opening). A door or window placed straight under a wall (the
//   converter drops the opening) is contained where the wall is, as in the
//   STEP twin;
// - properties are grouped into the standard set whose template names them
//   for the class (IsExternal on an IfcWall: Pset_WallCommon; Height on an
//   IfcWall: Qto_WallBaseQuantities, a quantity), else into one set named
//   after the namespace ("bsi::ifc::prop"), and typed by the template, else
//   by the JSON value (true: IfcBoolean, 3: IfcInteger, 3.5: IfcReal,
//   "x": IfcLabel). IFC5 values are SI, which is what a STEP file with no
//   unit assignment is read in.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const headOf = (text, chars) => (text instanceof Uint8Array ? new TextDecoder().decode(text.subarray(0, chars * 4)) : String(text)).slice(0, chars);

export function looksLikeIfcx(text) {
  const h = headOf(text, 4000);
  if (!/^\s*(\uFEFF)?\s*\{/.test(h)) return false;
  return /"ifcxVersion"\s*:/.test(h) || /"data"\s*:\s*\[\s*\{\s*"path"\s*:/.test(h);
}

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
const UUID = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;
const IFCGUID = /^[0-3][0-9A-Za-z_$]{21}$/;
export function guidOfPath(p) {
  const m = UUID.exec(p);
  if (!m) return null;
  let n = BigInt("0x" + m.slice(1).join(""));
  let out = "";
  for (let i = 0; i < 22; i++) { out = B64[Number(n & 63n)] + out; n >>= 6n; }
  return out;
}

const QUANTITY = {
  IFCLENGTHMEASURE: ["IFCQUANTITYLENGTH", "LengthValue"],
  IFCPOSITIVELENGTHMEASURE: ["IFCQUANTITYLENGTH", "LengthValue"],
  IFCNONNEGATIVELENGTHMEASURE: ["IFCQUANTITYLENGTH", "LengthValue"],
  IFCAREAMEASURE: ["IFCQUANTITYAREA", "AreaValue"],
  IFCVOLUMEMEASURE: ["IFCQUANTITYVOLUME", "VolumeValue"],
  IFCMASSMEASURE: ["IFCQUANTITYWEIGHT", "WeightValue"],
  IFCCOUNTMEASURE: ["IFCQUANTITYCOUNT", "CountValue"],
  IFCTIMEMEASURE: ["IFCQUANTITYTIME", "TimeValue"],
};

export function parseIfcx(texts, schema, psets = null) {
  const errors = [];
  const noted = new Set();
  const noteOnce = (key, msg) => { if (!noted.has(key)) { noted.add(key); errors.push(msg); } };
  const layers = Array.isArray(texts) ? texts : [texts];

  // Flatten: one record per path, later nodes winning.
  const nodes = new Map(); // path -> {children:{}, inherits:{}, attributes:{}}
  const get = (p) => { let n = nodes.get(p); if (!n) nodes.set(p, (n = { children: {}, inherits: {}, attributes: {} })); return n; };
  let read = 0;
  for (const [li, t] of layers.entries()) {
    const src = t instanceof Uint8Array ? new TextDecoder().decode(t) : String(t);
    let doc;
    try {
      doc = JSON.parse(src.replace(/^\uFEFF/, ""));
    } catch (e) {
      errors.push(`${layers.length > 1 ? `layer ${li + 1}: ` : ""}not valid JSON: ${e.message}`);
      continue;
    }
    if (!isObj(doc) || !Array.isArray(doc.data)) { errors.push(`${layers.length > 1 ? `layer ${li + 1}: ` : ""}no IFC5 "data" list`); continue; }
    read++;
    for (const o of doc.data) {
      if (!isObj(o) || typeof o.path !== "string") continue;
      const n = get(o.path);
      for (const k of ["children", "inherits"]) {
        if (!isObj(o[k])) continue;
        for (const [name, target] of Object.entries(o[k])) {
          if (target === null) delete n[k][name];
          else if (typeof target === "string") n[k][name] = target;
        }
      }
      if (isObj(o.attributes)) for (const [k, v] of Object.entries(o.attributes)) n.attributes[k] = v;
    }
  }
  if (!read) return { schema: null, entities: new Map(), errors };

  // A path with a / ("<uuid>/Body") speaks about a child as composed under
  // that object; it is applied to the child's own node, which holds for the
  // one place the child is used (every case in the public examples).
  const resolve = (p, depth = 0) => {
    if (nodes.has(p) && !p.includes("/")) return p;
    const parts = p.split("/");
    let cur = parts[0];
    for (const name of parts.slice(1)) {
      const kids = composedChildren(cur, depth + 1);
      if (!kids || !kids[name]) return null;
      cur = kids[name];
    }
    return cur;
  };
  const inheritedCache = new Map();
  function composedChildren(p, depth = 0) {
    const n = nodes.get(p);
    if (!n || depth > 64) return null;
    const out = {};
    for (const t of Object.values(n.inherits)) Object.assign(out, composedChildren(resolve(t, depth + 1), depth + 1) || {});
    Object.assign(out, n.children);
    return out;
  }
  for (const [p, n] of [...nodes]) {
    if (!p.includes("/")) continue;
    const target = resolve(p);
    if (!target) { noteOnce("path:" + p, `path "${p}" names no composed child; left out`); continue; }
    const t = get(target);
    Object.assign(t.children, n.children);
    Object.assign(t.inherits, n.inherits);
    Object.assign(t.attributes, n.attributes);
    nodes.delete(p);
  }
  function attributes(p, seen = new Set()) {
    if (inheritedCache.has(p)) return inheritedCache.get(p);
    const n = nodes.get(p);
    if (!n || seen.has(p)) return {};
    seen.add(p);
    const out = {};
    for (const t of Object.values(n.inherits)) {
      const r = resolve(t);
      if (r === null) { noteOnce("inh:" + t, `inherits "${t}", which no node has; left out`); continue; }
      Object.assign(out, attributes(r, seen));
    }
    for (const [k, v] of Object.entries(n.attributes)) if (v === null) delete out[k]; else out[k] = v;
    seen.delete(p);
    inheritedCache.set(p, out);
    return out;
  }

  // Parent links over composed children (a node's own and its inherited
  // ones), the first parent found kept; and the name each parent gives.
  const parent = new Map();
  const nameOf = new Map();
  for (const p of nodes.keys()) {
    const kids = composedChildren(p) || {};
    for (const [name, c] of Object.entries(kids)) {
      const r = resolve(c);
      if (r === null || r === p || parent.has(r)) continue;
      parent.set(r, p);
      nameOf.set(r, name);
    }
  }

  // The class of each classed node, its predefined type split off.
  const classOf = new Map(); // path -> {type, predefined}
  const splitClass = (code) => {
    const u = code.toUpperCase();
    if (schema.entities[u]) return { type: u, predefined: null };
    for (let i = u.length - 1; i > 3; i--) {
      const head = u.slice(0, i);
      if (schema.entities[head] && /^[A-Z0-9_]+$/.test(code.slice(i))) return { type: head, predefined: code.slice(i).toUpperCase() };
    }
    return null;
  };
  // A classed node that is only inherited (never anyone's child) is a type
  // object, as an IfcWindowType is; its attributes reach each occurrence
  // through `inherits`, and it is not an object of the model itself.
  const inherited = new Set();
  for (const n of nodes.values()) for (const t of Object.values(n.inherits)) { const r = resolve(t); if (r !== null) inherited.add(r); }
  let types = 0;
  for (const p of nodes.keys()) {
    const a = attributes(p);
    const c = a["bsi::ifc::class"];
    if (c !== undefined && inherited.has(p) && !parent.has(p)) { types++; continue; }
    const code = isObj(c) ? c.code : typeof c === "string" ? c : null;
    if (typeof code !== "string") continue;
    const sc = splitClass(code);
    if (!sc) { noteOnce("cls:" + code, `"${code}" is not an IFC4X3 class; its objects are left out`); continue; }
    if (schema.entities[sc.type].abstract) { noteOnce("abs:" + code, `"${code}" is an abstract class; its objects are left out`); continue; }
    classOf.set(p, sc);
  }

  const entities = new Map();
  let next = 1;
  const make = (type, values) => {
    const attrs = schema.attrs(type);
    const args = attrs.map((a) => (a.derived ? { derived: true } : null));
    for (const [k, v] of Object.entries(values)) {
      const i = attrs.index.get(k);
      if (i !== undefined) args[i] = v;
    }
    const id = next++;
    entities.set(id, { id, type, args });
    return id;
  };
  let relGuid = 0;
  // Relationships and sets get a GlobalId of their own (IFC needs one); it
  // is made from a counter, so it is the same on every read of a file.
  const newGuid = () => { const n = (++relGuid).toString(16).padStart(12, "0"); return guidOfPath(`00000000-0000-4000-8000-${n}`); };

  const idOf = new Map(); // path -> entity id
  for (const [p, { type, predefined }] of classOf) {
    // A path that is already a 22-character GlobalId (ACCA's converter) is
    // kept as it is.
    const gid = guidOfPath(p) ?? (IFCGUID.test(p) ? p : null);
    const values = { GlobalId: gid ?? p, Name: nameOf.get(p) ?? null };
    if (predefined) {
      const attrs = schema.attrs(type);
      const i = attrs.index.get("PredefinedType");
      if (i !== undefined) {
        const enumType = attrs[i].type;
        const enumVals = schema.types[enumType] && schema.types[enumType].values;
        if (!enumVals || enumVals.includes(predefined)) values.PredefinedType = { enum: predefined };
        else { values.PredefinedType = { enum: "USERDEFINED" }; if (attrs.index.get("ObjectType") !== undefined) values.ObjectType = predefined; }
      }
    }
    if (gid === null) noteOnce("guid", `some paths are not UUIDs ("${p}"); their GlobalId is the path as written`);
    idOf.set(p, make(type, values));
  }

  // The spatial tree.
  const isSpatial = (t) => schema.isA(t, "IFCSPATIALELEMENT") || schema.isA(t, "IFCCONTEXT");
  const nearestClassed = (p) => { for (let q = parent.get(p), g = 0; q !== undefined && g < 10000; q = parent.get(q), g++) if (idOf.has(q)) return q; return null; };
  const aggregates = new Map(), contains = new Map(), nests = new Map();
  // Nested, not aggregated, in IFC4X3: a port on its element, and an
  // alignment's layouts and their segments (and anything else placed under
  // an alignment, as referents are).
  const nested = (t, at) => schema.isA(t, "IFCPORT") || schema.isA(at, "IFCALIGNMENT") || ["IFCALIGNMENTHORIZONTAL", "IFCALIGNMENTVERTICAL", "IFCALIGNMENTCANT"].some((x) => schema.isA(at, x));
  const push = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  const containerOf = (p) => {
    for (let q = p; q !== null; q = nearestClassed(q)) {
      const t = classOf.get(q).type;
      if (isSpatial(t)) return q;
    }
    return null;
  };
  const isGroup = (t) => schema.isA(t, "IFCGROUP");
  for (const p of idOf.keys()) {
    const a = nearestClassed(p);
    if (a === null) continue;
    const t = classOf.get(p).type, at = classOf.get(a).type;
    if (isGroup(t) || isGroup(at)) continue;
    const id = idOf.get(p), aid = idOf.get(a);
    if (nested(t, at)) push(nests, aid, id);
    else if (schema.isA(t, "IFCFEATUREELEMENTSUBTRACTION")) make("IFCRELVOIDSELEMENT", { GlobalId: newGuid(), RelatingBuildingElement: { ref: aid }, RelatedOpeningElement: { ref: id } });
    else if (schema.isA(at, "IFCFEATUREELEMENTSUBTRACTION")) make("IFCRELFILLSELEMENT", { GlobalId: newGuid(), RelatingOpeningElement: { ref: aid }, RelatedBuildingElement: { ref: id } });
    else if (isSpatial(at) && !isSpatial(t)) push(contains, aid, id);
    else if (isSpatial(at) || isSpatial(t)) push(aggregates, aid, id);
    else if (schema.isA(t, "IFCDOOR") || schema.isA(t, "IFCWINDOW")) {
      const c = containerOf(a);
      if (c !== null) push(contains, idOf.get(c), id);
    } else push(aggregates, aid, id);
  }
  for (const [aid, kids] of aggregates) make("IFCRELAGGREGATES", { GlobalId: newGuid(), RelatingObject: { ref: aid }, RelatedObjects: kids.map((k) => ({ ref: k })) });
  for (const [aid, kids] of nests) make("IFCRELNESTS", { GlobalId: newGuid(), RelatingObject: { ref: aid }, RelatedObjects: kids.map((k) => ({ ref: k })) });
  for (const [aid, kids] of contains) make("IFCRELCONTAINEDINSPATIALSTRUCTURE", { GlobalId: newGuid(), RelatingStructure: { ref: aid }, RelatedElements: kids.map((k) => ({ ref: k })) });

  // Property set templates by class (the class and its ancestors).
  const templatesFor = new Map();
  const templates = (type) => {
    if (templatesFor.has(type)) return templatesFor.get(type);
    const chain = new Set();
    for (let t = type; t && schema.entities[t]; t = schema.entities[t].super) chain.add(t);
    const out = [];
    for (const [name, tpl] of Object.entries(psets || {})) if ((tpl.classes || []).some((c) => chain.has(c))) out.push([name, tpl]);
    templatesFor.set(type, out);
    return out;
  };
  const setFor = (type, prop, value) => {
    const hits = templates(type).filter(([, tpl]) => tpl.props && tpl.props[prop]);
    if (!hits.length) return null;
    // A number may be a quantity; anything else is a property.
    const usable = hits.filter(([n]) => !n.startsWith("Qto_") || typeof value === "number");
    const pick = usable.find(([n]) => /^Pset_.*Common$/.test(n)) || usable.find(([n]) => n.startsWith("Pset_")) || usable[0];
    return pick ? [pick[0], pick[1].props[prop].type] : null;
  };
  const jsonType = (v) => (typeof v === "boolean" ? "IFCBOOLEAN" : typeof v === "number" ? (Number.isInteger(v) ? "IFCINTEGER" : "IFCREAL") : typeof v === "string" ? "IFCLABEL" : null);
  const fitValue = (type, v) => {
    const prim = schema.prim(type);
    if (prim === "boolean" || prim === "logical") return typeof v === "boolean" ? v : null;
    if (prim === "double" || prim === "integer") return typeof v === "number" ? v : null;
    if (prim === "string") return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null;
    return null;
  };

  // Materials on an object's unclassed parts (a window type's Frame and
  // Glazing, a wall's Body) are the object's, as a STEP file associates
  // them with the window or its type; a classed child keeps its own.
  const partMaterials = new Map();
  const materialsBelow = (p, depth = 0, seen = new Set()) => {
    if (depth === 0 && partMaterials.has(p)) return partMaterials.get(p);
    const out = new Set();
    if (depth > 32 || seen.has(p)) return out;
    seen.add(p);
    for (const c of Object.values(composedChildren(p) || {})) {
      const r = resolve(c);
      if (r === null || classOf.has(r) || inherited.has(r) && attributes(r)["bsi::ifc::class"] !== undefined) continue;
      const m = attributes(r)["bsi::ifc::material"];
      if (isObj(m) && typeof m.code === "string") out.add(m.code);
      for (const x of materialsBelow(r, depth + 1, seen)) out.add(x);
    }
    if (depth === 0) partMaterials.set(p, out);
    return out;
  };
  const classifications = new Map(); // system -> IfcClassification id
  const refs = new Map(); // system|code|uri -> reference id
  const classAssoc = new Map(); // reference id -> [entity id]
  const materials = new Map(); // name -> IfcMaterial id
  const matAssoc = new Map();
  for (const [p, eid] of idOf) {
    const type = classOf.get(p).type;
    const a = attributes(p);
    const sets = new Map(); // set name -> {quantity, items}
    for (const [k, v] of Object.entries(a)) {
      const m = /^(.+)::prop::(.+)$/.exec(k);
      if (m) {
        if (v === null || isObj(v) || Array.isArray(v)) { noteOnce("val:" + k, `${k}: a ${Array.isArray(v) ? "list" : "structured"} value is not read as a property`); continue; }
        const prop = m[2];
        const hit = setFor(type, prop, v);
        const setName = hit ? hit[0] : m[1] + "::prop";
        let typeName = hit && hit[1] && schema.types[hit[1]] ? hit[1] : jsonType(v);
        let val = fitValue(typeName, v);
        if (val === null) { typeName = jsonType(v); val = v; }
        const quantity = setName.startsWith("Qto_");
        const s = sets.get(setName) || { quantity, items: [] };
        sets.set(setName, s);
        if (quantity) {
          const q = QUANTITY[typeName] || ["IFCQUANTITYCOUNT", "CountValue"];
          s.items.push(make(q[0], { Name: prop, [q[1]]: val }));
        } else s.items.push(make("IFCPROPERTYSINGLEVALUE", { Name: prop, NominalValue: { typed: typeName, value: val } }));
        continue;
      }
      if (k === "bsi::ifc::material" && isObj(v) && typeof v.code === "string") {
        let mid = materials.get(v.code);
        if (mid === undefined) materials.set(v.code, (mid = make("IFCMATERIAL", { Name: v.code })));
        push(matAssoc, mid, eid);
        continue;
      }
      const c = /^(.+)::class$/.exec(k);
      if (c && k !== "bsi::ifc::class" && isObj(v) && (typeof v.code === "string" || typeof v.uri === "string")) {
        const system = c[1];
        let sid = classifications.get(system);
        if (sid === undefined) classifications.set(system, (sid = make("IFCCLASSIFICATION", { Name: system })));
        const key = `${system}|${v.code}|${v.uri}`;
        let rid = refs.get(key);
        if (rid === undefined) refs.set(key, (rid = make("IFCCLASSIFICATIONREFERENCE", { Location: v.uri ?? null, Identification: v.code ?? null, ReferencedSource: { ref: sid } })));
        push(classAssoc, rid, eid);
      }
    }
    const own = a["bsi::ifc::material"];
    for (const code of materialsBelow(p)) {
      if (isObj(own) && own.code === code) continue;
      let mid = materials.get(code);
      if (mid === undefined) materials.set(code, (mid = make("IFCMATERIAL", { Name: code })));
      if (!(matAssoc.get(mid) || []).includes(eid)) push(matAssoc, mid, eid);
    }
    for (const [name, s] of sets) {
      const set = s.quantity
        ? make("IFCELEMENTQUANTITY", { GlobalId: newGuid(), Name: name, Quantities: s.items.map((i) => ({ ref: i })) })
        : make("IFCPROPERTYSET", { GlobalId: newGuid(), Name: name, HasProperties: s.items.map((i) => ({ ref: i })) });
      make("IFCRELDEFINESBYPROPERTIES", { GlobalId: newGuid(), RelatedObjects: [{ ref: eid }], RelatingPropertyDefinition: { ref: set } });
    }
  }
  // Systems: membership, the facilities a system serves, port connections
  // and a port's flow direction.
  const refPaths = (v) => (Array.isArray(v) ? v : [v]).map((r) => (isObj(r) && typeof r.ref === "string" ? resolve(r.ref) : null));
  const members = new Map(), serves = new Map(), portPairs = new Set();
  for (const [p, eid] of idOf) {
    const a = attributes(p);
    const type = classOf.get(p).type;
    for (const [k, list] of [["bsi::ifc::system::partofsystem", members], ["bsi::ifc::system::servicesfacility", serves]]) {
      if (a[k] === undefined || a[k] === null) continue;
      for (const [i, r] of refPaths(a[k]).entries()) {
        const target = r === null ? undefined : idOf.get(r);
        if (target === undefined) { noteOnce(k + ":" + p + ":" + i, `${k} on "${p}" names no classed object; left out`); continue; }
        const tt = classOf.get(r).type;
        if (k.endsWith("partofsystem")) {
          if (!isGroup(tt)) { noteOnce(k + ":" + r, `${k} names "${r}", a ${tt}, not a system or group; left out`); continue; }
          push(list, target, eid);
        } else {
          if (!isGroup(type)) continue;
          if (!isSpatial(tt)) { noteOnce(k + ":" + r, `${k} names "${r}", a ${tt}, not a spatial structure; left out`); continue; }
          push(list, eid, target);
        }
      }
    }
    const c = a["bsi::ifc::system::connectsto"];
    if (c !== undefined && c !== null && schema.isA(type, "IFCPORT")) {
      for (const r of refPaths(c)) {
        const other = r === null ? undefined : idOf.get(r);
        if (other === undefined || other === eid || !schema.isA(classOf.get(r).type, "IFCPORT")) { noteOnce("conn:" + p, `bsi::ifc::system::connectsto on "${p}" names no port; left out`); continue; }
        portPairs.add(eid < other ? `${eid} ${other}` : `${other} ${eid}`);
      }
    }
    const fd = a["bsi::ifc::system::flowdirection"];
    if (typeof fd === "string") {
      const attrs = schema.attrs(type);
      const i = attrs.index.get("FlowDirection");
      const vals = i !== undefined && schema.types[attrs[i].type] && schema.types[attrs[i].type].values;
      if (i !== undefined && (!vals || vals.includes(fd.toUpperCase()))) entities.get(eid).args[i] = { enum: fd.toUpperCase() };
      else noteOnce("fd:" + type + fd, `bsi::ifc::system::flowdirection "${fd}" on a ${type} is not read`);
    }
  }
  for (const [gid, objs] of members) make("IFCRELASSIGNSTOGROUP", { GlobalId: newGuid(), RelatedObjects: objs.map((o) => ({ ref: o })), RelatingGroup: { ref: gid } });
  for (const [sid, objs] of serves) make("IFCRELSERVICESBUILDINGS", { GlobalId: newGuid(), RelatingSystem: { ref: sid }, RelatedBuildings: objs.map((o) => ({ ref: o })) });
  for (const k of portPairs) { const [x, y] = k.split(" ").map(Number); make("IFCRELCONNECTSPORTS", { GlobalId: newGuid(), RelatingPort: { ref: x }, RelatedPort: { ref: y } }); }
  for (const [rid, objs] of classAssoc) make("IFCRELASSOCIATESCLASSIFICATION", { GlobalId: newGuid(), RelatedObjects: objs.map((o) => ({ ref: o })), RelatingClassification: { ref: rid } });
  for (const [mid, objs] of matAssoc) make("IFCRELASSOCIATESMATERIAL", { GlobalId: newGuid(), RelatedObjects: objs.map((o) => ({ ref: o })), RelatingMaterial: { ref: mid } });

  return { schema: "IFC4X3", entities, errors };
}
