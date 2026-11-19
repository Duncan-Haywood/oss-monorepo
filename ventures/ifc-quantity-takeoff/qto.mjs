// Quantity takeoff from an IFC model (IFC2X3, IFC4, IFC4X3).
//
// takeoff(model) lists every physical element (anything with a GlobalId, an
// object placement and a product shape, except spatial structure, openings,
// annotations, grids and ports) with:
//   - class, name, type name, storey, material and classification code;
//   - the quantities the exporting tool stored (IfcElementQuantity: lengths,
//     areas, volumes, counts, weights), converted to metres, m2, m3 and kg;
//   - the volume computed from the element's own body geometry (geom.mjs):
//     gross (the body), and net (the body less its IfcRelVoidsElement
//     openings) where every piece could be intersected;
//   - a check of the computed volume against the stored one, when both exist.
// boq(rows, by) groups the rows into bill-of-quantities lines.
//
// The stored quantities are the exporter's word; the computed volume is this
// tool's reading of the same model. Where they disagree the row says so,
// because one of them is wrong and an estimate built on it would be too.

import { Geometry, Unresolved, solidVolume, mul, invert, subtractCutters, cuttersOf, transformSolid } from "./geom.mjs";

const NOT_ELEMENTS = new Set([
  "IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE", "IFCOPENINGELEMENT", "IFCOPENINGSTANDARDCASE",
  "IFCVOIDINGFEATURE", "IFCANNOTATION", "IFCGRID", "IFCDISTRIBUTIONPORT", "IFCVIRTUALELEMENT", "IFCSPATIALZONE",
  "IFCEXTERNALSPATIALELEMENT", "IFCFACILITY", "IFCFACILITYPART", "IFCBRIDGE", "IFCBRIDGEPART", "IFCROAD", "IFCROADPART",
  "IFCRAILWAY", "IFCRAILWAYPART", "IFCMARINEFACILITY", "IFCMARINEPART", "IFCALIGNMENT", "IFCPROXY", "IFCSTRUCTURALCURVEMEMBER",
  "IFCSTRUCTURALSURFACEMEMBER", "IFCSTRUCTURALPOINTCONNECTION", "IFCSTRUCTURALCURVECONNECTION", "IFCSTRUCTURALSURFACECONNECTION",
  "IFCSTRUCTURALPOINTACTION", "IFCSTRUCTURALCURVEACTION", "IFCSTRUCTURALSURFACEACTION", "IFCSTRUCTURALPOINTREACTION",
  "IFCGEOGRAPHICELEMENT", "IFCCIVILELEMENT", "IFCREFERENT", "IFCLINEARPOSITIONINGELEMENT", "IFCSPACEBOUNDARY",
]);

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12 };

const str = (v) => (typeof v === "string" ? v : v && typeof v === "object" && "typed" in v && typeof v.value === "string" ? v.value : null);
const refId = (v) => (v && typeof v === "object" && v.ref !== undefined ? v.ref : null);
const numOf = (v) => (typeof v === "number" ? v : v && typeof v === "object" && "typed" in v ? numOf(v.value) : null);

/** Factor to SI of each unit type in an IfcUnitAssignment (the project's units). */
export function readUnits(model) {
  const E = model.entities;
  const out = { LENGTHUNIT: 1, AREAUNIT: 1, VOLUMEUNIT: 1, MASSUNIT: 1, PLANEANGLEUNIT: 1, names: {} };
  let project = null;
  for (const e of E.values()) if (e.type === "IFCPROJECT") { project = e; break; }
  const ua = project && E.get(refId(project.args[8]));
  if (!ua) return out;
  const factorOf = (u, depth = 0) => {
    if (!u || depth > 10) return null;
    if (u.type === "IFCSIUNIT") {
      const p = u.args[2] && u.args[2].enum ? (Object.hasOwn(SI_PREFIX, u.args[2].enum) ? SI_PREFIX[u.args[2].enum] : 1) : 1;
      const name = u.args[3] && u.args[3].enum;
      let f = p;
      if (name === "SQUARE_METRE") f = p * p;
      else if (name === "CUBIC_METRE") f = p * p * p;
      else if (name === "GRAM") f = p / 1000;
      return { type: u.args[1] && u.args[1].enum, f, name: `${u.args[2] && u.args[2].enum ? u.args[2].enum + " " : ""}${name}` };
    }
    if (u.type === "IFCCONVERSIONBASEDUNIT" || u.type === "IFCCONVERSIONBASEDUNITWITHOFFSET") {
      const mwu = E.get(refId(u.args[3]));
      const v = numOf(mwu && mwu.args[0]);
      const base = factorOf(E.get(refId(mwu && mwu.args[1])), depth + 1);
      return { type: u.args[1] && u.args[1].enum, f: (v ?? 1) * (base ? base.f : 1), name: str(u.args[2]) };
    }
    return null;
  };
  for (const r of ua.args[0] || []) {
    const u = factorOf(E.get(refId(r)));
    if (u && u.type && Object.hasOwn(out, u.type) && u.type !== "names") { out[u.type] = u.f; out.names[u.type] = u.name; }
  }
  return out;
}

const QTY = {
  IFCQUANTITYLENGTH: ["length", "LENGTHUNIT"],
  IFCQUANTITYAREA: ["area", "AREAUNIT"],
  IFCQUANTITYVOLUME: ["volume", "VOLUMEUNIT"],
  IFCQUANTITYCOUNT: ["count", null],
  IFCQUANTITYWEIGHT: ["weight", "MASSUNIT"],
};

/** Index of the relationships an element's row needs, built once per model. */
function indexModel(E) {
  const storeyOf = new Map(), typeOf = new Map(), qsets = new Map(), material = new Map(), classif = new Map(), voids = new Map(), parentOf = new Map(), children = new Map();
  const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const e of E.values()) {
    const t = e.type;
    if (t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      for (const r of e.args[4] || []) storeyOf.set(refId(r), refId(e.args[5]));
    } else if (t === "IFCRELDEFINESBYTYPE") {
      for (const r of e.args[4] || []) typeOf.set(refId(r), refId(e.args[5]));
    } else if (t === "IFCRELDEFINESBYPROPERTIES") {
      const d = E.get(refId(e.args[5]));
      if (d && d.type === "IFCELEMENTQUANTITY") for (const r of e.args[4] || []) push(qsets, refId(r), d.id);
    } else if (t === "IFCRELASSOCIATESMATERIAL") {
      for (const r of e.args[4] || []) material.set(refId(r), refId(e.args[5]));
    } else if (t === "IFCRELASSOCIATESCLASSIFICATION") {
      for (const r of e.args[4] || []) push(classif, refId(r), refId(e.args[5]));
    } else if (t === "IFCRELVOIDSELEMENT") {
      push(voids, refId(e.args[4]), refId(e.args[5]));
    } else if (t === "IFCRELAGGREGATES" || t === "IFCRELNESTS") {
      if (t === "IFCRELAGGREGATES") for (const r of e.args[5] || []) { parentOf.set(refId(r), refId(e.args[4])); push(children, refId(e.args[4]), refId(r)); }
    }
  }
  return { storeyOf, typeOf, qsets, material, classif, voids, parentOf, children };
}

function materialName(E, id, depth = 0) {
  const m = E.get(id);
  if (!m || depth > 5) return null;
  switch (m.type) {
    case "IFCMATERIAL": return str(m.args[0]);
    case "IFCMATERIALLAYERSETUSAGE": return materialName(E, refId(m.args[0]), depth + 1);
    case "IFCMATERIALLAYERSET": {
      if (str(m.args[1])) return str(m.args[1]);
      return (m.args[0] || []).map((l) => { const L = E.get(refId(l)); return L ? materialName(E, refId(L.args[0]), depth + 1) : null; }).filter(Boolean).join(" / ") || null;
    }
    case "IFCMATERIALLAYER": return materialName(E, refId(m.args[0]), depth + 1);
    case "IFCMATERIALLIST": return (m.args[0] || []).map((r) => materialName(E, refId(r), depth + 1)).filter(Boolean).join(" / ") || null;
    case "IFCMATERIALCONSTITUENTSET": return str(m.args[0]) || (m.args[2] || []).map((r) => { const c = E.get(refId(r)); return c ? materialName(E, refId(c.args[2]), depth + 1) : null; }).filter(Boolean).join(" / ") || null;
    case "IFCMATERIALPROFILESETUSAGE": return materialName(E, refId(m.args[0]), depth + 1);
    case "IFCMATERIALPROFILESET": return str(m.args[0]) || (m.args[2] || []).map((r) => { const p = E.get(refId(r)); return p ? materialName(E, refId(p.args[2]), depth + 1) : null; }).filter(Boolean).join(" / ") || null;
    default: return null;
  }
}

function classificationCode(E, ids) {
  for (const id of ids || []) {
    const c = E.get(id);
    if (!c) continue;
    if (c.type === "IFCCLASSIFICATIONREFERENCE") {
      // IFC2X3: Location, ItemReference, Name; IFC4: Location, Identification, Name
      const code = str(c.args[1]) || str(c.args[2]);
      if (code) return code;
    }
    if (c.type === "IFCCLASSIFICATIONNOTATION") {
      const f = (c.args[0] || []).map((r) => E.get(refId(r))).filter(Boolean).map((x) => str(x.args[0])).filter(Boolean);
      if (f.length) return f.join(" ");
    }
  }
  return null;
}

/** Chooses the body representation of a product shape: 'Body', else the first solid-looking one. */
function bodyRepresentation(E, shapeId) {
  const shape = E.get(shapeId);
  if (!shape || !Array.isArray(shape.args[2])) return null;
  let fallback = null;
  for (const r of shape.args[2]) {
    const rep = E.get(refId(r));
    if (!rep || (rep.type !== "IFCSHAPEREPRESENTATION")) continue;
    const id = str(rep.args[1]), kind = str(rep.args[2]);
    if (id === "Body") return rep.id;
    if (!fallback && !["Axis", "FootPrint", "Box", "Annotation", "Profile", "Reference", "Clearance", "Lighting", "Surface"].includes(id) && kind && /Solid|Brep|Clipping|CSG|Mapped|Tessellation|SurfaceModel/i.test(kind)) fallback = rep.id;
  }
  return fallback;
}

export function isElement(e) {
  if (NOT_ELEMENTS.has(e.type) || e.type.endsWith("TYPE") || e.type.startsWith("IFCREL")) return false;
  const a = e.args;
  if (a.length < 7 || typeof a[0] !== "string" || a[0].length !== 22) return false;
  return refId(a[5]) != null && refId(a[6]) != null;
}

/** Pretty class name: IFCWALLSTANDARDCASE -> IfcWallStandardCase (by a word list). */
const WORDS = ["Standard", "Case", "Elemented", "Element", "Proxy", "Building", "Covering", "Curtain", "Wall", "Slab", "Beam", "Column", "Member", "Plate", "Door", "Window", "Roof", "Stair", "Flight", "Ramp", "Railing", "Footing", "Pile", "Furnishing", "Furniture", "Flow", "Segment", "Fitting", "Terminal", "Pipe", "Duct", "Cable", "Carrier", "Distribution", "Energy", "Conversion", "Device", "Controller", "Moving", "Transport", "Chimney", "Shading", "Reinforcing", "Bar", "Mesh", "Tendon", "Anchor", "Mechanical", "Fastener", "Discrete", "Accessory", "System", "Furnishing", "Geographic", "Air", "Sanitary", "Light", "Fixture", "Outlet", "Space", "Heater", "Valve", "Pump", "Tank", "Fire", "Suppression", "Electric", "Appliance", "Junction", "Box", "Unitary", "Equipment", "Coil", "Damper", "Fan", "Filter", "Chiller", "Boiler", "Port", "Course", "Pavement", "Kerb", "Earthworks", "Fill", "Cut", "Sign", "Signal", "Rail", "Track", "Deep", "Foundation", "Bearing", "Part", "Surface", "Feature", "Sensor", "Alarm", "Actuator", "Protective", "Switching", "Audio", "Visual", "Communications", "Lamp", "Motor", "Connection", "Storage", "Treatment", "Interceptor", "Waste", "Stack", "Hood", "Burner", "Evaporator", "Condenser", "Humidifier", "Cooling", "Tower", "Compressor", "Engine", "Generator", "Transformer", "Tube", "Bundle", "Radiator", "Recovery", "Heat", "Exchanger", "Medical", "Solar", "Panel", "Spaceheater", "Vibration", "Isolator", "Impact", "Protection", "Sound", "Mobile", "Telecom", "Plant", "Building"];
export function prettyClass(t) {
  if (!t.startsWith("IFC")) return t;
  let s = t.slice(3).toLowerCase();
  let out = "Ifc";
  const lower = WORDS.map((w) => w.toLowerCase()).sort((a, b) => b.length - a.length);
  while (s.length) {
    const w = lower.find((x) => s.startsWith(x));
    if (w) { out += w[0].toUpperCase() + w.slice(1); s = s.slice(w.length); } else { out += s[0].toUpperCase() + s.slice(1); break; }
  }
  return out;
}

/**
 * @param {{entities: any, schema: string|null}} model parsed STEP (step.mjs)
 * @param {{geometry?: boolean, tolerance?: number}} opts
 */
export function takeoff(model, opts = {}) {
  const E = model.entities;
  const units = readUnits(model);
  const f = units.LENGTHUNIT;
  const geo = new Geometry(model, { angle: units.PLANEANGLEUNIT });
  const idx = indexModel(E);
  const tol = opts.tolerance ?? 0.02;
  const rows = [];
  const placementCache = new Map();
  const worldOf = (pl) => {
    if (!placementCache.has(pl)) placementCache.set(pl, geo.objectPlacement(pl));
    return placementCache.get(pl);
  };
  const bodyCache = new Map();
  const bodyOf = (id) => {
    if (bodyCache.has(id)) return bodyCache.get(id);
    let r;
    try { r = geo.representation(id); } catch (err) { r = { error: err instanceof Unresolved ? err.message : `error: ${err.message}` }; }
    bodyCache.set(id, r);
    return r;
  };

  for (const e of E.values()) {
    if (!isElement(e)) continue;
    const id = e.id;
    const row = {
      id, globalId: e.args[0], ifcClass: prettyClass(e.type), name: str(e.args[2]), tag: str(e.args[7]) ?? null,
      type: null, storey: null, material: null, classification: null, parent: null, isAssembly: false,
      stored: {}, storedSet: null, computed: null, check: null,
    };
    const tId = idx.typeOf.get(id);
    if (tId) { const t = E.get(tId); row.type = t ? str(t.args[2]) : null; }
    // storey: own containment, else the aggregate parent's
    let sid = idx.storeyOf.get(id), p = idx.parentOf.get(id), hop = 0;
    while (!sid && p && hop++ < 10) { sid = idx.storeyOf.get(p); p = idx.parentOf.get(p); }
    if (sid) { const s = E.get(sid); row.storey = s ? (str(s.args[2]) ?? `#${sid}`) : null; }
    const parent = idx.parentOf.get(id);
    if (parent) { const pe = E.get(parent); if (pe && isElement(pe)) row.parent = parent; }
    row.isAssembly = (idx.children.get(id) || []).some((c) => { const ce = E.get(c); return ce && isElement(ce); });
    const mid = idx.material.get(id) ?? (tId ? idx.material.get(tId) : undefined);
    if (mid) row.material = materialName(E, mid);
    row.classification = classificationCode(E, idx.classif.get(id) ?? (tId ? idx.classif.get(tId) : undefined));

    for (const qs of idx.qsets.get(id) || []) {
      const set = E.get(qs);
      const setName = str(set.args[2]);
      for (const q of set.args[5] || []) {
        const qe = E.get(refId(q));
        if (!qe || !Object.hasOwn(QTY, qe.type)) continue;
        const [kind, unitType] = Object.hasOwn(QTY, qe.type) ? QTY[qe.type] : [null, null];
        let v = numOf(qe.args[3]);
        if (v == null) continue;
        let factor = unitType ? units[unitType] : 1;
        const own = E.get(refId(qe.args[2]));
        if (own && own.type === "IFCSIUNIT") {
          const pf = own.args[2] && own.args[2].enum ? (Object.hasOwn(SI_PREFIX, own.args[2].enum) ? SI_PREFIX[own.args[2].enum] : 1) : 1;
          factor = kind === "area" ? pf * pf : kind === "volume" ? pf ** 3 : kind === "weight" && own.args[3]?.enum === "GRAM" ? pf / 1000 : pf;
        }
        const name = str(qe.args[0]);
        if (!name || name in row.stored) continue;
        row.stored[name] = { kind, value: v * factor, set: setName };
        if (!row.storedSet) row.storedSet = setName;
      }
    }

    if (opts.geometry !== false) row.computed = computeVolume(e, idx, E, geo, bodyOf, worldOf, f);
    row.check = checkVolume(row, tol);
    rows.push(row);
  }
  explainChecks(rows, tol);
  return { schema: model.schema, units, rows };
}

/**
 * Names the likely cause of each stored-vs-computed disagreement, in order:
 *   split        one stored value repeated on several elements with the same
 *                Tag and class (Revit's split-by-level export writes the whole
 *                wall's quantities on every piece), and the pieces' computed
 *                volumes (gross or net) sum to it;
 *   repeated     the same, but the pieces in the file do not sum to it (some
 *                pieces are in another file or were not exported);
 *   unit-slip    the stored volume is the computed one times a power of ten
 *                (a volume written in litres or mm3 under a m3 unit);
 *   net-as-gross the stored GrossVolume equals the computed net: the exporter
 *                took the openings out of what it calls gross;
 *   own-dimensions the stored volume disagrees with the element's own stored
 *                Length x Height x Width, and the computed volume agrees with
 *                that product: the stored volume is the odd one out;
 *   unexplained  none of these.
 * Sets row.check.gross.reason / row.check.net.reason, and row.trustStored =
 * false when the stored volume should not be summed.
 */
export function explainChecks(rows, tol = 0.02) {
  const near = (a, b) => (b !== 0 ? Math.abs(a - b) / Math.abs(b) <= tol : Math.abs(a) < 1e-9);
  const groups = new Map();
  for (const r of rows) {
    for (const w of ["gross", "net"]) {
      const c = r.check?.[w];
      if (!c || !r.tag) continue;
      const k = `${w}|${r.tag}|${r.ifcClass}|${c.stored}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
  }
  const lhw = (r) => {
    const g = (n) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === n) return q.value; return null; };
    const L = g("length"), H = g("height"), W = g("width");
    return L != null && H != null && W != null ? L * H * W : null;
  };
  for (const r of rows) {
    r.trustStored = true;
    for (const w of ["gross", "net"]) {
      const c = r.check?.[w];
      if (!c) continue;
      if (c.agree) continue;
      const grp = r.tag ? groups.get(`${w}|${r.tag}|${r.ifcClass}|${c.stored}`) : null;
      if (grp && grp.length > 1) {
        const sumG = grp.reduce((x, q) => x + q.computed.gross, 0);
        const sumN = grp.reduce((x, q) => x + (q.computed.net ?? q.computed.gross), 0);
        const biggest = Math.max(...grp.map((q) => q.computed.gross));
        // identical parts (one Tekla mark) each store their own equal value:
        // only a stored value that looks like the whole counts as repeated
        if (near(sumG, c.stored) || near(sumN, c.stored) || c.stored >= 1.5 * biggest) {
          c.reason = near(sumG, c.stored) || near(sumN, c.stored) ? "split" : "repeated";
          c.pieces = grp.length;
          r.trustStored = false;
          continue;
        }
      }
      const dims = lhw(r);
      const ratio = c.stored / c.computed;
      const pow = Math.round(Math.log10(Math.abs(ratio)));
      if (pow !== 0 && Math.abs(pow) <= 9 && near(c.computed * 10 ** pow, c.stored)) { c.reason = "unit-slip"; c.factor = 10 ** pow; r.trustStored = false; continue; }
      if (w === "gross" && r.computed.openings > 0 && r.computed.net != null && near(r.computed.net, c.stored)) c.reason = "net-as-gross";
      else if (dims != null && !near(c.stored, dims) && (near(c.computed, dims) || (r.computed.net != null && near(r.computed.net, dims)))) { c.reason = "own-dimensions"; r.trustStored = false; }
      else c.reason = "unexplained";
    }
  }
  return rows;
}

export const REASON_TEXT = {
  split: "the same stored volume is written on every piece of an element split by level; the pieces' geometry sums to it",
  repeated: "the same stored volume is written on several pieces of one element, and the pieces in this file do not sum to it",
  "unit-slip": "the stored volume is the geometry's times a power of ten: written in the wrong unit",
  "net-as-gross": "the exporter's GrossVolume equals the volume with openings taken out (net)",
  "own-dimensions": "the stored volume disagrees with the element's own stored length x height x width; the geometry agrees with them",
  unexplained: "no known cause; check the element in a viewer",
};

function computeVolume(e, idx, E, geo, bodyOf, worldOf, f) {
  const repId = bodyRepresentation(E, refId(e.args[6]));
  if (!repId) return { status: "no body" };
  const body = bodyOf(repId);
  if (body.error) return { status: "not read", reason: body.error };
  const f3 = f * f * f;
  const gross = Math.abs(solidVolume(body)) * f3;
  const out = { status: "ok", gross, net: gross, openings: 0, notes: body.notes.slice(), faceted: body.mesh !== 0 };
  const opens = idx.voids.get(e.id) || [];
  if (!opens.length) return out;
  out.openings = opens.length;
  try {
    const W = worldOf(refId(e.args[5]));
    const Winv = invert(W);
    let net = body;
    for (const oid of opens) {
      const o = E.get(oid);
      if (!o) continue;
      const orep = bodyRepresentation(E, refId(o.args[6]));
      if (!orep) throw new Unresolved("opening with no body");
      const ob = bodyOf(orep);
      if (ob.error) throw new Unresolved(`opening: ${ob.error}`);
      if (ob.mesh) throw new Unresolved("faceted opening");
      const inElem = transformSolid(ob, mul(Winv, worldOf(refId(o.args[5]))));
      if (net.mesh) throw new Unresolved("opening in a faceted body");
      net = subtractCutters(net, cuttersOf(inElem), "opening");
    }
    out.net = Math.abs(solidVolume(net)) * f3;
  } catch (err) {
    out.net = null;
    out.netReason = err instanceof Unresolved ? err.message : `error: ${err.message}`;
  }
  return out;
}

/** Compares computed volumes with the stored GrossVolume / NetVolume. */
function checkVolume(row, tol) {
  const c = row.computed;
  if (!c || c.status !== "ok") return null;
  const pick = (re) => { for (const [k, q] of Object.entries(row.stored)) if (q.kind === "volume" && re.test(k)) return q.value; return null; };
  const sg = pick(/^gross\s*volume$/i), sn = pick(/^net\s*volume$/i);
  const res = {};
  const cmp = (computed, stored) => {
    if (computed == null || stored == null) return null;
    const diff = computed - stored;
    const rel = stored !== 0 ? diff / stored : (computed === 0 ? 0 : Infinity);
    return { computed, stored, diff, rel, agree: Math.abs(rel) <= tol || Math.abs(diff) < 1e-6 };
  };
  if (sg != null) res.gross = cmp(c.gross, sg);
  if (sn != null) res.net = cmp(c.net, sn);
  return Object.keys(res).length ? res : null;
}

const GROUP_KEYS = { class: (r) => r.ifcClass, type: (r) => r.type ?? "(no type)", storey: (r) => r.storey ?? "(no storey)", material: (r) => r.material ?? "(no material)", classification: (r) => r.classification ?? "(none)" };

/** The quantity of a row a BoQ line sums: the stored value when present, else the computed one. */
export function rowQuantities(r) {
  const s = r.stored;
  const first = (names, kind) => { for (const n of names) for (const [k, q] of Object.entries(s)) if (q.kind === kind && k.toLowerCase() === n) return q.value; return null; };
  const storedNet = r.trustStored === false ? null : first(["netvolume"], "volume") ?? first(["grossvolume", "volume"], "volume");
  const comp = r.computed && r.computed.status === "ok" ? (r.computed.net ?? r.computed.gross) : null;
  return {
    volume: storedNet ?? comp,
    volumeSource: storedNet != null ? "stored" : comp != null ? "computed" : null,
    area: first(["netsidearea", "netarea", "netfloorarea", "netsurfacearea", "grosssidearea", "grossarea", "area"], "area"),
    length: first(["length", "netlength", "grosslength"], "length"),
    weight: first(["netweight", "grossweight", "weight"], "weight"),
  };
}

/**
 * Bill-of-quantities lines: one per distinct value of the `by` keys.
 * Assemblies whose parts are elements themselves (a stair and its flights,
 * a curtain wall and its panels) are left out so nothing is counted twice.
 */
export function boq(rows, by = ["class", "type"]) {
  const lines = new Map();
  for (const r of rows) {
    if (r.isAssembly) continue;
    const key = by.map((k) => GROUP_KEYS[k](r));
    const k = JSON.stringify(key);
    let L = lines.get(k);
    if (!L) { L = { key, count: 0, volume: 0, volumeStored: 0, volumeComputed: 0, volumeMissing: 0, area: 0, length: 0, weight: 0, disagree: 0 }; lines.set(k, L); }
    const q = rowQuantities(r);
    L.count++;
    if (q.volume != null) { L.volume += q.volume; if (q.volumeSource === "stored") L.volumeStored++; else L.volumeComputed++; } else L.volumeMissing++;
    if (q.area != null) L.area += q.area;
    if (q.length != null) L.length += q.length;
    if (q.weight != null) L.weight += q.weight;
    if (r.check && ((r.check.gross && !r.check.gross.agree) || (r.check.net && !r.check.net.agree))) L.disagree++;
  }
  return [...lines.values()].sort((a, b) => a.key.join("\u0000").localeCompare(b.key.join("\u0000")));
}

const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

export function boqCsv(lines, by, rates = {}) {
  const head = [...by.map((k) => k[0].toUpperCase() + k.slice(1)), "Count", "Volume m3", "Area m2", "Length m", "Weight kg", "Volume from model's stored quantities", "Volume computed here", "No volume", "Rows where stored and computed disagree", "Rate", "Rate unit", "Amount"];
  const out = [head.map(csvCell).join(",")];
  for (const L of lines) {
    const k = JSON.stringify(L.key);
    const rate = rates[k];
    let amount = null;
    if (rate && Number.isFinite(rate.rate)) amount = rate.rate * ({ each: L.count, m3: L.volume, m2: L.area, m: L.length, kg: L.weight }[rate.unit] ?? 0);
    out.push([...L.key, L.count, L.volume, L.area, L.length, L.weight, L.volumeStored, L.volumeComputed, L.volumeMissing, L.disagree, rate ? rate.rate : null, rate ? rate.unit : null, amount].map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

export function rowsCsv(rows) {
  const head = ["Entity", "GlobalId", "Class", "Name", "Type", "Storey", "Material", "Classification", "Assembly", "Part of", "Computed gross m3", "Computed net m3", "Openings", "Geometry status", "Stored GrossVolume m3", "Stored NetVolume m3", "Volume check", "Stored quantities"];
  const out = [head.map(csvCell).join(",")];
  for (const r of rows) {
    const c = r.computed || {};
    const g = r.check && r.check.gross, n = r.check && r.check.net;
    const verdict = !r.check ? "" : [g && (g.agree ? "gross agrees" : `gross differs ${(g.rel * 100).toFixed(1)}%`), n && (n.agree ? "net agrees" : `net differs ${(n.rel * 100).toFixed(1)}%`)].filter(Boolean).join("; ");
    const stored = Object.entries(r.stored).map(([k, q]) => `${k}=${Math.round(q.value * 1e6) / 1e6}`).join("; ");
    out.push([`#${r.id}`, r.globalId, r.ifcClass, r.name, r.type, r.storey, r.material, r.classification, r.isAssembly ? "yes" : "", r.parent ? `#${r.parent}` : "", c.gross, c.net, c.openings, c.status === "ok" ? (c.net == null ? `net not computed: ${c.netReason}` : "ok") : c.status ? `${c.status}${c.reason ? ": " + c.reason : ""}` : "", g ? g.stored : null, n ? n.stored : null, verdict, stored].map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

/** Totals of the check across rows, for the page's summary and the eval. */
export function checkSummary(rows) {
  const s = { elements: rows.length, computed: 0, notRead: 0, noBody: 0, grossPairs: 0, grossAgree: 0, netPairs: 0, netAgree: 0, netNotComputed: 0, reasons: {} };
  for (const r of rows) {
    const c = r.computed;
    if (!c) continue;
    if (c.status === "ok") s.computed++;
    else if (c.status === "no body") s.noBody++;
    else { s.notRead++; s.reasons[c.reason] = (s.reasons[c.reason] || 0) + 1; }
    if (c.status === "ok" && c.net == null) { s.netNotComputed++; s.reasons["net: " + c.netReason] = (s.reasons["net: " + c.netReason] || 0) + 1; }
    if (r.check?.gross) { s.grossPairs++; if (r.check.gross.agree) s.grossAgree++; }
    if (r.check?.net) { s.netPairs++; if (r.check.net.agree) s.netAgree++; }
  }
  return s;
}
