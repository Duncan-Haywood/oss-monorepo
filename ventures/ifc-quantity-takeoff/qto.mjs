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

import { applyRule, ruleActive } from "./measure.mjs";
import { Geometry, Unresolved, asTerms, solidVolume, mul, invert, subtractCutters, cuttersOf, transformSolid, sectionArea, thinnestNormal, solidExtent } from "./geom.mjs";

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
  const storeyOf = new Map(), typeOf = new Map(), qsets = new Map(), material = new Map(), classif = new Map(), voids = new Map(), parentOf = new Map(), children = new Map(), pathJoins = new Map();
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
    } else if (t === "IFCRELCONNECTSPATHELEMENTS") {
      // a wall whose start or end sits on another wall's path (a T-join):
      // its end covers a strip of that wall's face
      const a = refId(e.args[5]), b = refId(e.args[6]), tb = e.args[9]?.enum, ta = e.args[10]?.enum;
      if (ta === "ATPATH" && tb && tb !== "ATPATH") push(pathJoins, a, b);
      if (tb === "ATPATH" && ta && ta !== "ATPATH") push(pathJoins, b, a);
    } else if (t === "IFCRELAGGREGATES" || t === "IFCRELNESTS") {
      if (t === "IFCRELAGGREGATES") for (const r of e.args[5] || []) { parentOf.set(refId(r), refId(e.args[4])); push(children, refId(e.args[4]), refId(r)); }
    }
  }
  return { storeyOf, typeOf, qsets, material, classif, voids, parentOf, children, pathJoins };
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
      id, globalId: e.args[0], ifcClass: prettyClass(e.type), ifcType: e.type, name: str(e.args[2]), tag: str(e.args[7]) ?? null,
      type: null, storey: null, material: null, classification: null, parent: null, isAssembly: false,
      stored: {}, storedSet: null, computed: null, check: null, box: null,
      pathJoins: idx.pathJoins.get(id) || [],
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

    if (opts.geometry !== false) {
      row.computed = computeVolume(e, idx, E, geo, bodyOf, worldOf, f);
      if (row.computed.status === "ok") {
        try { row.computed.areas = computeAreas(e.type, row.computed.solids, worldOf(refId(e.args[5])), f); } catch (err) { row.computed.areas = { error: err.message }; }
        row.computed.solids.each = null;
        try { row.box = worldBox(row.computed.solids.body, worldOf(refId(e.args[5])), f); } catch { row.box = null; }
      }
    }
    row.check = checkVolume(row, tol);
    row.areaCheck = checkAreas(row, tol);
    rows.push(row);
  }
  explainChecks(rows, tol);
  explainAreas(rows, tol);
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
      const slip = unitSlip(c.computed, c.stored, tol / 4);
      if (slip) { c.reason = "unit-slip"; c.factor = slip; r.trustStored = false; continue; }
      if (w === "gross" && r.computed.openings > 0 && r.computed.net != null && near(r.computed.net, c.stored)) c.reason = "net-as-gross";
      else if (dims != null && !near(c.stored, dims) && (near(c.computed, dims) || (r.computed.net != null && near(r.computed.net, dims)))) { c.reason = "own-dimensions"; r.trustStored = false; }
      else c.reason = "unexplained";
    }
  }
  return rows;
}

// 1 m2 = 10.7639 ft2: a factor some exporters apply to the wrong quantity
// (kleine_Wohnung's roofs store GrossArea and GrossVolume both divided by it)
export const SQFT = 10.7639104;

/**
 * The factor relating stored to computed when it is a power of ten (k from
 * -9 to 9, not 0) or the square-foot factor 10.7639 or its inverse, else null.
 * Only those: a wider search (powers of ten times 10.7639) would match about
 * one random ratio in twenty at a 2% tolerance.
 */
export function unitSlip(computed, stored, tol = 0.005) {
  if (!(computed > 0) || !(stored > 0)) return null;
  // a slipped unit scales an exact figure: a quarter of the agreement
  // tolerance keeps chance matches on small parts out
  const near = (a, b) => Math.abs(a - b) <= tol * Math.abs(b);
  const pow = Math.round(Math.log10(stored / computed));
  if (pow !== 0 && Math.abs(pow) <= 9 && near(computed * 10 ** pow, stored)) return 10 ** pow;
  for (const factor of [SQFT, 1 / SQFT]) if (near(computed * factor, stored)) return factor;
  return null;
}

/**
 * Names the likely cause of each stored-vs-computed area disagreement, in order:
 *   split / repeated  as for volumes: one stored area on every piece of a
 *                     wall split by level (the pieces' areas sum to it, or not);
 *   unit-slip         stored = computed x a power of ten, or x 10.7639 (ft2/m2);
 *   net-as-gross      a stored gross area equals the computed net;
 *   gross-as-net      a stored net area equals the computed gross: the
 *                     openings were not taken out;
 *   on-a-face         a wall's side area equals the section on one of its
 *                     faces rather than its middle plane (a corner join makes
 *                     the faces differ in length);
 *   matches-stored-volume  stored side area x the wall's width equals the
 *                     stored volume: the quantity set agrees with itself and
 *                     describes another body than the geometry;
 *   joins-off         a wall's side area is the mean of its two faces with the
 *                     strips covered by the walls T-joined to it taken off:
 *                     computed - (sum of their widths) x height / 2, the
 *                     joined walls read from IfcRelConnectsPathElements
 *                     (ATPATH) and their widths from their own geometry;
 *   host-figure       a member's stored CrossSectionArea and Length are the
 *                     same on three or more elements whose bodies differ in
 *                     length: one figure copied onto every piece (skolebygg's
 *                     mullions carry their curtain wall's Revit Area and
 *                     Length);
 *   faces-averaged    the same mean, read from the exporter's own outside and
 *                     inside face areas (ArchiCAD's "Netto-Oberflächenbereich
 *                     an der Außenseite / Innenseite"; gross adds its opening
 *                     areas), when the joins in the file do not account for
 *                     the whole difference;
 *   unexplained       none of these.
 * Sets reason on each disagreeing row.areaCheck entry, and trust = false where
 * the stored figure should not be summed (split, repeated, unit-slip).
 */
export function explainAreas(rows, tol = 0.02) {
  const near = (a, b) => (b !== 0 ? Math.abs(a - b) / Math.abs(b) <= tol : Math.abs(a) < 1e-9);
  const groups = new Map();
  for (const r of rows) for (const [k, c] of Object.entries(r.areaCheck || {})) {
    if (!r.tag) continue;
    const key = `${k}|${r.tag}|${r.ifcClass}|${c.stored}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const storedVol = (r, which) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "volume" && k.toLowerCase().replace(/\s+/g, "") === `${which}volume`) return q.value; return null; };
  for (const r of rows) {
    for (const [k, c] of Object.entries(r.areaCheck || {})) {
      c.trust = true;
      if (c.agree) continue;
      const A = r.computed.areas[c.kind];
      const grp = r.tag ? groups.get(`${k}|${r.tag}|${r.ifcClass}|${c.stored}`) : null;
      if (grp && grp.length > 1) {
        const sum = grp.reduce((x, q) => x + (q.areaCheck[k].computed ?? 0), 0);
        const biggest = Math.max(...grp.map((q) => q.areaCheck[k].computed ?? 0));
        if (near(sum, c.stored) || c.stored >= 1.5 * biggest) {
          c.reason = near(sum, c.stored) ? "split" : "repeated"; c.pieces = grp.length; c.trust = false; continue;
        }
      }
      const slip = unitSlip(c.computed, c.stored, tol / 4);
      if (slip) { c.reason = "unit-slip"; c.factor = slip; c.trust = false; continue; }
      const open = r.computed.openings > 0;
      if (c.which === "gross" && open && A.net != null && near(A.net, c.stored)) { c.reason = "net-as-gross"; continue; }
      if (c.which === "net" && open && A.gross != null && near(A.gross, c.stored)) { c.reason = "gross-as-net"; continue; }
      if ((c.kind === "side" || c.kind === "plan") && A.faces && A.faces[c.which].some((x) => x != null && near(x, c.stored))) { c.reason = "on-a-face"; continue; }
      if (c.kind === "cross" && scalesWithLength(r, k, c, rows, near)) { c.reason = "scales-with-length"; c.trust = false; continue; }
      const sv = storedVol(r, c.which);
      if (c.kind === "side" && sv != null && A.width > 0 && near(c.stored * A.width, sv)) { c.reason = "matches-stored-volume"; continue; }
      if (c.stored === 0 && c.computed > 0) { c.reason = "zero"; c.trust = false; continue; }
      const L = storedLen(r, "length"), W = storedLen(r, "width"), H = storedLen(r, "height");
      const exact = (x) => x > 0 && Math.abs(x - c.stored) <= 0.005 * Math.abs(c.stored);
      if ((c.kind === "footprint" && exact(L * W)) || (c.kind === "side" && exact(L * H))) { c.reason = "centre-line"; continue; }
      if (c.kind === "side" && sv != null && W > 0 && A.width > 0 && Math.abs(W - A.width) > tol * W && near(c.stored * W, sv)) { c.reason = "other-width"; continue; }
      if (c.kind === "cross" && hostFigure(r, k, c, rows)) { c.reason = "host-figure"; c.trust = false; continue; }
      if (c.kind === "side" && joinsOff(r, c, byId, exact)) { c.reason = "joins-off"; continue; }
      if (c.kind === "side" && facesAveraged(r, c, exact)) { c.reason = "faces-averaged"; continue; }
      c.reason = "unexplained";
    }
  }
  return rows;
}

// The side area with the strips that T-joined walls cover taken off one face,
// averaged over the two faces. ArchiCAD measures finishes this way (C20, FZK).
function joinsOff(r, c, byId, exact) {
  if (!r.pathJoins?.length) return false;
  const H = r.box ? r.box[5] - r.box[2] : storedLen(r, "height");
  if (!(H > 0)) return false;
  let W = 0;
  for (const o of r.pathJoins) {
    const x = byId.get(o);
    const w = x?.computed?.areas?.side?.width ?? (x ? storedLen(x, "width") : null);
    if (!(w > 0)) return false;
    W += w;
  }
  return exact(c.computed - (W * H) / 2);
}

// One stored (Length, CrossSectionArea) pair on many members of different
// lengths: the figure is not the member's own (it far exceeds its section).
const hostGroups = new WeakMap();
function hostFigure(r, k, c, rows) {
  const L = storedLen(r, "length");
  if (!(L > 0) || !(c.stored >= 5 * c.computed) || !r.box) return false;
  let g = hostGroups.get(rows);
  if (!g) {
    g = new Map();
    for (const x of rows) {
      const cx = x.areaCheck?.[k], lx = storedLen(x, "length");
      if (!cx || !(lx > 0) || !x.box) continue;
      const key = `${k}|${cx.stored}|${lx}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(Math.max(x.box[3] - x.box[0], x.box[4] - x.box[1], x.box[5] - x.box[2]));
    }
    hostGroups.set(rows, g);
  }
  const lens = g.get(`${k}|${c.stored}|${L}`) || [];
  if (lens.length < 3) return false;
  const lo = Math.min(...lens), hi = Math.max(...lens);
  return hi > 1.02 * lo;
}

const storedNamed = (r, re) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "area" && re.test(k)) return q.value; return null; };
function facesAveraged(r, c, exact) {
  const out = storedNamed(r, /^Netto-Oberfl\u00e4chenbereich an der Au\u00dfenseite$/), inn = storedNamed(r, /^Netto-Oberfl\u00e4chenbereich an der Innenseite$/);
  if (out == null || inn == null || out === inn) return false;
  let mean = (out + inn) / 2;
  if (c.which === "gross") for (const re of [/^Oberfl\u00e4chenbereich der Fenster in der Wand$/, /^Oberfl\u00e4chenbereich der T\u00fcren in der Wand$/, /^Oberfl\u00e4chenbereich der leeren \u00d6ffnungen in der Wand$/]) mean += storedNamed(r, re) ?? 0;
  return exact(mean);
}

const storedLen = (r, name) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === name) return q.value; return null; };

// A stored CrossSectionArea that is the element's stored Length times one
// constant across every element of its type (whatever their geometry's
// section) is a face area, not a section. skolebygg's mullions: 50x120 mullions
// store Length x 2.97 m.
const lengthRatios = new WeakMap();
function scalesWithLength(r, k, c, rows, near) {
  const L = (x) => { for (const [n, q] of Object.entries(x.stored)) if (q.kind === "length" && n.toLowerCase() === "length") return q.value; return null; };
  const len = L(r);
  if (!(len > 0) || !r.type || c.stored < 5 * c.computed) return false;
  let byType = lengthRatios.get(rows);
  if (!byType) {
    byType = new Map();
    for (const x of rows) {
      const cx = x.areaCheck?.[k], lx = L(x);
      if (!cx || !(lx > 0) || !x.type) continue;
      if (!byType.has(x.type)) byType.set(x.type, []);
      byType.get(x.type).push({ ratio: cx.stored / lx, computed: cx.computed });
    }
    lengthRatios.set(rows, byType);
  }
  const grp = byType.get(r.type) || [];
  const mine = c.stored / len;
  const same = grp.filter((g) => near(g.ratio, mine));
  // at least three elements share the ratio, and their lengths differ (so the
  // stored figure follows the length, not just a repeated section)
  return same.length >= 3 && same.length >= grp.length / 2;
}

export const AREA_REASON_TEXT = {
  "scales-with-length": "the stored cross-section area grows with the element's length (length x a constant): a face area, not a section",
  split: "the same stored area is written on every piece of an element split by level; the pieces' geometry sums to it",
  repeated: "the same stored area is written on several pieces of one element, and the pieces in this file do not sum to it",
  "unit-slip": "the stored area is the geometry's times a power of ten or the square-foot factor 10.7639: converted twice or not at all",
  "net-as-gross": "the stored gross area equals the area with openings taken out (net)",
  "gross-as-net": "the stored net area equals the gross: the openings were not taken out",
  "on-a-face": "the stored area is measured on one face of the element (a wall's side, a tapered or sloped slab's top or bottom), not its middle plane",
  "matches-stored-volume": "the stored area agrees with the stored volume, but both describe a different body than the geometry",
  zero: "the stored area is 0 while the geometry has one: the exporter left the figure unfilled",
  "host-figure": "the same stored cross-section area and length are written on several members of different lengths: a figure copied from their host (a curtain wall's area and length), not the member's section",
  "joins-off": "the stored side area is the mean of the wall's two faces with the strips covered by the walls joined to it taken off (a finishes figure, as ArchiCAD measures it)",
  "faces-averaged": "the stored side area is the mean of the exporter's own outside and inside face areas, its inside face shortened by walls joined to it (a finishes figure)",
  "centre-line": "the stored area is the element's stored centre-line length x its width (footprint) or height (side): a nominal figure that ignores angled or mitred ends",
  "other-width": "the wall is measured across another direction than its thinnest one (a short wall with angled ends): the stored side area is its stored volume / stored width",
  unexplained: "no known cause; check the element in a viewer",
};

export const REASON_TEXT = {
  split: "the same stored volume is written on every piece of an element split by level; the pieces' geometry sums to it",
  repeated: "the same stored volume is written on several pieces of one element, and the pieces in this file do not sum to it",
  "unit-slip": "the stored volume is the geometry's times a power of ten (or the square-foot factor 10.7639): written in the wrong unit",
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
  Object.defineProperty(out, "solids", { value: { body, net: body }, enumerable: false, writable: true });
  const opens = idx.voids.get(e.id) || [];
  if (!opens.length) return out;
  out.openings = opens.length;
  try {
    const W = worldOf(refId(e.args[5]));
    const Winv = invert(W);
    let net = body;
    const each = [];
    for (const oid of opens) {
      const o = E.get(oid);
      if (!o) continue;
      const orep = bodyRepresentation(E, refId(o.args[6]));
      if (!orep) throw new Unresolved("opening with no body");
      const ob = bodyOf(orep);
      if (ob.error) throw new Unresolved(`opening: ${ob.error}`);
      // a faceted opening or body is taken as polyhedra when all its faces are known
      const obT = asTerms(ob);
      if (!obT) throw new Unresolved("faceted opening");
      const inElem = transformSolid(obT, mul(Winv, worldOf(refId(o.args[5]))));
      if (net.mesh) net = asTerms(net) ?? net;
      if (net.mesh) throw new Unresolved("opening in a faceted body");
      const cutters = cuttersOf(inElem);
      net = subtractCutters(net, cutters, "opening");
      each.push({ id: oid, cutters });
    }
    out.net = Math.abs(solidVolume(net)) * f3;
    out.solids.net = net;
    // each opening on its own: what it takes out of the body, so a method of
    // measurement can leave small voids in (measure.mjs)
    const base = body.mesh ? asTerms(body) : body;
    if (base && !base.mesh) {
      out.solids.each = [];
      out.voids = [];
      for (const o of each) {
        const alone = subtractCutters(base, o.cutters, "opening");
        out.solids.each.push(alone);
        out.voids.push({ id: o.id, volume: Math.max(0, gross - Math.abs(solidVolume(alone)) * f3) });
      }
    }
  } catch (err) {
    out.solids.net = null;
    out.net = null;
    out.netReason = err instanceof Unresolved ? err.message : `error: ${err.message}`;
  }
  return out;
}

/**
 * The element's axis-aligned box in world coordinates, in metres:
 * [xmin, ymin, zmin, xmax, ymax, zmax]. The change report (diff.mjs) matches
 * elements that lost their GlobalId by it, and reports moves.
 */
function worldBox(body, W, f) {
  const lo = [], hi = [];
  for (let i = 0; i < 3; i++) {
    const d = [W[4 * i], W[4 * i + 1], W[4 * i + 2]];
    const len = Math.hypot(...d);
    const [a, b] = solidExtent(body, d);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    lo.push((a * len + W[4 * i + 3]) * f);
    hi.push((b * len + W[4 * i + 3]) * f);
  }
  return [...lo, ...hi];
}

// ---- areas from geometry ---------------------------------------------------
//
// Each area a quantity set stores is a section of the body by a plane through
// its middle (the definitions in Qto_WallBaseQuantities, Qto_SlabBaseQuantities
// and the member sets):
//   side       walls: the middle plane of the wall, normal to its width
//              (GrossSideArea, NetSideArea);
//   footprint  walls: the horizontal plane at mid-height (GrossFootprintArea,
//              NetFootprintArea);
//   plan       slabs, plates, coverings, roofs: the plane normal to the
//              extrusion through mid-thickness, i.e. the extruded profile
//              (GrossArea, NetArea);
//   cross      columns, beams, members, piles: the plane normal to the
//              extrusion at mid-length (CrossSectionArea).
// Gross cuts the body; net cuts the body less its openings.

const AREA_RULES = [
  { classes: /^IFCWALL/, name: "grosssidearea", kind: "side", which: "gross" },
  { classes: /^IFCWALL/, name: "netsidearea", kind: "side", which: "net" },
  { classes: /^IFCWALL/, name: "grossfootprintarea", kind: "footprint", which: "gross" },
  { classes: /^IFCWALL/, name: "netfootprintarea", kind: "footprint", which: "net" },
  { classes: /^IFC(SLAB|PLATE|COVERING|ROOF)/, name: "grossarea", kind: "plan", which: "gross" },
  { classes: /^IFC(SLAB|PLATE|COVERING|ROOF)/, name: "netarea", kind: "plan", which: "net" },
  { classes: /^IFC(COLUMN|BEAM|MEMBER|PILE)/, name: "crosssectionarea", kind: "cross", which: "gross" },
];
export const AREA_KINDS = { side: /^IFCWALL/, footprint: /^IFCWALL/, plan: /^IFC(SLAB|PLATE|COVERING|ROOF)/, cross: /^IFC(COLUMN|BEAM|MEMBER|PILE)/ };

function computeAreas(type, solids, W, f) {
  const out = {};
  const { body, net } = solids;
  // a faceted part is cut through its faces; null when some of them are unknown
  if (body.mesh && !body.shells) return { faceted: true };
  const f2 = f * f;
  const up = [W[8], W[9], W[10]];
  const len = Math.hypot(...up);
  const v = len > 0 ? up.map((x) => x / len) : [0, 0, 1];
  // at = where along n, as a fraction of the body's extent (0.5: the middle)
  const cut = (n, at = 0.5, each = false) => {
    const [lo, hi] = extentOf(body, n);
    if (!(hi > lo)) return { gross: null, net: null, n };
    const k = lo + (hi - lo) * at + (hi - lo) * 1e-7;
    const g = sectionArea(body, n, k);
    const nt = net && g != null ? sectionArea(net, n, k) : null;
    const res = { gross: g == null ? null : g * f2, net: nt == null ? null : nt * f2, n };
    // the area each opening takes out of this section on its own (measure.mjs)
    if (each && g != null && solids.each) res.voids = solids.each.map((a) => { const x = sectionArea(a, n, k); return x == null ? null : Math.max(0, (g - x) * f2); });
    return res;
  };
  if (AREA_KINDS.side.test(type)) {
    const t = thinnestNormal(body, (n) => Math.abs(n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) < 1e-3);
    if (t) {
      out.side = { ...cut(t.n, 0.5, true), width: t.width * f };
      // the same plane moved to each face: some tools measure a side there
      const a = cut(t.n, 1e-4), b = cut(t.n, 1 - 2e-4);
      out.side.faces = { gross: [a.gross, b.gross], net: [a.net, b.net] };
    }
    // the plan at the wall's base: doors cut it, windows do not
    out.footprint = cut(v, 1e-4);
  }
  if (AREA_KINDS.plan.test(type)) {
    // the extrusion direction: the quantity set's area is "the extruded area"
    // (its profile), even for a sill or coping extruded along its length; on
    // the 8 corpus models choosing the thinnest direction instead dropped 226
    // agreeing pairs. With no extrusion, the thinnest direction.
    // A faceted body has lost its extrusion. A slab, plate or roof is still
    // cut across its thinnest direction (a sloped roof slab too); a covering
    // normal to the element's own up, as ArchiCAD extrudes cladding and
    // insulation upward: on schependomlaan's 728 faceted coverings, 533 agree
    // this way against 196 across the thinnest direction, while its slabs
    // agree 213 of 275 across the thinnest and 200 normal to up
    // (eval/areas-vs-stored-2026-11-20.md). A choice fitted on one model.
    const meshUp = !body.terms.length && /^IFCCOVERING/.test(type);
    const n = body.axis ?? (meshUp ? v : thinnestNormal(body)?.n);
    if (n) {
      out.plan = cut(n, 0.5, true);
      // the same plane moved to each face: a tapered or sloped slab's stored
      // area is sometimes its top or bottom face
      const a = cut(n, 1e-4), b = cut(n, 1 - 2e-4);
      out.plan.faces = { gross: [a.gross, b.gross], net: [a.net, b.net] };
    }
  }
  if (AREA_KINDS.cross.test(type)) {
    // a faceted member has no extrusion: its length runs along the face
    // normal (an end face's) in whose direction the body is longest
    const n = body.axis ?? (body.terms.length ? null : thinnestNormal(body, () => true, true)?.n);
    if (n) out.cross = cut(n);
  }
  return out;
}

const extentOf = solidExtent;

/** Compares areas computed from geometry with the stored ones the rules name. */
function checkAreas(row, tol) {
  const A = row.computed?.areas;
  if (!A || A.error || A.faceted) return null;
  const res = {};
  for (const [k, q] of Object.entries(row.stored)) {
    if (q.kind !== "area") continue;
    const key = k.toLowerCase().replace(/\s+/g, "");
    const rule = AREA_RULES.find((r) => r.name === key && r.classes.test(row.ifcType));
    if (!rule) continue;
    const c = A[rule.kind]?.[rule.which];
    if (c == null) continue;
    const diff = c - q.value;
    const rel = q.value !== 0 ? diff / q.value : (c === 0 ? 0 : Infinity);
    res[k] = { kind: rule.kind, which: rule.which, computed: c, stored: q.value, diff, rel, agree: Math.abs(rel) <= tol || Math.abs(diff) < 1e-4 };
  }
  return Object.keys(res).length ? res : null;
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
  // area: the stored figure unless its check says not to sum it (split,
  // repeated, unit slip, not a section), else the area cut from the geometry
  const AREA_NAMES = ["netsidearea", "netarea", "netfloorarea", "netsurfacearea", "grosssidearea", "grossarea", "area"];
  let area = null, areaSource = null;
  for (const n of AREA_NAMES) {
    const hit = Object.entries(s).find(([k, q]) => q.kind === "area" && k.toLowerCase() === n);
    if (!hit) continue;
    const chk = r.areaCheck?.[hit[0]];
    if (chk && chk.trust === false) { area = chk.computed; areaSource = "computed"; } else { area = hit[1].value; areaSource = "stored"; }
    break;
  }
  if (area == null) { const ca = primaryArea(r); if (ca != null) { area = ca; areaSource = "computed"; } }
  return {
    volume: storedNet ?? comp,
    volumeSource: storedNet != null ? "stored" : comp != null ? "computed" : null,
    area,
    areaSource,
    length: first(["length", "netlength", "grosslength"], "length"),
    weight: first(["netweight", "grossweight", "weight"], "weight"),
  };
}

/** The area a row's geometry gives for its class: a wall's net side area, a slab's net plan area. */
export function primaryArea(r) {
  const A = r.computed?.areas;
  if (!A || A.error || A.faceted) return null;
  const pick = A.side ?? A.plan;
  if (!pick) return null;
  return pick.net ?? pick.gross;
}

/**
 * Bill-of-quantities lines: one per distinct value of the `by` keys.
 * Assemblies whose parts are elements themselves (a stair and its flights,
 * a curtain wall and its panels) are left out so nothing is counted twice.
 */
export function boq(rows, by = ["class", "type"], rule = null) {
  const measured = ruleActive(rule);
  const lines = new Map();
  for (const r of rows) {
    if (r.isAssembly) continue;
    const key = by.map((k) => GROUP_KEYS[k](r));
    const k = JSON.stringify(key);
    let L = lines.get(k);
    if (!L) { L = { key, count: 0, volume: 0, volumeStored: 0, volumeComputed: 0, volumeMissing: 0, area: 0, areaComputed: 0, length: 0, weight: 0, disagree: 0, voidsLeft: 0, areaChange: 0, volumeChange: 0, ruleSkipped: 0 }; lines.set(k, L); }
    const q = measured ? applyRule(r, rowQuantities(r), rule) : rowQuantities(r);
    if (measured) { L.voidsLeft += q.voidsLeft; L.areaChange += q.areaChange; L.volumeChange += q.volumeChange; if (q.ruleNotes.length) L.ruleSkipped++; }
    L.count++;
    if (q.volume != null) { L.volume += q.volume; if (q.volumeSource === "stored") L.volumeStored++; else L.volumeComputed++; } else L.volumeMissing++;
    if (q.area != null) { L.area += q.area; if (q.areaSource === "computed") L.areaComputed++; }
    if (q.length != null) L.length += q.length;
    if (q.weight != null) L.weight += q.weight;
    if ((r.check && ((r.check.gross && !r.check.gross.agree) || (r.check.net && !r.check.net.agree))) || Object.values(r.areaCheck || {}).some((c) => !c.agree)) L.disagree++;
  }
  return [...lines.values()].sort((a, b) => a.key.join("\u0000").localeCompare(b.key.join("\u0000")));
}

const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

export function boqCsv(lines, by, rates = {}, rule = null) {
  const measured = ruleActive(rule);
  const head = [...by.map((k) => k[0].toUpperCase() + k.slice(1)), "Count", "Volume m3", "Area m2", "Length m", "Weight kg", "Volume from model's stored quantities", "Volume computed here", "No volume", "Areas computed here", "Rows where stored and computed disagree", "Rate", "Rate unit", "Amount"];
  if (measured) head.push(`Voids not deducted (area up to ${rule.areaMax} m2, volume up to ${rule.volumeMax} m3)`, "Area added back m2", "Volume added back m3", "Rows the rule could not adjust");
  const out = [head.map(csvCell).join(",")];
  for (const L of lines) {
    const k = JSON.stringify(L.key);
    const rate = rates[k];
    let amount = null;
    if (rate && Number.isFinite(rate.rate)) amount = rate.rate * ({ each: L.count, m3: L.volume, m2: L.area, m: L.length, kg: L.weight }[rate.unit] ?? 0);
    const cells = [...L.key, L.count, L.volume, L.area, L.length, L.weight, L.volumeStored, L.volumeComputed, L.volumeMissing, L.areaComputed, L.disagree, rate ? rate.rate : null, rate ? rate.unit : null, amount];
    if (measured) cells.push(L.voidsLeft, L.areaChange, L.volumeChange, L.ruleSkipped);
    out.push(cells.map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

export function rowsCsv(rows) {
  const head = ["Entity", "GlobalId", "Class", "Name", "Type", "Storey", "Material", "Classification", "Assembly", "Part of", "Computed gross m3", "Computed net m3", "Openings", "Geometry status", "Stored GrossVolume m3", "Stored NetVolume m3", "Volume check", "Computed gross area m2", "Computed net area m2", "Area measured", "Area check", "Stored quantities"];
  const out = [head.map(csvCell).join(",")];
  for (const r of rows) {
    const c = r.computed || {};
    const g = r.check && r.check.gross, n = r.check && r.check.net;
    const verdict = !r.check ? "" : [g && (g.agree ? "gross agrees" : `gross differs ${(g.rel * 100).toFixed(1)}%`), n && (n.agree ? "net agrees" : `net differs ${(n.rel * 100).toFixed(1)}%`)].filter(Boolean).join("; ");
    const stored = Object.entries(r.stored).map(([k, q]) => `${k}=${Math.round(q.value * 1e6) / 1e6}`).join("; ");
    const A = c.areas && !c.areas.error && !c.areas.faceted ? (c.areas.side ? ["side", c.areas.side] : c.areas.plan ? ["plan", c.areas.plan] : c.areas.cross ? ["cross-section", c.areas.cross] : null) : null;
    const areaVerdict = Object.entries(r.areaCheck || {}).map(([k, a]) => a.agree ? `${k} agrees` : `${k} differs ${a.rel === Infinity ? "" : (a.rel * 100).toFixed(1) + "%"}${a.reason ? " (" + a.reason + ")" : ""}`).join("; ");
    out.push([`#${r.id}`, r.globalId, r.ifcClass, r.name, r.type, r.storey, r.material, r.classification, r.isAssembly ? "yes" : "", r.parent ? `#${r.parent}` : "", c.gross, c.net, c.openings, c.status === "ok" ? (c.net == null ? `net not computed: ${c.netReason}` : "ok") : c.status ? `${c.status}${c.reason ? ": " + c.reason : ""}` : "", g ? g.stored : null, n ? n.stored : null, verdict, A ? A[1].gross : null, A ? A[1].net : null, A ? A[0] : "", areaVerdict, stored].map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

/** Totals of the check across rows, for the page's summary and the eval. */
export function checkSummary(rows) {
  const s = { elements: rows.length, computed: 0, notRead: 0, noBody: 0, grossPairs: 0, grossAgree: 0, netPairs: 0, netAgree: 0, netNotComputed: 0, areaPairs: 0, areaAgree: 0, reasons: {} };
  for (const r of rows) {
    const c = r.computed;
    if (!c) continue;
    if (c.status === "ok") s.computed++;
    else if (c.status === "no body") s.noBody++;
    else { s.notRead++; s.reasons[c.reason] = (s.reasons[c.reason] || 0) + 1; }
    if (c.status === "ok" && c.net == null) { s.netNotComputed++; s.reasons["net: " + c.netReason] = (s.reasons["net: " + c.netReason] || 0) + 1; }
    if (r.check?.gross) { s.grossPairs++; if (r.check.gross.agree) s.grossAgree++; }
    if (r.check?.net) { s.netPairs++; if (r.check.net.agree) s.netAgree++; }
    for (const a of Object.values(r.areaCheck || {})) { s.areaPairs++; if (a.agree) s.areaAgree++; }
  }
  return s;
}
