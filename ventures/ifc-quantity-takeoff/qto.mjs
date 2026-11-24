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

import { barShape, readBarProps, toMm, massPerMetre } from "./rebar.mjs";
import { applyRule, ruleActive, ruleLabel } from "./measure.mjs";
import { assignUniformat, uniformatLabel } from "./uniformat.mjs";
import { roomGeometry, checkRoom, roomLabel, assignRooms, footprintSolid, deductOpenings, connectionArea, OPENING_CLASS } from "./rooms.mjs";
import { planRect, roofFaces, assignEnvelope, assignRailingSides } from "./envelope.mjs";
import { Geometry, Unresolved, det, asTerms, solidVolume, mul, invert, subtractCutters, cuttersOf, transformSolid, sectionArea, surfaceArea, planeAreas, bendsInPlan, curvedFaces, prismAxis, thinnestNormal, solidExtent, barExtent, shellPlanArea } from "./geom.mjs";

const NOT_ELEMENTS = new Set([
  "IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE", "IFCOPENINGELEMENT", "IFCOPENINGSTANDARDCASE",
  "IFCVOIDINGFEATURE", "IFCANNOTATION", "IFCGRID", "IFCDISTRIBUTIONPORT", "IFCVIRTUALELEMENT", "IFCSPATIALZONE",
  "IFCEXTERNALSPATIALELEMENT", "IFCFACILITY", "IFCFACILITYPART", "IFCBRIDGE", "IFCBRIDGEPART", "IFCROAD", "IFCROADPART",
  "IFCRAILWAY", "IFCRAILWAYPART", "IFCMARINEFACILITY", "IFCMARINEPART", "IFCALIGNMENT", "IFCPROXY", "IFCSTRUCTURALCURVEMEMBER",
  "IFCSTRUCTURALSURFACEMEMBER", "IFCSTRUCTURALPOINTCONNECTION", "IFCSTRUCTURALCURVECONNECTION", "IFCSTRUCTURALSURFACECONNECTION",
  "IFCSTRUCTURALPOINTACTION", "IFCSTRUCTURALCURVEACTION", "IFCSTRUCTURALSURFACEACTION", "IFCSTRUCTURALPOINTREACTION",
  "IFCGEOGRAPHICELEMENT", "IFCCIVILELEMENT", "IFCREFERENT", "IFCLINEARPOSITIONINGELEMENT", "IFCSPACEBOUNDARY",
  // IFC4X3 alignment layouts: reference lines a part is placed on, nothing to build
  "IFCALIGNMENTSEGMENT", "IFCALIGNMENTHORIZONTAL", "IFCALIGNMENTVERTICAL", "IFCALIGNMENTCANT", "IFCLINEARELEMENT",
]);

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12 };

const str = (v) => (typeof v === "string" ? v : v && typeof v === "object" && "typed" in v && typeof v.value === "string" ? v.value : null);
const refId = (v) => (v && typeof v === "object" && v.ref !== undefined ? v.ref : null);
const numOf = (v) => (typeof v === "number" ? v : v && typeof v === "object" && "typed" in v ? numOf(v.value) : null);

// The exact SI value of the conversion-based units IFC exporters name
// (IFC2X3 8.11.3.2 lists the names). A unit carrying one of these names but
// a factor more than 0.1% away from it is an exporter fault, not a different
// unit: Revit's 2014-era exporter wrote 'INCH' as 3.6576 m (144 inches, its
// foot factor times 12 twice) while the coordinates were in real inches
// (Lake Kegonsa Home, 2014-10-14 export: the same window's OverallHeight is
// 4.677 in the foot-unit export before it and 56.125 here; eval/units-repair-2026-11-20.md).
// Trusting the factor makes every size 144 times too big. Names that differ
// between countries (gallon, ton) are left alone.
export const NAMED_UNITS = {
  LENGTHUNIT: { INCH: 0.0254, FOOT: 0.3048, YARD: 0.9144, MILE: 1609.344 },
  AREAUNIT: { "SQUARE INCH": 0.00064516, "SQUARE FOOT": 0.09290304, "SQUARE YARD": 0.83612736, ACRE: 4046.8564224, "SQUARE MILE": 2589988.110336 },
  VOLUMEUNIT: { "CUBIC INCH": 1.6387064e-5, "CUBIC FOOT": 0.028316846592, "CUBIC YARD": 0.764554857984, LITRE: 0.001 },
  MASSUNIT: { POUND: 0.45359237, OUNCE: 0.028349523125 },
  PLANEANGLEUNIT: { DEGREE: Math.PI / 180 },
};

/**
 * Factor to SI of each unit type in an IfcUnitAssignment (the project's
 * units). `repairs` lists each named unit whose declared factor was replaced
 * by the name's exact value (see NAMED_UNITS); `opts.trustDeclared` keeps
 * the declared factors instead.
 */
export function readUnits(model, opts = {}) {
  const E = model.entities;
  const out = { LENGTHUNIT: 1, AREAUNIT: 1, VOLUMEUNIT: 1, MASSUNIT: 1, PLANEANGLEUNIT: 1, names: {}, repairs: [] };
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
      const type = u.args[1] && u.args[1].enum, name = str(u.args[2]);
      const f = (v ?? 1) * (base ? base.f : 1);
      const key = name && name.trim().toUpperCase().replace(/\s+/g, " ");
      const exact = key && NAMED_UNITS[type] && Object.hasOwn(NAMED_UNITS[type], key) ? NAMED_UNITS[type][key] : null;
      if (exact != null && !opts.trustDeclared && Math.abs(f - exact) > 1e-3 * exact) return { type, f: exact, name, repaired: { declared: f, used: exact } };
      return { type, f, name };
    }
    return null;
  };
  for (const r of ua.args[0] || []) {
    const u = factorOf(E.get(refId(r)));
    if (u && u.type && Object.hasOwn(out, u.type) && u.type !== "names" && u.type !== "repairs") {
      out[u.type] = u.f; out.names[u.type] = u.name;
      if (u.repaired) out.repairs.push({ type: u.type, name: u.name, ...u.repaired });
    }
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
  const storeyOf = new Map(), typeOf = new Map(), qsets = new Map(), psets = new Map(), material = new Map(), classif = new Map(), voids = new Map(), parentOf = new Map(), children = new Map(), pathJoins = new Map(), fills = new Map(), openingHost = new Map(), glass = new Set();
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
      else if (d && d.type === "IFCPROPERTYSET") for (const r of e.args[4] || []) push(psets, refId(r), d.id);
    } else if (t === "IFCRELASSOCIATESMATERIAL") {
      for (const r of e.args[4] || []) material.set(refId(r), refId(e.args[5]));
    } else if (t === "IFCRELASSOCIATESCLASSIFICATION") {
      for (const r of e.args[4] || []) push(classif, refId(r), refId(e.args[5]));
    } else if (t === "IFCRELVOIDSELEMENT") {
      push(voids, refId(e.args[4]), refId(e.args[5]));
      openingHost.set(refId(e.args[5]), refId(e.args[4]));
    } else if (t === "IFCRELFILLSELEMENT") {
      fills.set(refId(e.args[5]), refId(e.args[4]));
    } else if (t === "IFCRELCONNECTSPATHELEMENTS") {
      // a wall whose start or end sits on another wall's path (a T-join):
      // its end covers a strip of that wall's face
      const a = refId(e.args[5]), b = refId(e.args[6]), tb = e.args[9]?.enum, ta = e.args[10]?.enum;
      if (ta === "ATPATH" && tb && tb !== "ATPATH") push(pathJoins, a, b);
      if (tb === "ATPATH" && ta && ta !== "ATPATH") push(pathJoins, b, a);
    } else if (t === "IFCSTYLEDITEM") {
      // a representation item drawn see-through or in a style named glass:
      // the glazing a window's frame volume leaves out (glazingVolume)
      if (e.args[0] != null && isGlassStyle(E, e.args[1])) glass.add(refId(e.args[0]));
    } else if (t === "IFCRELAGGREGATES" || t === "IFCRELNESTS") {
      if (t === "IFCRELAGGREGATES") for (const r of e.args[5] || []) { parentOf.set(refId(r), refId(e.args[4])); push(children, refId(e.args[4]), refId(r)); }
    }
  }
  return { storeyOf, typeOf, qsets, psets, material, classif, voids, parentOf, children, pathJoins, fills, openingHost, glass };
}

// whole words only: ArchiCAD's "Isolatie - glaswol" is glass wool, not a pane
const GLASS_NAME = /\b(glas|glass|glazing|glazed|vitrage|verre|vidrio|vetro)\b/i;
/**
 * A styled item's styles (IFC2X3: through IfcPresentationStyleAssignment;
 * IFC4: IfcSurfaceStyle directly) mark glass when a surface style is named
 * like glass or renders part see-through (transparency above 0 and below 1:
 * a style drawn fully invisible is air or a void, not a pane).
 */
function isGlassStyle(E, styles) {
  const seen = [];
  for (const r of styles || []) {
    const s = E.get(refId(r));
    if (!s) continue;
    if (s.type === "IFCPRESENTATIONSTYLEASSIGNMENT") for (const x of s.args[0] || []) { const y = E.get(refId(x)); if (y) seen.push(y); }
    else seen.push(s);
  }
  for (const s of seen) {
    if (s.type !== "IFCSURFACESTYLE") continue;
    if (GLASS_NAME.test(str(s.args[0]) ?? "")) return true;
    for (const x of s.args[2] || []) {
      const y = E.get(refId(x));
      if (y && /^IFCSURFACESTYLE(RENDERING|SHADING)$/.test(y.type) && (numOf(y.args[1]) ?? 0) > 0 && numOf(y.args[1]) < 1) return true;
    }
  }
  return false;
}

/**
 * The volume of a body's glass items (idx.glass), in model units cubed, and
 * how many there are; mapped items are followed into their source with the
 * mapping's scale. Null when the body has none.
 *
 * `planes` groups the panes by the plane they sit in, in the body's frame: a
 * pane's thinnest box axis and its span along it (glassPlanes). A door with
 * side lights holds its leaf glass in one plane and the side lights' in
 * another (schependomlaan's "D2R 2zl 18" doors), and some objects store the
 * body less one plane's glass only (glazingLeftOut).
 */
function glazingVolume(E, geo, idx, repId, depth = 0, M = null) {
  const rep = E.get(repId);
  if (!rep || !idx.glass.size || depth > 4) return null;
  let volume = 0, pieces = 0;
  const boxes = [];
  for (const it of rep.args[3] || []) {
    const id = refId(it), item = E.get(id);
    if (!item) continue;
    if (idx.glass.has(id)) {
      let s;
      try { s = geo.item(id); volume += Math.abs(solidVolume(s)); pieces++; } catch { return null; }
      const box = paneBox(M ? transformSolid(s, M) : s);
      if (box) boxes.push({ ...box, volume: Math.abs(solidVolume(s)) * (M ? Math.abs(det(M)) : 1) });
    } else if (item.type === "IFCMAPPEDITEM") {
      const map = E.get(refId(item.args[0]));
      let op;
      try { op = mul(geo.operator(item.args[1]), invert(geo.placement(map?.args[0]))); } catch { op = geo.operator(item.args[1]); }
      const inner = map ? glazingVolume(E, geo, idx, refId(map.args[1]), depth + 1, M ? mul(M, op) : op) : null;
      if (inner) {
        volume += inner.volume * Math.abs(det(geo.operator(item.args[1])));
        pieces += inner.pieces;
        boxes.push(...inner.boxes);
      }
    }
  }
  return pieces ? { volume, pieces, boxes, planes: depth ? null : glassPlanes(boxes) } : null;
}

/** a pane's box: its thinnest axis and its lowest and highest coordinate along it */
function paneBox(s) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of s.terms || []) for (const f of t.faces) for (const p of f) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  if (s.shells) for (const sh of s.shells) for (const f of sh.loops) for (const p of f) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  if (!(hi[0] >= lo[0])) return null;
  let axis = 0;
  for (let k = 1; k < 3; k++) if (hi[k] - lo[k] < hi[axis] - lo[axis]) axis = k;
  return { axis, lo: lo[axis], hi: hi[axis] };
}

/**
 * Panes in one plane: the same thinnest axis, and both faces within a tenth of
 * the thinner pane's thickness of each other. -> [{volume, pieces}]
 */
export function glassPlanes(boxes) {
  const planes = [];
  for (const b of boxes) {
    const t = b.hi - b.lo;
    const p = planes.find((q) => q.axis === b.axis && Math.abs(q.lo - b.lo) <= 0.1 * Math.min(t, q.hi - q.lo) && Math.abs(q.hi - b.hi) <= 0.1 * Math.min(t, q.hi - q.lo));
    if (p) { p.volume += b.volume; p.pieces++; } else planes.push({ axis: b.axis, lo: b.lo, hi: b.hi, volume: b.volume, pieces: 1 });
  }
  return planes.map(({ volume, pieces }) => ({ volume, pieces }));
}

/**
 * The IfcMaterial entities a material assignment reaches (layers, profiles,
 * constituents, list items), as {id, name} in file order, each once. The
 * change report (diff.mjs) reads them to tell a material renamed in place
 * from an element given another material: IfcMaterial has no GlobalId.
 */
function materialLeaves(E, id, out = [], depth = 0) {
  const m = E.get(id);
  if (!m || depth > 5) return out;
  const down = (r) => materialLeaves(E, refId(r), out, depth + 1);
  switch (m.type) {
    case "IFCMATERIAL": if (!out.some((x) => x.id === id)) out.push({ id, name: str(m.args[0]) }); break;
    case "IFCMATERIALLAYERSETUSAGE": case "IFCMATERIALPROFILESETUSAGE": case "IFCMATERIALLAYER": down(m.args[0]); break;
    case "IFCMATERIALLAYERSET": case "IFCMATERIALLIST": for (const r of m.args[0] || []) down(r); break;
    case "IFCMATERIALCONSTITUENTSET": case "IFCMATERIALPROFILESET": for (const r of m.args[2] || []) { const c = E.get(refId(r)); if (c) down(c.args[2]); } break;
    default: break;
  }
  return out;
}

/** The layer set, profile set, constituent set or list an assignment names (through its usage), as {id, kind, name}. */
const SET_NAME_ARG = new Map([["IFCMATERIALLAYERSET", 1], ["IFCMATERIALPROFILESET", 0], ["IFCMATERIALCONSTITUENTSET", 0]]);
function materialSet(E, id) {
  let m = E.get(id);
  if (m && (m.type === "IFCMATERIALLAYERSETUSAGE" || m.type === "IFCMATERIALPROFILESETUSAGE")) { id = refId(m.args[0]); m = E.get(id); }
  const named = !!m && SET_NAME_ARG.has(m.type);
  if (!m || !(named || m.type === "IFCMATERIALLIST")) return null;
  return { id, kind: m.type, name: named ? str(m.args[SET_NAME_ARG.get(m.type)]) : null };
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

/** Every code an element's classification references carry: [{ code, name, system }]. */
function classificationCodes(E, ids) {
  const out = [];
  for (const id of ids || []) {
    const c = E.get(id);
    if (!c || c.type !== "IFCCLASSIFICATIONREFERENCE") continue;
    const code = str(c.args[1]);
    const src = E.get(refId(c.args[3]));
    if (code) out.push({ code, name: str(c.args[2]), system: src && src.type === "IFCCLASSIFICATION" ? str(src.args[3]) : null });
  }
  return out;
}

/** The first enumeration in args[from..] that is a real choice (not NOTDEFINED or USERDEFINED). */
function predefinedOf(e, from) {
  for (let i = from; i < (e?.args.length ?? 0); i++) {
    const v = e.args[i];
    if (v && typeof v === "object" && typeof v.enum === "string") return v.enum === "NOTDEFINED" || v.enum === "USERDEFINED" ? null : v.enum;
  }
  return null;
}

/** IsExternal and an Assembly Code from a list of property sets. */
function readProps(E, ids, out) {
  for (const id of ids || []) {
    const ps = E.get(id);
    if (!ps || ps.type !== "IFCPROPERTYSET") continue;
    for (const pr of ps.args[4] || []) {
      const p = E.get(refId(pr));
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE") continue;
      const name = str(p.args[0]);
      const v = p.args[2] && typeof p.args[2] === "object" && "typed" in p.args[2] ? p.args[2].value : p.args[2];
      if (name === "IsExternal" && typeof v === "boolean" && out.isExternal == null) out.isExternal = v;
      else if ((name === "Assembly Code" || name === "AssemblyCode") && typeof v === "string" && v.trim()) out.codes.push({ code: v.trim(), from: name });
    }
  }
}

/**
 * A room's single-value properties as {"Pset.Property": text}: what a brief
 * or a room data sheet writes on a space (its use, finishes, an occupancy).
 * Lists, references and quantities are left out; values are written as text
 * so two revisions compare as strings.
 */
function spaceProperties(E, ids) {
  const out = {};
  for (const id of ids || []) {
    const ps = E.get(id);
    if (!ps || ps.type !== "IFCPROPERTYSET") continue;
    const set = str(ps.args[2]) ?? `#${id}`;
    for (const pr of ps.args[4] || []) {
      const p = E.get(refId(pr));
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE") continue;
      const name = str(p.args[0]);
      if (!name) continue;
      const raw = p.args[2] && typeof p.args[2] === "object" && "typed" in p.args[2] ? p.args[2].value : p.args[2];
      const v = raw == null ? null : typeof raw === "object" ? (typeof raw.enum === "string" ? raw.enum : null) : String(raw);
      out[`${set}.${name}`] = v;
    }
  }
  return out;
}

/**
 * A reinforcing bar's own schedule figures (rebar.mjs readBarProps) from its
 * property sets and its type's, with the nominal diameter in mm (the
 * properties', else the bar's or its type's NominalDiameter attribute), the
 * grade (else the SteelGrade attribute) and the file's bar length in metres.
 */
function barPropsOf(E, idx, e, te, f) {
  const p = readBarProps(E, [...(idx.psets.get(e.id) || []), ...(te ? (te.args[5] || []).map(refId) : [])]);
  const attrD = numOf(e.args[9]) ?? (te?.type === "IFCREINFORCINGBARTYPE" ? numOf(te.args[10]) : null);
  p.diameterMm = toMm(p.diameter, f) ?? toMm(attrD, f);
  if (p.grade == null && typeof e.args[8] === "string" && e.args[8].trim()) p.grade = e.args[8].trim();
  if (p.shape == null && te?.type === "IFCREINFORCINGBARTYPE" && typeof te.args[14] === "string" && te.args[14].trim()) p.shape = te.args[14].trim();
  const attrL = numOf(e.args[11]) ?? (te?.type === "IFCREINFORCINGBARTYPE" ? numOf(te.args[12]) : null);
  p.lengthM = p.length != null ? p.length * f : attrL != null ? attrL * f : null;
  return p;
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

/**
 * The one profile a body is swept from: every item an IfcExtrudedAreaSolid of
 * the same profile, or such a solid clipped by half-spaces (Tekla's cut
 * ends). Else null. A planar cut of a prism keeps the ratio of two sections'
 * volumes equal to the ratio of their areas when the sections share a
 * centroid (I, tube), and close to it otherwise (a filleted L).
 */
function sweptProfile(E, repId) {
  const rep = repId != null ? E.get(repId) : null;
  if (!rep || !Array.isArray(rep.args[3]) || !rep.args[3].length) return null;
  const HALF = new Set(["IFCHALFSPACESOLID", "IFCPOLYGONALBOUNDEDHALFSPACE", "IFCBOXEDHALFSPACE"]);
  const of = (id, depth = 0) => {
    const x = E.get(id);
    if (!x || depth > 20) return null;
    if (x.type === "IFCEXTRUDEDAREASOLID") return refId(x.args[0]);
    if (x.type === "IFCBOOLEANCLIPPINGRESULT") {
      const second = E.get(refId(x.args[2]));
      return second && HALF.has(second.type) ? of(refId(x.args[1]), depth + 1) : null;
    }
    return null;
  };
  let pid = null;
  for (const it of rep.args[3]) {
    const p = of(refId(it));
    if (p == null || (pid != null && p !== pid)) return null;
    pid = p;
  }
  return pid;
}

/**
 * The skin of a body that is one extruded profile, optionally clipped by
 * half-spaces: each profile edge swept along the extrusion (|edge x depth
 * vector|) plus both ends. A clipped body's sides are scaled by its volume
 * over the unclipped extrusion's (end cuts shorten every side alike); its
 * ends are counted at the profile's area. Model units squared; null when the
 * representation is anything else. {area: outside and ends, inside: the
 * sides of the profile's holes (a tube's bore), clipped}
 */
export function profileSkin(E, geo, repId, body) {
  const rep = repId != null ? E.get(repId) : null;
  if (!rep || !Array.isArray(rep.args[3]) || rep.args[3].length !== 1) return null;
  let x = E.get(refId(rep.args[3][0])), clipped = false;
  // a mapped item (Revit's members): the one item of the map's representation;
  // a scaled mapping fails the volume check below
  for (let i = 0; x && x.type === "IFCMAPPEDITEM" && i < 10; i++) {
    const r = E.get(refId(E.get(refId(x.args[0]))?.args[1]));
    if (!r || !Array.isArray(r.args[3]) || r.args[3].length !== 1) return null;
    x = E.get(refId(r.args[3][0]));
  }
  for (let i = 0; x && x.type === "IFCBOOLEANCLIPPINGRESULT" && i < 20; i++) { clipped = true; x = E.get(refId(x.args[1])); }
  if (!x || x.type !== "IFCEXTRUDEDAREASOLID") return null;
  const loops = geo.profile(refId(x.args[0]));
  const d = geo.dir(x.args[2], [0, 0, 1]), depth = geo.num(x.args[3]);
  if (!(depth > 0) || !loops?.length) return null;
  const D = [d[0] * depth, d[1] * depth, d[2] * depth];
  // outer loops' sides are the outside; a hole's (a tube's bore) the inside
  let side = 0, inner = 0, area = 0;
  for (const l of loops) {
    const P = l.pts;
    let a = 0, sw = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      // |(ex, ey, 0) x D|
      sw += Math.hypot(ey * D[2], -ex * D[2], ex * D[1] - ey * D[0]);
      a += p[0] * q[1] - q[0] * p[1];
    }
    if (l.s > 0) side += sw; else inner += sw;
    area += l.s * Math.abs(a) / 2;
  }
  const full = Math.abs(area) * Math.abs(D[2]);
  const V = body ? Math.abs(solidVolume(body)) : full;
  if (!(full > 0) || !(V > 0) || V > full * 1.005) return null;
  const k = clipped ? V / full : 1;
  // an unclipped body that does not hold the extrusion's volume is not this profile
  if (!clipped && Math.abs(V - full) > 0.005 * full) return null;
  return { area: side * k + 2 * Math.abs(area), inside: inner * k, clipped };
}

export function isElement(e) {
  if (NOT_ELEMENTS.has(e.type) || e.type.endsWith("TYPE") || e.type.startsWith("IFCREL")) return false;
  const a = e.args;
  if (a.length < 7 || typeof a[0] !== "string" || a[0].length !== 22) return false;
  return refId(a[5]) != null && refId(a[6]) != null;
}

/** Pretty class name: IFCWALLSTANDARDCASE -> IfcWallStandardCase (by a word list). */
const WORDS = ["Standard", "Case", "Elemented", "Element", "Proxy", "Building", "Covering", "Curtain", "Wall", "Slab", "Beam", "Column", "Member", "Plate", "Door", "Window", "Roof", "Stair", "Flight", "Ramp", "Railing", "Footing", "Pile", "Furnishing", "Furniture", "Flow", "Segment", "Fitting", "Terminal", "Pipe", "Duct", "Cable", "Carrier", "Distribution", "Energy", "Conversion", "Device", "Controller", "Moving", "Transport", "Chimney", "Shading", "Reinforcing", "Bar", "Mesh", "Tendon", "Anchor", "Mechanical", "Fastener", "Discrete", "Accessory", "System", "Furnishing", "Geographic", "Air", "Sanitary", "Light", "Fixture", "Outlet", "Space", "Heater", "Valve", "Pump", "Tank", "Fire", "Suppression", "Electric", "Appliance", "Junction", "Box", "Unitary", "Equipment", "Coil", "Damper", "Fan", "Filter", "Chiller", "Boiler", "Port", "Course", "Pavement", "Kerb", "Earthworks", "Fill", "Cut", "Sign", "Signal", "Rail", "Track", "Deep", "Foundation", "Bearing", "Part", "Surface", "Feature", "Sensor", "Alarm", "Actuator", "Protective", "Switching", "Audio", "Visual", "Communications", "Lamp", "Motor", "Connection", "Storage", "Treatment", "Interceptor", "Waste", "Stack", "Hood", "Burner", "Evaporator", "Condenser", "Humidifier", "Cooling", "Tower", "Compressor", "Engine", "Generator", "Transformer", "Tube", "Bundle", "Radiator", "Recovery", "Heat", "Exchanger", "Medical", "Solar", "Panel", "Spaceheater", "Vibration", "Isolator", "Impact", "Protection", "Sound", "Mobile", "Telecom", "Plant", "Building", "Built", "Facility", "Geotechnical", "Stratum", "Assembly", "Mooring", "Marine", "Navigation", "Transportation", "Vehicle", "Conveyor", "Liquid", "Terminal", "Borehole", "Geomodel", "Slice"];
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
 * @param {{geometry?: boolean, tolerance?: number, trustDeclaredUnits?: boolean}} opts
 */
export function takeoff(model, opts = {}) {
  const E = model.entities;
  const units = readUnits(model, { trustDeclared: opts.trustDeclaredUnits });
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
      type: null, typeGlobalId: null, storey: null, storeyGlobalId: null, storeyElevation: null, space: null, material: null, materialParts: null, materialRef: null, materialSet: null, classification: null, parent: null, isAssembly: false,
      stored: {}, storedSet: null, computed: null, check: null, box: null,
      pathJoins: idx.pathJoins.get(id) || [],
    };
    const tId = idx.typeOf.get(id);
    // the type's and storey's own GlobalIds: a revision that only renames a
    // storey or a type keeps them, so the change report (diff.mjs) can tell a
    // rename from an element moved to another storey or given another type
    if (tId) { const t = E.get(tId); row.type = t ? str(t.args[2]) : null; row.typeGlobalId = t ? str(t.args[0]) : null; }
    // storey: own containment, else the aggregate parent's
    let sid = idx.storeyOf.get(id), p = idx.parentOf.get(id), hop = 0;
    while (!sid && p && hop++ < 10) { sid = idx.storeyOf.get(p); p = idx.parentOf.get(p); }
    // contained in a room (IfcSpace, or a zone of spaces) is not a storey of its
    // own: climb the spatial tree to the IfcBuildingStorey that aggregates it
    // (ARK_NUS places furniture and fittings in 193 rooms, which otherwise
    // listed as 193 "storeys"), and keep the room's name as the row's space
    if (sid && E.get(sid)?.type === "IFCSPACE") {
      const sp = E.get(sid);
      row.space = roomLabel(str(sp.args[2]), str(sp.args[7]), sid);
      let up = idx.parentOf.get(sid), h = 0;
      while (up && h++ < 10 && E.get(up)?.type === "IFCSPACE") up = idx.parentOf.get(up);
      if (up && E.get(up)?.type === "IFCBUILDINGSTOREY") sid = up;
    }
    if (sid) { const s = E.get(sid); row.storey = s ? (str(s.args[2]) ?? `#${sid}`) : null; row.storeyGlobalId = s ? str(s.args[0]) : null; if (s && s.type === "IFCBUILDINGSTOREY" && numOf(s.args[9]) != null) row.storeyElevation = numOf(s.args[9]) * f; }
    const parent = idx.parentOf.get(id);
    if (parent) { const pe = E.get(parent); if (pe && isElement(pe)) row.parent = parent; }
    // the aggregate it belongs to, element or not (an IfcStair is not one here):
    // explainChecks reads it for a total written on every piece
    row.assembly = parent ?? null;
    row.isAssembly = (idx.children.get(id) || []).some((c) => { const ce = E.get(c); return ce && isElement(ce); });
    const mid = idx.material.get(id) ?? (tId ? idx.material.get(tId) : undefined);
    if (mid) { row.material = materialName(E, mid); row.materialParts = materialLeaves(E, mid); row.materialRef = mid; row.materialSet = materialSet(E, mid); }
    row.classification = classificationCode(E, idx.classif.get(id) ?? (tId ? idx.classif.get(tId) : undefined));
    // what the Uniformat rules read (uniformat.mjs)
    const te = tId ? E.get(tId) : null;
    const generic = /^IFC(FLOW|ENERGYCONVERSION|DISTRIBUTION|BUILDINGELEMENTPROXY)/.test(e.type);
    row.effectiveClass = generic && te && te.type.endsWith("TYPE") ? te.type.slice(0, -4) : e.type;
    row.predefinedType = predefinedOf(e, 8) ?? (te ? predefinedOf(te, 8) : null);
    const props = { isExternal: null, codes: [] };
    readProps(E, idx.psets.get(id), props);
    if (te) readProps(E, (te.args[5] || []).map(refId), props);
    row.isExternal = props.isExternal;
    const refs = [...classificationCodes(E, idx.classif.get(id)), ...(tId ? classificationCodes(E, idx.classif.get(tId)) : [])];
    row.uniformatCodes = [...refs.map((c) => ({ code: c.code, from: `classification${c.system ? " (" + c.system + ")" : ""}` })), ...props.codes];
    const op = idx.fills.get(id);
    row.host = op != null ? idx.openingHost.get(op) ?? null : null;

    readStored(E, idx, id, units, row);

    // a placement this reader cannot place (an alignment curve alignment.mjs
    // does not draw) leaves that element unread, not the whole file
    let placeError = null;
    if (opts.geometry !== false && e.args[5]) {
      try { worldOf(refId(e.args[5])); } catch (err) { if (!(err instanceof Unresolved)) throw err; placeError = err.message; }
    }
    if (opts.geometry !== false && placeError) {
      row.computed = { status: "not read", reason: `placement: ${placeError}` };
    } else if (opts.geometry !== false) {
      row.computed = computeVolume(e, idx, E, geo, bodyOf, worldOf, f);
      if (row.computed.status === "ok") {
        // a body swept from one parametric profile: the simplified sections an
        // exporter may have computed its stored volume from (explainChecks)
        const pid = sweptProfile(E, bodyRepresentation(E, refId(e.args[6])));
        if (pid != null) { const v = geo.sectionVariants(pid); if (v.length) row.computed.sectionVariants = v; }
        if (pid != null) { const v = geo.polygonSections(pid); if (v.length) row.computed.polygonSections = v; }
        try { row.computed.areas = computeAreas(e.type, row.computed.solids, worldOf(refId(e.args[5])), f); } catch (err) { row.computed.areas = { error: err.message }; }
        // a steel member whose faces cannot be summed one by one (a profile
        // with root radii is cut into many convex pieces): its skin from the
        // extruded profile's own outline (profileSkin)
        // A hollow section's faces include its inside, which paint and fire
        // protection do not cover: its outside comes from the profile too
        if (COATED_CLASS.test(e.type) && row.computed.areas && !row.computed.areas.error) {
          try {
            const k = profileSkin(E, geo, bodyRepresentation(E, refId(e.args[6])), row.computed.solids.body);
            if (k && (!row.computed.areas.surface || k.inside > 0)) row.computed.areas.surface = { gross: k.area * f * f, net: null, inside: k.inside * f * f, fromProfile: true, clipped: k.clipped };
          } catch { /* no skin */ }
        }
        try { const L = memberLength(e.type, row.computed.solids.body, f); if (L != null) row.computed.length = L; } catch { /* no length */ }
        // a reinforcing bar's shapes and the author's schedule figures (rebar.mjs)
        if (REBAR_CLASS.test(e.type) && row.computed.solids.body?.bars?.length) {
          row.barProps = barPropsOf(E, idx, e, te, f);
          const nominal = row.barProps.diameterMm ? row.barProps.diameterMm / 1000 : null;
          try { row.bars = row.computed.solids.body.bars.map((b) => barShape(b, f, nominal)); } catch { row.bars = null; }
        }
        row.computed.solids.each = null;
        // what the model view draws the element with (view-mesh.mjs); kept off the row's enumerable fields
        Object.defineProperty(row, "world", { value: worldOf(refId(e.args[5])), enumerable: false, writable: true });
        Object.defineProperty(row, "lengthUnit", { value: f, enumerable: false, writable: true });
        try { row.box = worldBox(row.computed.solids.body, worldOf(refId(e.args[5])), f); } catch { row.box = null; }
        // the plan rectangle the envelope test reads (envelope.mjs)
        if (/^IFC(WALL|CURTAINWALL$|PLATE|MEMBER|RAILING)/.test(e.type) || (/^IFC(DOOR|WINDOW)/.test(e.type) && row.host == null)) {
          try { row.plan = planRect(row.computed.solids.body, worldOf(refId(e.args[5])), f); } catch { row.plan = null; }
        }
        // a sloped roof piece blocks the envelope test's rays where it crosses them
        if (/^IFC(ROOF|SLAB|PLATE|COVERING)/.test(e.type) && opts.roofBlockers !== false) {
          try { row.roofFaces = roofFaces(row.computed.solids.body, worldOf(refId(e.args[5])), f); } catch { row.roofFaces = null; }
        }
      }
    }
    // an element whose body gives no box (a faceted body read only as a
    // volume, a body this reader cannot draw) still has the point it was
    // placed at: assignRooms falls back to it (Revit families: the insertion
    // point, on the floor or the host face)
    if (!row.box && opts.geometry !== false && !placeError && e.args[5]) {
      try {
        const W = worldOf(refId(e.args[5]));
        const o = [W[3] * f, W[7] * f, W[11] * f];
        if (o.every(Number.isFinite)) Object.defineProperty(row, "origin", { value: o, enumerable: false, writable: true });
      } catch { /* no placement point */ }
    }
    row.check = checkVolume(row, tol);
    row.areaCheck = checkAreas(row, tol);
    rows.push(row);
  }
  explainChecks(rows, tol);
  explainAreas(rows, tol);
  checkLengths(rows, tol);
  assignEnvelope(rows, { roofs: opts.roofBlockers !== false });
  if (!opts.keepRoofFaces) for (const r of rows) delete r.roofFaces; // faces are only for the envelope test; rows stay small
  assignRailingSides(rows);
  assignUniformat(rows);
  const rooms = opts.rooms === false ? [] : takeoffRooms(E, idx, geo, bodyOf, worldOf, units, opts, tol);
  assignRooms(rows, rooms);
  if (rooms.length) { const { bounds, overall } = spaceBoundaries(E, geo, f); deductOpenings(rows, rooms, bounds, overall); }
  return { schema: model.schema, units, rows, rooms };
}

/**
 * The file's space boundaries (IfcRelSpaceBoundary and its 1st/2nd-level
 * subtypes) as {space, element, type, area}, area in m2 from the connection surface
 * (null when it is a kind rooms.mjs does not read), and each door's and
 * window's OverallWidth and OverallHeight in m.
 */
function spaceBoundaries(E, geo, f) {
  const bounds = [], overall = new Map();
  for (const e of E.values()) {
    if (e.type.startsWith("IFCRELSPACEBOUNDARY")) {
      const space = refId(e.args[4]), element = refId(e.args[5]);
      if (space == null || element == null) continue;
      let area = null;
      try { const a = connectionArea(geo, e.args[6]); area = a == null ? null : a * f * f; } catch { area = null; }
      bounds.push({ space, element, type: E.get(element)?.type ?? null, area });
    } else if (OPENING_CLASS.test(e.type) && !e.type.endsWith("TYPE") && !e.type.endsWith("STYLE")) {
      const height = numOf(e.args[8]), width = numOf(e.args[9]);
      if (height > 0 && width > 0) overall.set(e.id, { width: width * f, height: height * f });
    }
  }
  return { bounds, overall };
}

/**
 * The model's rooms (IfcSpace): number, name, storey, the quantities their
 * quantity sets store, and floor area, perimeter, height, wall area and
 * volume measured from each space's own body (rooms.mjs), checked against
 * the stored ones. The solid, placement and length unit stay on each room as
 * non-enumerable fields for assignRooms.
 */
function takeoffRooms(E, idx, geo, bodyOf, worldOf, units, opts, tol) {
  const f = units.LENGTHUNIT;
  const rooms = [];
  for (const e of E.values()) {
    if (e.type !== "IFCSPACE") continue;
    const id = e.id;
    const number = str(e.args[2]), name = str(e.args[7]);
    const room = { id, globalId: e.args[0], number, name, label: roomLabel(number, name, id), from: "body", storey: null, storeyElevation: null, stored: {}, storedSet: null, computed: null, status: null, check: {} };
    let up = idx.storeyOf.get(id) ?? idx.parentOf.get(id), h = 0;
    while (up && h++ < 10 && E.get(up)?.type !== "IFCBUILDINGSTOREY") up = idx.parentOf.get(up) ?? idx.storeyOf.get(up);
    const st = up ? E.get(up) : null;
    if (st && st.type === "IFCBUILDINGSTOREY") { room.storey = str(st.args[2]) ?? `#${up}`; if (numOf(st.args[9]) != null) room.storeyElevation = numOf(st.args[9]) * f; }
    readStored(E, idx, id, units, room);
    // what the change report (diff.mjs diffRooms) compares besides quantities
    room.description = str(e.args[3]);
    room.predefinedType = predefinedOf(e, 9);
    room.properties = spaceProperties(E, idx.psets.get(id));
    if (opts.geometry !== false) {
      const repId = bodyRepresentation(E, refId(e.args[6]));
      let body = repId ? bodyOf(repId) : null;
      if (!body) { body = footprintBody(E, refId(e.args[6])); if (body) room.from = "footprint"; }
      if (!body) room.status = "no body";
      else if (body.error) room.status = `not read: ${body.error}`;
      else {
        try {
          const W = worldOf(refId(e.args[5]));
          room.computed = roomGeometry(body, W, f);
          room.status = room.computed ? (room.computed.floorArea == null ? "faceted: volume and height only" : "ok") : "no extent";
          if (room.computed) {
            Object.defineProperty(room, "solid", { value: body, enumerable: false, writable: true });
            Object.defineProperty(room, "world", { value: W, enumerable: false, writable: true });
            Object.defineProperty(room, "lengthUnit", { value: f, enumerable: false, writable: true });
            room.box = worldBox(body, W, f);
          }
        } catch (err) { room.status = `not read: ${err.message}`; room.computed = null; }
      }
    }
    room.check = checkRoom(room, tol);
    rooms.push(room);
  }
  // in storey order, then by number
  rooms.sort((a, b) => (a.storeyElevation ?? 0) - (b.storeyElevation ?? 0) || String(a.storey ?? "").localeCompare(String(b.storey ?? "")) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
  return rooms;
}

/**
 * A space with no body but a 'FootPrint' outline (an IfcPolyline, or an
 * IfcIndexedPolyCurve of straight segments, alone or in a curve set) and a
 * 'Box' bounding box: the outline extruded through the box's height.
 */
function footprintBody(E, shapeId) {
  const shape = E.get(shapeId);
  if (!shape || !Array.isArray(shape.args[2])) return null;
  let outline = null, box = null;
  const curvePts = (c) => {
    if (!c) return null;
    if (c.type === "IFCPOLYLINE") return (c.args[0] || []).map((r) => E.get(refId(r))?.args[0]).filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [numOf(p[0]), numOf(p[1])]);
    if (c.type === "IFCINDEXEDPOLYCURVE") {
      if (Array.isArray(c.args[1]) && c.args[1].some((sg) => sg && sg.type && /ARC/i.test(sg.type))) return null;
      const list = E.get(refId(c.args[0]));
      return list && Array.isArray(list.args[0]) ? list.args[0].map((p) => [numOf(p[0]), numOf(p[1])]) : null;
    }
    if (c.type === "IFCGEOMETRICCURVESET" || c.type === "IFCGEOMETRICSET") { for (const r of c.args[0] || []) { const pts = curvePts(E.get(refId(r))); if (pts && pts.length >= 3) return pts; } }
    return null;
  };
  for (const r of shape.args[2]) {
    const rep = E.get(refId(r));
    if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") continue;
    const id = str(rep.args[1]);
    for (const it of rep.args[3] || []) {
      const item = E.get(refId(it));
      if (!item) continue;
      if (id === "FootPrint" && !outline) outline = curvePts(item);
      if (id === "Box" && item.type === "IFCBOUNDINGBOX" && !box) box = { z0: numOf(E.get(refId(item.args[0]))?.args[0]?.[2]) ?? 0, h: numOf(item.args[3]) };
    }
  }
  if (!outline || !box || outline.some((p) => p[0] == null || p[1] == null)) return null;
  return footprintSolid(outline, box.z0, box.h);
}

/** The quantities an object's quantity sets store, in SI units, onto row.stored (first value of a name wins). */
function readStored(E, idx, id, units, row) {
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
}

/**
 * Names the likely cause of each stored-vs-computed disagreement, in order:
 *   split        one stored value repeated on several elements with the same
 *                Tag and class (Revit's split-by-level export writes the whole
 *                wall's quantities on every piece), and the pieces' computed
 *                volumes (gross or net) sum to it;
 *   split-held   the whole element's stored value on one piece only, and the
 *                other pieces with its Tag (another class of the same kind,
 *                IfcWall beside IfcWallStandardCase) store none; their bodies
 *                and its own sum to it, to 0.5% (heldSplit below; HHS
 *                construction's two Revit walls split at a level);
 *   repeated     the same, but the pieces in the file do not sum to it (some
 *                pieces are in another file or were not exported);
 *   unit-slip    the stored volume is the computed one times a power of ten
 *                (a volume written in litres or mm3 under a m3 unit);
 *   net-as-gross the stored GrossVolume equals the computed net: the exporter
 *                took the openings out of what it calls gross;
 *   own-dimensions the stored volume disagrees with the element's own stored
 *                Length x Height x Width (or, for a member storing no Height
 *                and Width, Length x CrossSectionArea), and the computed volume
 *                agrees with that product: the stored volume is the odd one out;
 *   body-is-net  the geometry has the openings cut already and equals the
 *                stored NetVolume (bodyIsNet below);
 *   unit-slip    again, after the rest: a power of ten times the square-foot
 *                factor, shared by several elements (compoundSlips below);
 *   not-stored   a stored 0 on an element with a body (ArchiCAD skylights);
 *   assembly-total  one stored value on several pieces of one aggregate, and
 *                it is the aggregate's whole volume (Revit stairs);
 *   simplified-section  stored = computed x a simplified section's share of
 *                the exact one (simplifiedSection below; Tekla steel);
 *   glazing-left-out  stored = computed less the body's glass items
 *                (glazingLeftOut below; ArchiCAD windows and doors);
 *   nominal-slip stored = the element's own stored area x its nominal
 *                width x a power of ten, to 1e-6, and the body is near that
 *                product (nominalSlip below; Revit sloped "fall" slabs);
 *   polygon-section  stored = computed x a polygonised section's share of
 *                the exact one, to 1e-4; also set on pairs inside the 2%
 *                (polygonSection below; ArchiCAD arcs and round columns);
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
  // pieces of one aggregate (a Revit stair's stringers, landings, flights)
  // that carry the same stored value: keyed like the tag groups above
  const asm = new Map(), kids = new Map();
  for (const r of rows) {
    if (r.assembly == null) continue;
    if (!kids.has(r.assembly)) kids.set(r.assembly, []);
    kids.get(r.assembly).push(r);
    for (const w of ["gross", "net"]) {
      const c = r.check?.[w];
      if (!c || c.agree) continue;
      const k = `${w}|${r.assembly}|${c.stored}`;
      if (!asm.has(k)) asm.set(k, []);
      asm.get(k).push(r);
    }
  }
  const lhw = (r) => {
    const g = (n) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === "length" && k.toLowerCase() === n) return q.value; return null; };
    const L = g("length"), H = g("height"), W = g("width");
    if (L != null && H != null && W != null) return L * H * W;
    // a member's stored Length x CrossSectionArea (Qto_BeamBaseQuantities,
    // Qto_ColumnBaseQuantities, Qto_MemberBaseQuantities): a prism's volume
    if (L != null) for (const [k, q] of Object.entries(r.stored)) if (q.kind === "area" && k.toLowerCase() === "crosssectionarea" && q.value > 0) return L * q.value;
    return null;
  };
  for (const r of rows) {
    r.trustStored = true;
    for (const w of ["gross", "net"]) {
      const c = r.check?.[w];
      if (!c) continue;
      // inside the 2%, a stored figure that is exactly a polygonised section
      // (polygonSection below): named, and the geometry is summed
      if (c.agree) { if (polygonSection(r, c)) { c.reason = "polygon-section"; r.trustStored = false; } continue; }
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
      if (c.stored === 0 && c.computed > 0) { c.reason = "not-stored"; r.trustStored = false; continue; }
      const held = heldSplit(r, rows, (q) => (w === "net" ? q.computed?.net ?? q.computed?.gross : q.computed?.gross), (q) => q.check?.[w] != null, c.stored, tol / 4);
      if (held) { c.reason = "split-held"; c.pieces = held; r.trustStored = false; continue; }
      const dims = lhw(r);
      const slip = unitSlip(c.computed, c.stored, tol / 4);
      if (slip) { c.reason = "unit-slip"; c.factor = slip; r.trustStored = false; continue; }
      const sib = r.assembly != null ? asm.get(`${w}|${r.assembly}|${c.stored}`) : null;
      if (sib && sib.length > 1) {
        const all = kids.get(r.assembly);
        const vol = (q) => (q.computed?.status === "ok" ? q.computed.net ?? q.computed.gross : 0);
        const sumAll = all.reduce((x, q) => x + vol(q), 0);
        const sumBuilt = all.filter((q) => q.ifcClass !== "IfcRailing").reduce((x, q) => x + vol(q), 0);
        const biggest = Math.max(...sib.map(vol));
        if (near(sumAll, c.stored) || near(sumBuilt, c.stored) || c.stored >= 1.5 * biggest) {
          c.reason = near(sumAll, c.stored) || near(sumBuilt, c.stored) ? "assembly-total" : "repeated";
          c.pieces = sib.length;
          r.trustStored = false;
          continue;
        }
      }
      if (w === "gross" && r.computed.openings > 0 && r.computed.net != null && near(r.computed.net, c.stored)) c.reason = "net-as-gross";
      else if (w === "gross" && bodyIsNet(r, c, near, tol)) c.reason = "body-is-net";
      else if (simplifiedSection(r, c, tol / 4)) { c.reason = "simplified-section"; r.trustStored = false; r.weightScale ??= c.computed / c.stored; }
      else if (glazingLeftOut(r, c, tol / 4)) { c.reason = "glazing-left-out"; r.trustStored = false; }
      else if (polygonSection(r, c)) { c.reason = "polygon-section"; r.trustStored = false; }
      else if (dims != null && !near(c.stored, dims) && (near(c.computed, dims) || (r.computed.net != null && near(r.computed.net, dims)))) { c.reason = "own-dimensions"; r.trustStored = false; }
      else if ((c.factor = nominalSlip(r, c)) != null) { c.reason = "nominal-slip"; r.trustStored = false; }
      else { delete c.factor; c.reason = "unexplained"; }
    }
  }
  compoundSlips(rows, tol);
  return rows;
}

/**
 * split-held: Revit splits a wall at a level and exports one piece as
 * IfcWallStandardCase with the whole wall's quantities and the rest as IfcWall
 * with none, all under one Tag (HHS construction #1405 + #1493 = 2.6565 +
 * 2.5955 = 5.2520 m3 stored; eval/split-held-2026-11-24.md). The pieces are
 * the rows sharing r's Tag whose class is r's with StandardCase or
 * ElementedCase dropped (the same kind of element), and that store nothing
 * for this figure (has(q) false). Returns how many pieces sum to the stored
 * value within tol, counting r, else 0. A fit to six digits on the two walls
 * seen; tol (0.5%) leaves room for an exporter that rounds.
 */
const tagIndex = new WeakMap();
const kindOf = (cls) => (cls || "").replace(/(StandardCase|ElementedCase)$/, "");
export function heldSplit(r, rows, size, has, stored, tol) {
  if (!r.tag || !(stored > 0)) return 0;
  let idx = tagIndex.get(rows);
  if (!idx) {
    idx = new Map();
    for (const q of rows) if (q.tag) { const k = `${q.tag}|${kindOf(q.ifcClass)}`; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(q); }
    tagIndex.set(rows, idx);
  }
  const others = (idx.get(`${r.tag}|${kindOf(r.ifcClass)}`) || []).filter((q) => q !== r && !q.isAssembly && !has(q));
  if (!others.length) return 0;
  const own = size(r);
  if (!(own > 0)) return 0;
  let sum = own;
  for (const q of others) { const v = size(q); if (!(v > 0)) return 0; sum += v; }
  return Math.abs(sum - stored) <= tol * stored ? others.length + 1 : 0;
}

/**
 * nominal-slip: the stored volume is the element's own stored area times its
 * own stored width (a slab's nominal thickness) times 10^k, k from -9 to 9 and
 * not 0, to 1e-6 of the figure, while the body is within NOMINAL_SLIP_SHAPE of
 * area x width. Two faults at once, so unitSlip's tolerance misses it: the
 * figure was written in the wrong unit, and it is a nominal-thickness volume
 * on a body that is not of that thickness (ARK_NUS skolebygg's "Betongdekke
 * 250 m fall" slabs, sloped to drain: 22.474 m2 x 0.25 m x 1000 = 5,618.5
 * stored against 5.29 m3 of body, a mean 0.236 m thick;
 * eval/in-doubt-2026-11-23.md). Exactness to 1e-6 keeps chance out: a product
 * of two stored figures that equals the stored volume to six digits is the
 * exporter's own arithmetic. Returns the power of ten, else null.
 */
export const NOMINAL_SLIP_SHAPE = 0.15;
export function nominalSlip(r, c) {
  if (!(c.stored > 0) || !(c.computed > 0)) return null;
  const val = (kind, names) => { for (const [k, q] of Object.entries(r.stored || {})) if (q.kind === kind && names.includes(k.toLowerCase()) && q.value > 0) return q.value; return null; };
  const W = val("length", ["width", "depth", "thickness"]);
  if (W == null) return null;
  for (const A of [val("area", ["grossarea"]), val("area", ["netarea"])]) {
    if (A == null) continue;
    const nominal = A * W;
    const k = Math.round(Math.log10(c.stored / nominal));
    if (k === 0 || Math.abs(k) > 9) continue;
    if (Math.abs(nominal * 10 ** k - c.stored) > 1e-6 * c.stored) continue;
    if (Math.abs(c.computed - nominal) <= NOMINAL_SLIP_SHAPE * nominal) return 10 ** k;
  }
  return null;
}

/**
 * body-is-net: the body geometry already has the openings cut out (an
 * ArchiCAD faceted export writes the wall or slab with its holes and no
 * IfcOpeningElement), so the computed volume equals the element's own stored
 * NetVolume, and the stored GrossVolume is larger by the openings. The stored
 * gross is then the right gross, and the BoQ sums the stored net as before.
 * Needs: no openings in the file for the element, a stored NetVolume that the
 * computed volume matches, and a stored gross more than the tolerance above it.
 */
function bodyIsNet(r, c, near, tol) {
  if (r.computed.openings > 0) return false;
  let sn = null;
  for (const [k, q] of Object.entries(r.stored)) if (q.kind === "volume" && k.toLowerCase() === "netvolume") sn = q.value;
  return sn != null && sn > 0 && near(c.computed, sn) && c.stored > sn * (1 + tol);
}

/**
 * simplified-section: the stored volume is the computed one times the ratio
 * of a simplified section to the exact one (sectionVariants in geom.mjs):
 * Tekla stores steel volumes, and the weights it derives from them, from the
 * section without its root fillets (an IPE240: 3,718 mm2 against the
 * catalogue's 3,912) and with round tubes as 8- or 16-sided polygons. The
 * geometry follows the profile's own radii, so it is the better figure.
 * The ratio is exact, so a quarter of the tolerance is asked.
 */
function simplifiedSection(r, c, tol) {
  const v = r.computed?.sectionVariants;
  if (!v || !(c.computed > 0)) return null;
  const ratio = c.stored / c.computed;
  const hit = v.find((x) => Math.abs(ratio - x.ratio) <= tol * x.ratio);
  if (hit) c.section = hit.label;
  return hit ?? null;
}

/**
 * polygon-section: the stored volume is the computed one times the ratio of
 * a polygonised section to the exact one (polygonSections in geom.mjs:
 * ArchiCAD measures a drawn profile with its arcs as 45-degree chords and a
 * round column as a circumscribed 20-gon). The match asked is 1e-4, against
 * differences of 0.07% to 1%, so a chance hit is unlikely; the geometry,
 * which follows the true arcs, is summed. c.section names the polygon.
 */
export const POLYGON_SECTION_TOL = 1e-4;
function polygonSection(r, c) {
  const v = r.computed?.polygonSections;
  if (!v || !(c.computed > 0) || !(c.stored > 0)) return null;
  const ratio = c.stored / c.computed;
  const hit = v.find((x) => Math.abs(ratio - x.ratio) <= POLYGON_SECTION_TOL * x.ratio);
  if (hit) c.section = hit.label;
  return hit ?? null;
}

/**
 * glazing-left-out: the stored volume is the body's less its glass items
 * (computed.glazing: items drawn in a see-through or glass-named style).
 * ArchiCAD's window and door objects store "Net Volume" (and the same figure
 * as "W/D Opening Volume") as the frame and sash only: identical windows store
 * different figures when their panes differ in thickness. Both terms are the
 * file's own geometry, so a quarter of the tolerance is asked. The BoQ sums
 * the whole body; the frame alone stays readable as gross - glazing.
 * Failing that, the body less one plane's panes (computed.glazingPlanes, two
 * or more planes only): c.glassLeftOut names that plane's volume and panes.
 * Only whole planes are tried, never every subset of the panes, which would
 * match by chance too often.
 */
function glazingLeftOut(r, c, tol) {
  const g = r.computed?.glazing;
  if (!(g > 0) || !(c.computed > g)) return false;
  const frame = c.computed - g;
  if (Math.abs(c.stored - frame) <= tol * frame) return true;
  // the body less one plane's panes only: a door whose leaf glass is counted
  // and its side lights' is not (schependomlaan's "D2R 2zl 18": 4 of 4)
  for (const p of r.computed.glazingPlanes || []) {
    const less = c.computed - p.volume;
    if (Math.abs(c.stored - less) <= tol * less) { c.glassLeftOut = { volume: p.volume, pieces: p.pieces }; return true; }
  }
  return false;
}

/**
 * A second unit-slip pass over what is still unexplained: the stored volume is
 * the computed one times 10^k (k from -9 to 9, not 0) times the square-foot
 * factor or its inverse (skolebygg's roof slabs store litres divided by
 * 10.7639, 92.903 times the geometry). One such ratio alone could be chance
 * (unitSlip's comment), so the factor counts only when at least
 * COMPOUND_SLIP_MIN elements of the model share it to a quarter of the
 * tolerance: a systematic exporter habit, not a coincidence.
 */
export const COMPOUND_SLIP_MIN = 3;
export function compoundFactor(computed, stored, tol = 0.005) {
  if (!(computed > 0 && computed < Infinity) || !(stored > 0 && stored < Infinity)) return null;
  for (const f of [SQFT, 1 / SQFT]) {
    const k = Math.round(Math.log10(stored / (computed * f)));
    if (k === 0 || Math.abs(k) > 9) continue;
    const factor = f * 10 ** k;
    if (Math.abs(computed * factor - stored) <= tol * stored) return factor;
  }
  return null;
}
function compoundSlips(rows, tol) {
  const byFactor = new Map();
  for (const r of rows) for (const w of ["gross", "net"]) {
    const c = r.check?.[w];
    if (!c || c.agree || c.reason !== "unexplained") continue;
    const f = compoundFactor(c.computed, c.stored, tol / 4);
    if (f == null) continue;
    const key = f.toPrecision(6);
    if (!byFactor.has(key)) byFactor.set(key, []);
    byFactor.get(key).push([r, c, f]);
  }
  for (const list of byFactor.values()) {
    if (list.length < COMPOUND_SLIP_MIN) continue;
    for (const [r, c, f] of list) { c.reason = "unit-slip"; c.factor = f; r.trustStored = false; }
  }
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
  // finite only: near(x, Infinity) holds for every x (a stored 1.E400 parses to Infinity)
  if (!(computed > 0 && computed < Infinity) || !(stored > 0 && stored < Infinity)) return null;
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
 *   split-held        as for volumes: the whole area on one piece only, the
 *                     other pieces under its Tag storing none;
 *   net-as-gross      a stored gross area equals the computed net;
 *   gross-as-net      a stored net area equals the computed gross: the
 *                     openings were not taken out;
 *   on-a-face         a wall's side area equals the section on one of its
 *                     faces rather than its middle plane (a corner join makes
 *                     the faces differ in length);
 *   net-on-a-face     a holed wall's stored gross side area is one of its
 *                     faces with the openings taken out, within 0.5% (Revit:
 *                     ARK_NUS_skolebygg's three such walls);
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
 *   whole-surface     a plate's stored plan area is the total area of its
 *                     body's faces, within 0.5% (Tekla: M3D-CON-CD's "JD-1"
 *                     28.30 m2 on a 12.88 m2 plate): a coating figure, so the
 *                     BoQ sums the plan cut;
 *   half-surface      a member's stored CrossSectionArea is half the total
 *                     area of its body's faces (HHS architect's Revit
 *                     mullions: 0.66 m2 on a 0.0095 m2 post, its surface
 *                     1.32 m2), within 0.5%: a surface figure, not a section;
 *   own-profile       a member's stored CrossSectionArea is its own stored
 *                     Width x Height, and the geometry was cut across another
 *                     direction: a piece about as short as it is wide, whose
 *                     axis its faces do not show (schependomlaan's footing
 *                     stubs, 0.28-0.35 m long on 0.35-0.5 m profiles);
 *   faces-averaged    the same mean, read from the exporter's own outside and
 *                     inside face areas (ArchiCAD's "Netto-Oberflächenbereich
 *                     an der Außenseite / Innenseite"; gross adds its opening
 *                     areas), when the joins in the file do not account for
 *                     the whole difference;
 *   unexplained       none of these.
 * Sets reason on each disagreeing row.areaCheck entry, and trust = false where
 * the stored figure should not be summed (split, repeated, unit-slip).
 */
/**
 * Compares a member's stored Length with the length read off its body
 * (row.lengthCheck). One cause is named: a stored Length that is the same on
 * three or more members of one assembly whose bodies differ in length and
 * are all shorter than it is the host's figure (Revit writes a curtain wall's
 * length on every mullion, ARK_NUS_skolebygg's 20.858 m), so the BoQ sums the
 * computed length instead.
 */
export function checkLengths(rows, tol = 0.02) {
  const groups = new Map();
  for (const r of rows) {
    r.lengthCheck = null;
    if (!LINEAR_CLASS.test(r.ifcType)) continue;
    const s = storedLen(r, "length"), c = r.computed?.status === "ok" ? r.computed.length : null;
    if (s == null || c == null) continue;
    const diff = c - s;
    r.lengthCheck = { computed: c, stored: s, diff, rel: s !== 0 ? diff / s : (c === 0 ? 0 : Infinity), agree: Math.abs(diff) <= tol * Math.abs(s) || Math.abs(diff) < 1e-4, reason: null };
    if (r.lengthCheck.agree || r.assembly == null) continue;
    const k = `${r.assembly}|${s}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    const cs = g.map((r) => r.lengthCheck.computed);
    const lo = Math.min(...cs), hi = Math.max(...cs), s = g[0].lengthCheck.stored;
    if (!(hi - lo > tol * hi) || !(hi < s * (1 - tol))) continue;
    for (const r of g) { r.lengthCheck.reason = "host-figure"; r.lengthCheck.trust = false; }
  }
}

export const LENGTH_REASON_TEXT = {
  "host-figure": "the same stored length is written on several members of one assembly whose bodies are shorter and differ in length: the host's figure (a curtain wall's length on every mullion), so the BoQ uses the length read off the body",
};

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
      const held = heldSplit(r, rows, (q) => q.computed?.areas?.[c.kind]?.[c.which], (q) => q.areaCheck?.[k] != null, c.stored, tol / 4);
      if (held) { c.reason = "split-held"; c.pieces = held; c.trust = false; continue; }
      const open = r.computed.openings > 0;
      if (c.which === "gross" && open && A.net != null && near(A.net, c.stored)) { c.reason = "net-as-gross"; continue; }
      if (c.which === "net" && open && A.gross != null && near(A.gross, c.stored)) { c.reason = "gross-as-net"; continue; }
      // a wall on an arc measured on its facets: the stored figure is its outer
      // (Revit) or inner face (skolebygg, eval/curved-side-area-2026-11-23.md)
      if (c.kind === "side" && A.curved && A.chord && A.faces[c.which].some((x) => x > 0 && Math.abs(x - c.stored) <= 0.005 * Math.abs(c.stored))) { c.reason = "curved-face"; continue; }
      if ((c.kind === "side" || c.kind === "plan") && A.faces && A.faces[c.which].some((x) => x != null && near(x, c.stored))) { c.reason = "on-a-face"; continue; }
      // Revit writes a holed wall's GrossSideArea as one face with its openings
      // taken out: ARK_NUS's #556796, #1280178, #1483180 match a face's net to
      // 1e-6 (eval/net-on-a-face-2026-11-24.md)
      if (c.kind === "side" && c.which === "gross" && open && A.faces?.net?.some((x) => x > 0 && Math.abs(x - c.stored) <= 0.005 * Math.abs(c.stored))) { c.reason = "net-on-a-face"; continue; }
      if (c.kind === "cross" && scalesWithLength(r, k, c, rows, near)) { c.reason = "scales-with-length"; c.trust = false; continue; }
      const sv = storedVol(r, c.which);
      if (c.kind === "side" && sv != null && A.width > 0 && near(c.stored * A.width, sv)) { c.reason = "matches-stored-volume"; continue; }
      if (c.stored === 0 && c.computed > 0) { c.reason = "zero"; c.trust = false; continue; }
      const L = storedLen(r, "length"), W = storedLen(r, "width"), H = storedLen(r, "height");
      const exact = (x) => x > 0 && Math.abs(x - c.stored) <= 0.005 * Math.abs(c.stored);
      if ((c.kind === "footprint" && exact(L * W)) || (c.kind === "side" && exact(L * H))) { c.reason = "centre-line"; continue; }
      if (c.kind === "side" && sv != null && W > 0 && A.width > 0 && Math.abs(W - A.width) > tol * W && near(c.stored * W, sv)) { c.reason = "other-width"; continue; }
      if (c.kind === "cross" && hostFigure(r, k, c, rows)) { c.reason = "host-figure"; c.trust = false; continue; }
      if (c.kind === "cross" && A.surface > 0 && exact(A.surface / 2)) { c.reason = "half-surface"; c.trust = false; continue; }
      if (c.kind === "cross" && exact(W * H)) { c.reason = "own-profile"; continue; }
      if (c.kind === "side" && joinsOff(r, c, byId, exact)) { c.reason = "joins-off"; continue; }
      if (c.kind === "side" && facesAveraged(r, c, exact)) { c.reason = "faces-averaged"; continue; }
      // ArchiCAD's slab GrossArea is its outline: the holes in the slab's own
      // profile are added back ("Holes Surface Area"), where the cut is net of them
      const holes = storedNamed(r, /^Holes Surface Area$/);
      if (c.kind === "plan" && c.which === "gross" && holes > 0 && [c.computed, A.net, ...(A.faces?.gross || [])].some((x) => x != null && exact(x + holes))) { c.reason = "holes-added"; continue; }
      // a covering drawn with ArchiCAD's wall tool stores the wall's plan:
      // its reference length at the centre times its thickness
      const Lc = storedNamed(r, /^Length of the Wall at the Center$/, "length"), T = storedNamed(r, /^Thickness$/, "length");
      if (c.kind === "plan" && Lc > 0 && T > 0 && exact(Lc * T)) { c.reason = "centre-line"; continue; }
      // Tekla writes a plate's NetArea as every face of its body added up (the
      // area a painter or galvaniser prices), not its plan: M3D-CON-CD's 7
      // plates (eval/whole-surface-2026-11-24.md); the BoQ sums the plan
      if (c.kind === "plan" && A.planes?.length > 2 && exact(A.planes.reduce((x, y) => x + y, 0))) { c.reason = "whole-surface"; c.surface = c.stored; c.trust = false; continue; }
      if (c.kind === "plan" && A.planes?.some((x) => exact(x))) { c.reason = "a-body-face"; continue; }
      if (c.kind === "side" && A.curved) { c.reason = "curved"; continue; }
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

const storedNamed = (r, re, kind = "area") => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === kind && re.test(k)) return q.value; return null; };
function facesAveraged(r, c, exact) {
  // the mean of the two faces as cut from the geometry: ArchiCAD's side area
  // for a wall whose faces differ (schependomlaan's knee walls, whose two
  // faces are trimmed under the roof at different heights)
  const F = r.computed.areas.side?.faces?.[c.which];
  if (F && F[0] != null && F[1] != null && Math.abs(F[0] - F[1]) > 0.02 * Math.max(F[0], F[1]) && exact((F[0] + F[1]) / 2)) return true;
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
  "split-held": "the whole element's stored area is written on one piece of an element split by level (Revit); the other pieces under its Tag store none, and the pieces' geometry sums to it, so the BoQ sums each piece's own",
  "scales-with-length": "the stored cross-section area grows with the element's length (length x a constant): a face area, not a section",
  split: "the same stored area is written on every piece of an element split by level; the pieces' geometry sums to it",
  repeated: "the same stored area is written on several pieces of one element, and the pieces in this file do not sum to it",
  "unit-slip": "the stored area is the geometry's times a power of ten or the square-foot factor 10.7639: converted twice or not at all",
  "net-as-gross": "the stored gross area equals the area with openings taken out (net)",
  "net-on-a-face": "the stored gross side area is one face of the wall with its openings taken out (net), as Revit writes it",
  "gross-as-net": "the stored net area equals the gross: the openings were not taken out",
  "on-a-face": "the stored area is measured on one face of the element (a wall's side, a tapered or sloped slab's top or bottom), not its middle plane",
  "matches-stored-volume": "the stored area agrees with the stored volume, but both describe a different body than the geometry",
  zero: "the stored area is 0 while the geometry has one: the exporter left the figure unfilled",
  "host-figure": "the same stored cross-section area and length are written on several members of different lengths: a figure copied from their host (a curtain wall's area and length), not the member's section",
  "whole-surface": "the stored area is the total area of every face of the body (as Tekla writes a plate's area: the surface a painter or galvaniser prices), not its plan, so the BoQ sums the plan area",
  "half-surface": "the stored cross-section area is half the total area of the member's faces: a surface figure (as some Revit exports write it), not its section",
  "own-profile": "the stored cross-section area is the member's own stored width x height; the piece is about as short as it is wide, so its axis cannot be read from the geometry and the cut went across another direction",
  "joins-off": "the stored side area is the mean of the wall's two faces with the strips covered by the walls joined to it taken off (a finishes figure, as ArchiCAD measures it)",
  "faces-averaged": "the stored side area is the mean of the wall's outside and inside face areas (the exporter's own figures, or the two faces cut from the geometry where they differ): a finishes figure",
  "holes-added": "the stored gross area is the slab's outline: its net area with the holes in its own profile added back (ArchiCAD's Holes Surface Area)",
  "a-body-face": "the stored area is one flat face of the element (a sill's top, a corbel's side), not the profile it was extruded from",
  "curved-face": "the wall is built on a curve: the stored side area is its outer or inner curved face, as summed from its facets (the computed side area is the mean of the two faces, which is the centre line's for a wall of one height)",
  curved: "the wall is built on a curve, and its two curved faces could not be told apart on its facets (a plane cut gives a chord's elevation): the stored area is kept",
  "centre-line": "the stored area is the element's stored centre-line length x its width (footprint) or height (side), or a covering drawn as a wall's centre length x thickness: a nominal figure that ignores angled or mitred ends",
  "other-width": "the wall is measured across another direction than its thinnest one (a short wall with angled ends): the stored side area is its stored volume / stored width",
  unexplained: "no known cause; check the element in a viewer",
};

export const REASON_TEXT = {
  "split-held": "the whole element's stored volume is written on one piece of an element split by level (Revit: one IfcWallStandardCase with quantities, the rest IfcWall with none); the pieces' geometry sums to it, so the BoQ sums each piece's own",
  split: "the same stored volume is written on every piece of an element split by level; the pieces' geometry sums to it",
  repeated: "the same stored volume is written on several pieces of one element, and the pieces in this file do not sum to it",
  "unit-slip": "the stored volume is the geometry's times a power of ten, the square-foot factor 10.7639, or both: written in the wrong unit",
  "nominal-slip": "the stored volume is the element's own stored area times its nominal width, written in the wrong unit (a power of ten off); the body is not of that nominal thickness (a slab sloped to drain), so the geometry is summed",
  "net-as-gross": "the exporter's GrossVolume equals the volume with openings taken out (net)",
  "own-dimensions": "the stored volume disagrees with the element's own stored length x height x width (a member's length x cross-section area); the geometry agrees with them",
  "not-stored": "the stored volume is 0 on an element with a body: a placeholder, not a measurement",
  "assembly-total": "the same stored volume is written on every piece of one assembly (a stair's stringers, flights and landings), and it is the whole assembly's: the pieces' geometry sums to it",
  "simplified-section": "the stored volume is computed from a simplified section (no fillet radii, or round tubes as polygons); the geometry follows the profile's own radii, and stored weights are scaled to it",
  "glazing-left-out": "the stored volume is the frame and sash only: the body less its glass panes, or less the panes of one plane such as a door's side lights (ArchiCAD windows and doors); the geometry, panes included, is summed",
  "polygon-section": "the stored volume is measured on a polygonised section: the profile's arcs as 45-degree chords, or a round section as a circumscribed 20-gon (ArchiCAD), 0.07% to 1% off the true arcs; the geometry, which follows them, is summed",
  "body-is-net": "the body geometry already has the openings cut out (no opening elements in the file): it equals the stored NetVolume, and the stored GrossVolume is larger by the openings",
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
  // the glass panes in the body: ArchiCAD stores a window's or door's
  // volume without them (glazingLeftOut)
  const glz = /^IFC(WINDOW|DOOR)/.test(e.type) ? glazingVolume(E, geo, idx, repId) : null;
  if (glz) {
    out.glazing = glz.volume * f3; out.glazingPieces = glz.pieces;
    if (glz.planes?.length > 1) out.glazingPlanes = glz.planes.map((p) => ({ volume: p.volume * f3, pieces: p.pieces }));
  }
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
    let [a, b] = solidExtent(body, d);
    // a swept disk (a bar drawn along its path) has no faces: its box is
    // where the tube along the path reaches
    if (body.bars) { const [c, e] = barExtent(body.bars, d); a = Math.min(a, c); b = Math.max(b, e); }
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
      // a wall on an arc has no middle plane: a plane cut gives a chord's
      // elevation, not the curved face (skolebygg, eval/curved-and-faces-2026-11-22.md)
      if (bendsInPlan(body, v, t.n)) {
        out.side.curved = true;
        // measured on its own facets instead: the outer and inner faces, and
        // their mean as the side area (the centre line's, for a wall of one
        // height: arc length grows with the radius). The chord cut is kept.
        // Checked against the body: a wall of one section has volume = mean
        // face x width, so a body whose faces were not all read as standing
        // (skolebygg's triangulated breps #1455746 and #1457200, whose
        // triangles lean off the vertical) is left unmeasured
        // A wall whose section changes up its height (skolebygg's #1455746
        // and #1457200: 0.1 m thick under a 0.75 m recess, 0.423 m above)
        // fails that, so it passes instead when the two faces enclose the
        // body's volume by the divergence theorem in plan (`swept`), which
        // holds for any section when the other faces are level or radial
        // (eval/triangulated-arc-breps-2026-11-23.md)
        const g = curvedFaces(body, v), nt = net ? curvedFaces(net, v) : null;
        const V = Math.abs(solidVolume(body));
        const mean = g ? (g.outer + g.inner) / 2 : 0;
        const oneSection = g && V > 0 && Math.abs(mean * (g.rOuter - g.rInner) - V) <= 0.02 * V;
        // Negative terms are allowed: a drawn profile's signed fan (stepped
        // walls as two outline items, fans started on either arc, a half
        // ring) and a boolean recess both sweep their volume to 1e-14, while
        // ends cut square still miss by 28% and are refused
        // (eval/signed-fan-swept-2026-11-23.md). The guard that kept them out
        // came from ISSUE_129's #36735/#148665, traced to coplanar ends
        // (eval/half-round-ends-2026-11-23.md), not to their negative terms
        // Ends cut square (neither level nor radial) add their own flux in
        // plan, `ends`: the faces and the ends then enclose the volume
        // (eval/square-cut-ends-2026-11-23.md); a face facet dropped or a
        // leaning face still leaves it short
        const stepped = !oneSection && g && V > 0 && Math.abs(g.swept + g.ends - V) <= 0.02 * V;
        if (oneSection || stepped) {
          out.side.chord = { gross: out.side.gross, net: out.side.net };
          out.side.faces = { gross: [g.outer * f2, g.inner * f2], net: nt ? [nt.outer * f2, nt.inner * f2] : [null, null] };
          out.side.gross = mean * f2;
          out.side.net = nt ? ((nt.outer + nt.inner) / 2) * f2 : null;
          out.side.width = (g.rOuter - g.rInner) * f;
          out.side.radius = { outer: g.rOuter * f, inner: g.rInner * f };
          if (stepped) out.side.stepped = true;
        }
      }
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
    // a deck or course lofted along an alignment: its top faces seen from
    // above, since no one plane cut fits a deck that curves, climbs and is
    // crowned (the I-405/SR 167 flyover's mid-depth cut caught 179 m2 of
    // about 6,000; eval/pgsuper-bridges-2026-11-24.md)
    if (body.lofted && body.shells?.length) {
      const g = shellPlanArea(body, v), nt = net?.lofted ? shellPlanArea(net, v) : g;
      if (g != null) { out.plan = { gross: g * f2, net: nt == null ? null : nt * f2, n: v, lofted: true }; return out; }
    }
    const meshUp = !body.terms.length && /^IFCCOVERING/.test(type);
    const n = body.axis ?? (meshUp ? v : thinnestNormal(body)?.n);
    if (n) {
      out.plan = cut(n, 0.5, true);
      // the same plane moved to each face: a tapered or sloped slab's stored
      // area is sometimes its top or bottom face
      const a = cut(n, 1e-4), b = cut(n, 1 - 2e-4);
      out.plan.faces = { gross: [a.gross, b.gross], net: [a.net, b.net] };
      // each plane's face area: ArchiCAD stores a sill's top or a corbel's
      // side as the "area" of an element extruded another way
      const P = planeAreas(body, true);
      if (P) out.plan.planes = P.map((p) => p.area * f2);
    }
  }
  // the whole skin of a steel part (coatingArea): net of its openings and
  // holes when the cut body can be summed face by face, else the uncut body
  if (COATED_CLASS.test(type)) {
    const g = surfaceArea(body), nt = net && net !== body ? surfaceArea(net) : null;
    if (g != null) out.surface = { gross: g * f2, net: nt == null ? null : nt * f2 };
  }
  if (AREA_KINDS.cross.test(type)) {
    // a faceted member has no extrusion: its length runs along the face
    // normal (an end face's) in whose direction the body is longest
    const n = body.axis ?? (body.terms.length ? null : prismAxis(body) ?? thinnestNormal(body, () => true, true)?.n);
    if (n) {
      out.cross = cut(n);
      // the body's whole surface: Revit writes half of it as some members'
      // CrossSectionArea (HHS architect's mullions)
      const S = surfaceArea(body);
      if (S != null) out.cross.surface = S * f2;
    }
  }
  return out;
}

const extentOf = solidExtent;

// ---- member length and steel weight -----------------------------------------
//
// Qto_BeamBaseQuantities, Qto_ColumnBaseQuantities and Qto_MemberBaseQuantities
// define Length as "the total nominal length ... not taking into account any
// cut-outs or other processing features": the body's extent along its
// extrusion (a faceted member: along the end face normal it is longest in).
// A model with no quantity set (many IFC exports, every hand-built one) would
// otherwise price a per-metre or per-kg rate at 0.

export const LINEAR_CLASS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
export const REBAR_CLASS = /^IFC(REINFORCINGBAR|TENDON)$/;

/** A linear member's length from its body, in metres; null when it has no axis to read. */
export function memberLength(type, body, f) {
  // a reinforcing bar (or tendon) swept as a disk: its cut length is the
  // directrix's, bends included (buildingSMART reinforcing-stirrup)
  if (REBAR_CLASS.test(type)) return body?.sweepLength != null ? body.sweepLength * f : null;
  if (!LINEAR_CLASS.test(type) || !body || (body.mesh && !body.shells)) return null;
  const n = body.axis ?? (body.terms.length ? null : prismAxis(body) ?? thinnestNormal(body, () => true, true)?.n);
  if (!n) return null;
  const [lo, hi] = extentOf(body, n);
  return hi > lo ? (hi - lo) * f : null;
}

// Structural steel, EN 1991-1-1 Table A.4 and AISC's 490 lb/ft3: 7,850 kg/m3.
// Applied only when the element's material names steel and nothing else
// (a "Concrete / Steel" layer set or a steel-fibre concrete is not steel).
export const STEEL_DENSITY = 7850;
const STEEL_NAME = /\b(steel|stahl|staal|acier|acero|acciaio|stål|teräs|stal|metal\s*-\s*steel|s(?:185|235|275|355|420|450|460|690)(?:[a-z0-9+]*)|a(?:36|500|572|588|913|992)|q(?:235|345|355)[a-z]*|ss400|sm490)\b/i;
const NOT_STEEL = /concrete|beton|béton|hormig|calcestruzzo|timber|wood|holz|hout|glulam|stainless|inox|edelstahl|rvs|alumin|fibre|fiber|faser|reinforc|rebar|bewehr|wapening|neoprene|rubber|elastomer|grout|mortar|paint|coating|insulat|isol/i;

// ---- coating area -----------------------------------------------------------
//
// The area a painter, galvaniser or fire-protection applicator prices on
// structural steel: every outside face of the part, ends and edges included;
// a hollow section's inside is summed apart (galvanising coats it, paint does
// not) (Tekla
// writes this figure as a beam's or column's OuterSurfaceArea and as a
// plate's NetArea: eval/coating-area-2026-11-24.md). Only steel parts of
// the framing classes; bars, tendons, ducts and fasteners are not coated.
export const COATED_CLASS = /^IFC(BEAM|COLUMN|MEMBER|PLATE|PILE|RAILING|STAIRFLIGHT)/;

/**
 * A steel part's coating area in m2 and where it came from, or null when the
 * part is not a coated steel part. Source order: the body's own faces
 * ("computed"), then a stored whole-skin figure ("stored": OuterSurfaceArea,
 * GrossSurfaceArea, or a plate NetArea explainAreas named whole-surface).
 * `stored` / `agree` report the stored skin beside the computed one.
 */
export function coatingArea(r) {
  if (!COATED_CLASS.test(r.ifcType ?? "") || !isSteel(r.material)) return null;
  const S = r.computed?.status === "ok" ? r.computed.areas?.surface : null;
  const computed = S ? S.net ?? S.gross : null;
  let stored = null, storedName = null;
  for (const [k, q] of Object.entries(r.stored || {})) {
    if (q.kind === "area" && /^(outer|gross|net)surfacearea$/i.test(k.replace(/\s+/g, ""))) { stored = q.value; storedName = k; break; }
  }
  if (stored == null) for (const [k, c] of Object.entries(r.areaCheck || {})) if (c.reason === "whole-surface" && c.surface != null) { stored = c.surface; storedName = k; break; }
  const agree = computed != null && stored != null ? Math.abs(computed - stored) <= 0.02 * Math.max(computed, stored) : null;
  if (computed != null) return { area: computed, source: "computed", holes: S.net != null, inside: S.inside ?? 0, stored, storedName, agree };
  if (stored != null) return { area: stored, source: "stored", holes: null, inside: 0, stored, storedName, agree };
  return { area: null, source: null, holes: null, inside: 0, stored: null, storedName: null, agree: null };
}

const NOT_REBAR_STEEL = /gfrp|frp|glass|basalt|carbon|aramid|fibre|fiber|faser|stainless|inox|edelstahl|rvs|alumin|timber|wood/i;

/** True when a material name reads as plain structural steel. */
export function isSteel(material) {
  if (!material) return false;
  const parts = String(material).split(" / ").map((x) => x.replace(/_/g, " ").trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => STEEL_NAME.test(p) && !NOT_STEEL.test(p));
}

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

const GROUP_KEYS = { class: (r) => r.ifcClass, type: (r) => r.type ?? "(no type)", storey: (r) => r.storey ?? "(no storey)", space: (r) => r.space ?? "(no room)", material: (r) => r.material ?? "(no material)", classification: (r) => r.classification ?? "(none)", uniformat: (r) => uniformatLabel(r, 3), uniformat2: (r) => uniformatLabel(r, 2), uniformat1: (r) => uniformatLabel(r, 1) };

/**
 * A check whose stored figure the BoQ would sum although it disagrees with the
 * geometry for no cause this tool can name: an open question, not a known
 * error, so the figure is kept (by default) and the line reports the range.
 */
const inDoubt = (c) => !!c && !c.agree && (!c.reason || c.reason === "unexplained") && c.trust !== false && Number.isFinite(c.computed) && Number.isFinite(c.stored);

/** How the BoQ treats a stored figure that disagrees with the geometry for no known cause. */
export const UNEXPLAINED_CHOICES = ["stored", "geometry"];

/**
 * The quantity of a row a BoQ line sums: the stored value when present, else the computed one.
 * `opts.unexplained`: "stored" (default) keeps a stored volume or area that
 * disagrees with the geometry for no named cause; "geometry" sums the
 * geometry's figure for those rows instead. Either way the row reports
 * volumeDoubt / areaDoubt ({stored, computed}) so a line can show the range.
 */
export function rowQuantities(r, opts = {}) {
  const useGeometry = opts.unexplained === "geometry";
  const s = r.stored;
  const first = (names, kind) => { for (const n of names) for (const [k, q] of Object.entries(s)) if (q.kind === kind && k.toLowerCase() === n) return q.value; return null; };
  const netStored = first(["netvolume"], "volume");
  let storedNet = r.trustStored === false ? null : netStored ?? first(["grossvolume", "volume"], "volume");
  let comp = r.computed && r.computed.status === "ok" ? (r.computed.net ?? r.computed.gross) : null;
  // the check on the very figure summed: NetVolume when stored, else GrossVolume
  const vChk = storedNet == null ? null : netStored != null ? r.check?.net : r.check?.gross;
  const volumeDoubt = inDoubt(vChk) && near6(vChk.stored, storedNet) ? { stored: vChk.stored, computed: vChk.computed } : null;
  if (volumeDoubt && useGeometry) { storedNet = null; comp = volumeDoubt.computed; }
  // area: the stored figure unless its check says not to sum it (split,
  // repeated, unit slip, not a section), else the area cut from the geometry
  const AREA_NAMES = ["netsidearea", "netarea", "netfloorarea", "netsurfacearea", "grosssidearea", "grossarea", "area"];
  let area = null, areaSource = null, areaDoubt = null;
  for (const n of AREA_NAMES) {
    const hit = Object.entries(s).find(([k, q]) => q.kind === "area" && k.toLowerCase() === n);
    if (!hit) continue;
    const chk = r.areaCheck?.[hit[0]];
    if (chk && chk.trust === false) { area = chk.computed; areaSource = "computed"; } else { area = hit[1].value; areaSource = "stored"; }
    if (areaSource === "stored" && inDoubt(chk)) {
      areaDoubt = { stored: chk.stored, computed: chk.computed };
      if (useGeometry) { area = chk.computed; areaSource = "computed"; }
    }
    break;
  }
  if (area == null) { const ca = primaryArea(r); if (ca != null) { area = ca; areaSource = "computed"; } }
  return {
    volume: storedNet ?? comp,
    volumeSource: storedNet != null ? "stored" : comp != null ? "computed" : null,
    volumeDoubt,
    area,
    areaSource,
    areaDoubt,
    ...lengthAndWeight(r, first, storedNet ?? comp, storedNet != null ? "stored" : comp != null ? "computed" : null),
  };
}

const near6 = (a, b) => Math.abs(a - b) <= 1e-9 + 1e-9 * Math.abs(b);

// Length: the stored figure, else the body's extent along its axis.
// Weight: the stored figure (scaled when its section was simplified), else
// the volume the line sums times steel's density when the material is steel.
function lengthAndWeight(r, first, volume, volumeSource) {
  let length = first(["length", "netlength", "grosslength"], "length"), lengthSource = length != null ? "stored" : null;
  if (r.lengthCheck?.trust === false) length = null;
  if (length == null && r.computed?.status === "ok" && r.computed.length != null) { length = r.computed.length; lengthSource = "computed"; }
  let weight = first(["netweight", "grossweight", "weight"], "weight"), weightSource = weight != null ? "stored" : null;
  // a weight the exporter derived from a simplified section is scaled to the geometry
  if (weight != null && r.weightScale) weight *= r.weightScale;
  // a reinforcing bar is steel unless its material names something else
  // (GFRP, basalt, stainless): "ReinforcingSteel" reads as not-steel to
  // isSteel, which guards against reinforced concrete
  // a bar whose path was read: its centreline length times the nominal
  // size's mass per metre, not its drawn disk (Tekla draws a 10 mm bar
  // 10.625 mm across, its ribs, which weighs 13% more)
  if (weight == null && REBAR_CLASS.test(r.ifcType ?? "") && r.bars?.length && r.barProps?.diameterMm && !NOT_REBAR_STEEL.test(r.material ?? "")) { weight = r.bars.reduce((t, b) => t + b.length, 0) * massPerMetre(r.barProps.diameterMm); weightSource = "nominal-size"; }
  if (weight == null && volume != null && REBAR_CLASS.test(r.ifcType ?? "") && !NOT_REBAR_STEEL.test(r.material ?? "")) { weight = volume * STEEL_DENSITY; weightSource = volumeSource === "stored" ? "density-stored-volume" : "density"; }
  if (weight == null && volume != null && isSteel(r.material)) { weight = volume * STEEL_DENSITY; weightSource = volumeSource === "stored" ? "density-stored-volume" : "density"; }
  return { length, lengthSource, weight, weightSource };
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
/** The bill-of-quantities line key a row falls under, for grouping keys `by`. */
export const boqKey = (r, by) => by.map((k) => GROUP_KEYS[k](r));

/**
 * `opts.unexplained` ("stored" or "geometry", see rowQuantities) decides which
 * figure a line sums where they disagree for no known cause; each line also
 * carries volumeDoubt / areaDoubt: how many rows, and what their stored and
 * geometry figures sum to, so the spread is visible whichever is summed.
 */
export function boq(rows, by = ["class", "type"], rule = null, opts = {}) {
  const measured = ruleActive(rule);
  const lines = new Map();
  for (const r of rows) {
    if (r.isAssembly) continue;
    const key = by.map((k) => GROUP_KEYS[k](r));
    const k = JSON.stringify(key);
    let L = lines.get(k);
    if (!L) { L = { key, count: 0, volume: 0, volumeStored: 0, volumeComputed: 0, volumeMissing: 0, area: 0, areaComputed: 0, length: 0, weight: 0, lengthComputed: 0, weightComputed: 0, lengthMissing: 0, weightMissing: 0, disagree: 0, voidsLeft: 0, areaChange: 0, volumeChange: 0, ruleSkipped: 0, volumeDoubt: { count: 0, stored: 0, computed: 0 }, areaDoubt: { count: 0, stored: 0, computed: 0 }, coating: 0, coatingInside: 0, coatingStored: 0, coatingMissing: 0, coatingDisagree: 0 }; lines.set(k, L); }
    const q = measured ? applyRule(r, rowQuantities(r, opts), rule) : rowQuantities(r, opts);
    for (const [d, D] of [[q.volumeDoubt, L.volumeDoubt], [q.areaDoubt, L.areaDoubt]]) if (d) { D.count++; D.stored += d.stored; D.computed += d.computed; }
    if (measured) { L.voidsLeft += q.voidsLeft; L.areaChange += q.areaChange; L.volumeChange += q.volumeChange; if (q.ruleNotes.length) L.ruleSkipped++; }
    L.count++;
    if (q.volume != null) { L.volume += q.volume; if (q.volumeSource === "stored") L.volumeStored++; else L.volumeComputed++; } else L.volumeMissing++;
    if (q.area != null) { L.area += q.area; if (q.areaSource === "computed") L.areaComputed++; }
    if (q.length != null) { L.length += q.length; if (q.lengthSource === "computed") L.lengthComputed++; } else if (LINEAR_CLASS.test(r.ifcType)) L.lengthMissing++;
    if (q.weight != null) { L.weight += q.weight; if (q.weightSource !== "stored") L.weightComputed++; } else if (LINEAR_CLASS.test(r.ifcType)) L.weightMissing++;
    const ca = coatingArea(r);
    if (ca) { if (ca.area != null) { L.coating += ca.area; L.coatingInside += ca.inside; if (ca.source === "stored") L.coatingStored++; } else L.coatingMissing++; if (ca.agree === false) L.coatingDisagree++; }
    if ((r.check && ((r.check.gross && !r.check.gross.agree) || (r.check.net && !r.check.net.agree))) || Object.values(r.areaCheck || {}).some((c) => !c.agree)) L.disagree++;
  }
  return [...lines.values()].sort((a, b) => a.key.join("\u0000").localeCompare(b.key.join("\u0000")));
}

const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

/** Column heading for a group key. */
export const keyLabel = (k) => ({ uniformat: "Uniformat II element", uniformat2: "Uniformat II group", uniformat1: "Uniformat II major group", space: "Room" })[k] ?? k[0].toUpperCase() + k.slice(1);

const doubtCells = (D) => (D && D.count ? [D.count, D.stored, D.computed] : [0, null, null]);

/** `opts.unexplained` labels which figure the lines summed for rows in doubt. */
export function boqCsv(lines, by, rates = {}, rule = null, opts = {}) {
  const measured = ruleActive(rule);
  const head = [...by.map(keyLabel), "Count", "Volume m3", "Area m2", "Length m", "Weight kg", "Volume from model's stored quantities", "Volume computed here", "No volume", "Areas computed here", "Rows where stored and computed disagree", "Rate", "Rate unit", "Amount", "Lengths computed here", "Weights from steel density (7850 kg/m3)", "Members with no length", "Members with no weight", "Volumes in doubt (disagree for no known cause)", "Their stored volume m3", "Their geometry volume m3", "Areas in doubt (disagree for no known cause)", "Their stored area m2", "Their geometry area m2", "Summed for those", "Coating area m2 (steel parts' outside surface)", "Inside of hollow sections m2", "Coating areas from stored figures", "Steel parts with no coating area", "Coating areas where stored and geometry disagree"];
  if (measured) head.push(`Voids not deducted (${ruleLabel(rule)})`, "Area added back m2", "Volume added back m3", "Rows the rule could not adjust");
  const out = [head.map(csvCell).join(",")];
  for (const L of lines) {
    const k = JSON.stringify(L.key);
    const rate = rates[k];
    let amount = null;
    if (rate && Number.isFinite(rate.rate)) amount = rate.rate * ({ each: L.count, m3: L.volume, m2: L.area, m: L.length, kg: L.weight, "m2 coat": L.coating }[rate.unit] ?? 0);
    const cells = [...L.key, L.count, L.volume, L.area, L.length, L.weight, L.volumeStored, L.volumeComputed, L.volumeMissing, L.areaComputed, L.disagree, rate ? rate.rate : null, rate ? rate.unit : null, amount, L.lengthComputed, L.weightComputed, L.lengthMissing, L.weightMissing, ...doubtCells(L.volumeDoubt), ...doubtCells(L.areaDoubt), L.volumeDoubt?.count || L.areaDoubt?.count ? (opts.unexplained === "geometry" ? "geometry" : "stored") : null, ...(L.coating || L.coatingMissing ? [L.coating, L.coatingInside, L.coatingStored, L.coatingMissing, L.coatingDisagree] : [null, null, null, null, null])];
    if (measured) cells.push(L.voidsLeft, L.areaChange, L.volumeChange, L.ruleSkipped);
    out.push(cells.map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

export function rowsCsv(rows) {
  const head = ["Entity", "GlobalId", "Class", "Name", "Type", "Storey", "Room", "Room from", "Material", "Classification", "Uniformat II", "Uniformat source", "Uniformat basis", "Assembly", "Part of", "Computed gross m3", "Computed net m3", "Openings", "Geometry status", "Stored GrossVolume m3", "Stored NetVolume m3", "Volume check", "Computed gross area m2", "Computed net area m2", "Area measured", "Area check", "Stored quantities", "Computed length m", "Length check", "BoQ length m", "BoQ weight kg", "Weight from"];
  const out = [head.map(csvCell).join(",")];
  for (const r of rows) {
    const c = r.computed || {};
    const g = r.check && r.check.gross, n = r.check && r.check.net;
    const verdict = !r.check ? "" : [g && (g.agree ? "gross agrees" : `gross differs ${(g.rel * 100).toFixed(1)}%`), n && (n.agree ? "net agrees" : `net differs ${(n.rel * 100).toFixed(1)}%`)].filter(Boolean).join("; ");
    const stored = Object.entries(r.stored).map(([k, q]) => `${k}=${Math.round(q.value * 1e6) / 1e6}`).join("; ");
    const A = c.areas && !c.areas.error && !c.areas.faceted ? (c.areas.side ? ["side", c.areas.side] : c.areas.plan ? ["plan", c.areas.plan] : c.areas.cross ? ["cross-section", c.areas.cross] : null) : null;
    const areaVerdict = Object.entries(r.areaCheck || {}).map(([k, a]) => a.agree ? `${k} agrees` : `${k} differs ${a.rel === Infinity ? "" : (a.rel * 100).toFixed(1) + "%"}${a.reason ? " (" + a.reason + ")" : ""}`).join("; ");
    out.push([`#${r.id}`, r.globalId, r.ifcClass, r.name, r.type, r.storey, r.space, r.spaceFrom ?? "", r.material, r.classification, r.uniformat?.code ?? "", r.uniformat?.source ?? "", r.uniformat?.why ?? "", r.isAssembly ? "yes" : "", r.parent ? `#${r.parent}` : "", c.gross, c.net, c.openings, c.status === "ok" ? (c.net == null ? `net not computed: ${c.netReason}` : "ok") : c.status ? `${c.status}${c.reason ? ": " + c.reason : ""}` : "", g ? g.stored : null, n ? n.stored : null, verdict, A ? A[1].gross : null, A ? A[1].net : null, A ? A[0] : "", areaVerdict, stored, ...lengthCells(r)].map(csvCell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}

// what the element CSV says about a row's length and weight
function lengthCells(r) {
  const lc = r.lengthCheck, q = rowQuantities(r);
  const verdict = !lc ? "" : lc.agree ? "agrees" : `differs ${lc.rel === Infinity ? "" : (lc.rel * 100).toFixed(1) + "%"}${lc.reason ? " (" + lc.reason + ")" : ""}`;
  const from = { stored: "stored quantity", density: "computed volume x 7850 kg/m3 (steel)", "density-stored-volume": "stored volume x 7850 kg/m3 (steel)" }[q.weightSource] ?? "";
  return [r.computed?.length ?? null, verdict, q.length, q.weight, from];
}

/** Totals of the check across rows, for the page's summary and the eval. */
/**
 * One sentence for the reader when readUnits replaced a declared factor, or
 * null: the unit's name, what the file declared and what was used.
 */
export function unitRepairNote(units) {
  const r = units && units.repairs;
  if (!r || !r.length) return null;
  const fmt = (v) => (v >= 0.01 && v < 1e4 ? String(+v.toPrecision(6)) : v.toExponential(4));
  const si = { LENGTHUNIT: "m", AREAUNIT: "m2", VOLUMEUNIT: "m3", MASSUNIT: "kg", PLANEANGLEUNIT: "rad" };
  return "The file's units are faulty and were repaired: " + r.map((x) => `'${x.name}' is declared as ${fmt(x.declared)} ${si[x.type]} (${+(x.declared / x.used).toPrecision(4)} times the real ${x.name.toLowerCase()}); the exact ${fmt(x.used)} ${si[x.type]} was used`).join("; ") + ".";
}

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
