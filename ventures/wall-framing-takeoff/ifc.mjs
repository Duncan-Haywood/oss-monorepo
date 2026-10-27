// @ts-check
// IFC (STEP text) floor plan in, wall plan out. Reads walls (IfcWall,
// IfcWallStandardCase) as plan centre lines, doors and windows as openings
// along them, then hands the result to the DXF reader's wall logic
// (planFromDxf) so corners, tees, the exterior loop and openings behave the
// same for both formats.
//
// Assumptions, because an IFC file can say more than this reads:
//  - a wall's centre line is its 'Axis' representation (IfcPolyline); with no
//    axis, an extruded rectangle profile whose X dimension runs along the wall,
//    and failing that the plan bounding box of its body mesh (tessellated face
//    set, faceted B-rep or extruded closed profile) in the wall's own frame:
//    the longer side is the length, the middle of the shorter side the centre line;
//  - placements are plan placements: rotation about the vertical axis only;
//  - a door or window's placement origin is the near end of its width and its
//    local X runs along the wall (the usual export), width = OverallWidth;
//  - walls of a storey are drawn at one elevation; every storey is merged
//    into one plan, so feed one storey's file or accept the overlap.
// Heights and headers are not read (defaults from planFromDxf apply).
import { planFromDxf } from "./dxf.mjs";

/** Split a STEP argument string into nested arrays, strings, numbers, refs ("#12"), enums (".X.") and null. */
function parseArgs(s) {
  let i = 0;
  const val = () => {
    while (s[i] === " ") i++;
    const c = s[i];
    if (c === "(") {
      i++;
      const out = [];
      for (;;) {
        while (s[i] === " ") i++;
        if (s[i] === ")") { i++; return out; }
        if (s[i] === ",") { i++; continue; }
        if (i >= s.length) return out;
        out.push(val());
      }
    }
    if (c === "'") { let j = i + 1, t = ""; while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) { t += s[j] === "'" ? "'" : s[j]; j += s[j] === "'" ? 2 : 1; } i = j + 1; return t; }
    let j = i;
    while (j < s.length && ![",", ")"].includes(s[j])) j++;
    const tok = s.slice(i, j).trim(); i = j;
    if (tok === "$" || tok === "*" || tok === "") return null;
    if (/^[-+0-9.]/.test(tok) && !/^\.[A-Z_]+\.$/.test(tok)) return Number(tok);
    return tok;
  };
  return val();
}

/** @param {string} text */
export function parseStep(text) {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const data = body.slice(Math.max(0, body.indexOf("DATA;")));
  /** @type {Map<string, { type: string, args: any[] }>} */
  const ents = new Map();
  // statements end at ';' outside a quoted string (some exporters write a whole file on one line)
  for (const stmt of data.match(/(?:'(?:[^']|'')*'|[^';])*;?/g) ?? []) {
    const m = /^\s*(#\d+)\s*=\s*([A-Z0-9_]+)\s*(\([\s\S]*\))\s*;?\s*$/.exec(stmt);
    if (m) ents.set(m[1], { type: m[2], args: parseArgs(m[3]) });
  }
  return ents;
}

const SI_PREFIX = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 };

export function planFromIfc(text, opt = {}) {
  const notes = [];
  if (!/ISO-10303-21/.test(text.slice(0, 200))) return { ok: false, errors: ["This does not look like an IFC (STEP) file; it should start with ISO-10303-21. IFCZIP and IFCXML are not read."], notes };
  const ents = parseStep(text);
  const get = (r) => (typeof r === "string" ? ents.get(r) : undefined);
  // length unit -> inches
  let toIn = 0;
  // the project's units are those in IfcUnitAssignment; other IfcSIUnits (an IfcProjectedCRS map unit, say) must not win
  const assigned = new Set([...ents.values()].filter((e) => e.type === "IFCUNITASSIGNMENT").flatMap((e) => e.args[0] ?? []));
  const unitEnts = [...ents.entries()].filter(([, e]) => e.type === "IFCSIUNIT" || e.type === "IFCCONVERSIONBASEDUNIT");
  const projectUnits = unitEnts.filter(([id]) => assigned.has(id));
  for (const [, e] of projectUnits.length ? projectUnits : unitEnts) {
    if (e.type === "IFCSIUNIT" && e.args[1] === ".LENGTHUNIT.") toIn = (SI_PREFIX[String(e.args[2]).replace(/\./g, "")] ?? 1) * 100 / 2.54;
    if (e.type === "IFCCONVERSIONBASEDUNIT" && e.args[1] === ".LENGTHUNIT.") toIn = /^(INCH|IN)/i.test(e.args[2] ?? "") ? 1 : /^(FOOT|FEET|FT)/i.test(e.args[2] ?? "") ? 12 : toIn;
  }
  if (opt.units) toIn = { in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54 }[opt.units] ?? toIn;
  if (!toIn) { toIn = 100 / 2.54; notes.push("The file names no length unit; read as metres. Pass units to override and check one wall length."); }
  else notes.push("Length unit read from the file.");

  const pt = (r) => { const e = get(r); return e?.type === "IFCCARTESIANPOINT" ? { x: e.args[0][0] ?? 0, y: e.args[0][1] ?? 0 } : null; };
  const dir = (r) => { const e = get(r); return e?.type === "IFCDIRECTION" ? { x: e.args[0][0] ?? 0, y: e.args[0][1] ?? 0 } : null; };
  /** Plan transform of an IfcLocalPlacement chain: returns (local point) -> world point and the local X direction in world. */
  const placement = (r, depth = 0) => {
    const id = { o: { x: 0, y: 0 }, c: 1, s: 0 };
    const e = get(r);
    if (!e || e.type !== "IFCLOCALPLACEMENT" || depth > 20) return id;
    const parent = placement(e.args[0], depth + 1);
    const ax = get(e.args[1]);
    let o = { x: 0, y: 0 }, c = 1, s = 0;
    if (ax && ax.type.startsWith("IFCAXIS2PLACEMENT")) {
      o = pt(ax.args[0]) ?? o;
      const rd = ax.type === "IFCAXIS2PLACEMENT3D" ? dir(ax.args[2]) : dir(ax.args[1]);
      if (rd && Math.hypot(rd.x, rd.y) > 1e-9) { const l = Math.hypot(rd.x, rd.y); c = rd.x / l; s = rd.y / l; }
    }
    // child -> parent -> world
    return { o: { x: parent.o.x + parent.c * o.x - parent.s * o.y, y: parent.o.y + parent.s * o.x + parent.c * o.y }, c: parent.c * c - parent.s * s, s: parent.s * c + parent.c * s };
  };
  const apply = (T, p) => ({ x: T.o.x + T.c * p.x - T.s * p.y, y: T.o.y + T.s * p.x + T.c * p.y });

  const reps = (prod) => {
    const pds = get(prod.args[6]);
    return pds?.type === "IFCPRODUCTDEFINITIONSHAPE" ? (pds.args[2] ?? []).map(get).filter(Boolean) : [];
  };
  /** Plan points (wall-local) of a body item: mesh coordinates, B-rep loops or a closed profile outline. */
  const bodyPoints = (it, out, depth = 0) => {
    const e = get(it);
    if (!e || depth > 6) return;
    if (e.type === "IFCTRIANGULATEDFACESET" || e.type === "IFCPOLYGONALFACESET") {
      const cl = get(e.args[0]);
      for (const p of cl?.args?.[0] ?? []) if (Array.isArray(p)) out.push({ x: p[0] ?? 0, y: p[1] ?? 0 });
    } else if (e.type === "IFCFACETEDBREP") bodyPoints(e.args[0], out, depth + 1);
    else if (e.type === "IFCCLOSEDSHELL" || e.type === "IFCOPENSHELL") for (const f of e.args[0] ?? []) bodyPoints(f, out, depth + 1);
    else if (e.type === "IFCFACE") for (const b of e.args[0] ?? []) bodyPoints(b, out, depth + 1);
    else if (e.type === "IFCFACEOUTERBOUND" || e.type === "IFCFACEBOUND") bodyPoints(e.args[0], out, depth + 1);
    else if (e.type === "IFCPOLYLOOP" || e.type === "IFCPOLYLINE") for (const r of e.args[0] ?? []) { const q = pt(r); if (q) out.push(q); }
    else if (e.type === "IFCEXTRUDEDAREASOLID") {
      const prof = get(e.args[0]);
      if (prof?.type === "IFCARBITRARYCLOSEDPROFILEDEF") {
        const o = pt(get(e.args[1])?.args?.[0]) ?? { x: 0, y: 0 };
        const tmp = []; bodyPoints(prof.args[2], tmp, depth + 1);
        for (const q of tmp) out.push({ x: q.x + o.x, y: q.y + o.y });
      }
    }
  };
  /** @type {{ layer: string, a: {x:number,y:number}, b: {x:number,y:number} }[]} */
  const lines = [];
  let nWalls = 0, noGeom = 0, nOpen = 0, nMesh = 0;
  for (const e of ents.values()) {
    if (e.type !== "IFCWALL" && e.type !== "IFCWALLSTANDARDCASE") continue;
    const T = placement(e.args[5]);
    let local = null;
    for (const r of reps(e)) {
      if (r.args[1] !== "Axis") continue;
      for (const it of r.args[3] ?? []) {
        const pl = get(it);
        if (pl?.type === "IFCPOLYLINE") { const ps = pl.args[0].map(pt).filter(Boolean); if (ps.length >= 2) local = [ps[0], ps[ps.length - 1]]; }
      }
    }
    if (!local) for (const r of reps(e)) for (const it of r.args[3] ?? []) {
      const sol = get(it);
      const prof = sol?.type === "IFCEXTRUDEDAREASOLID" ? get(sol.args[0]) : null;
      if (prof?.type === "IFCRECTANGLEPROFILEDEF") {
        const pp = get(prof.args[2]);
        const c0 = (pp && pt(pp.args[0])) || { x: 0, y: 0 };
        const half = prof.args[3] / 2;
        local = [{ x: c0.x - half, y: c0.y }, { x: c0.x + half, y: c0.y }];
      }
    }
    if (!local) {
      const pts = [];
      for (const r of reps(e)) if (r.args[1] === "Body") for (const it of r.args[3] ?? []) bodyPoints(it, pts);
      if (pts.length >= 3) {
        const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        local = x1 - x0 >= y1 - y0 ? [{ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 }] : [{ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 }];
        nMesh++;
      }
    }
    if (!local) { noGeom++; continue; }
    const a = apply(T, local[0]), b = apply(T, local[1]);
    lines.push({ layer: "A-WALL", a, b });
    nWalls++;
  }
  for (const e of ents.values()) {
    if (e.type !== "IFCDOOR" && e.type !== "IFCWINDOW") continue;
    const w = e.args[9];
    if (!(w > 0)) continue;
    const T = placement(e.args[5]);
    const a = T.o, b = { x: T.o.x + T.c * w, y: T.o.y + T.s * w };
    lines.push({ layer: e.type === "IFCDOOR" ? "A-DOOR" : "A-GLAZ-WINDOW", a, b });
    nOpen++;
  }
  if (!nWalls) return { ok: false, errors: [`No IfcWall with an Axis line or a rectangle profile was found${noGeom ? ` (${noGeom} wall${noGeom === 1 ? "" : "s"} had other geometry: swept or boolean bodies are not read)` : ""}.`], notes };
  if (noGeom) notes.push(`${noGeom} wall${noGeom === 1 ? "" : "s"} skipped: geometry other than an Axis line or a rectangle profile.`);
  if (nMesh) notes.push(`${nMesh} wall${nMesh === 1 ? "" : "s"} had no axis: centre line taken from the plan bounding box of the body mesh (the longer side is the length; check that no wall is L-shaped or slanted).`);
  notes.push(`Read ${nWalls} wall${nWalls === 1 ? "" : "s"} and ${nOpen} door/window${nOpen === 1 ? "" : "s"} from the IFC; an opening's placement origin is taken as the near end of its width, running along its local X.`);

  const g = (c, v) => `${c}\n${v}\n`;
  let d = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, 1) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  for (const l of lines) d += g(0, "LINE") + g(8, l.layer) + g(10, l.a.x * toIn) + g(20, l.a.y * toIn) + g(30, 0) + g(11, l.b.x * toIn) + g(21, l.b.y * toIn) + g(31, 0);
  d += g(0, "ENDSEC") + g(0, "EOF");
  const r = planFromDxf(d, { ...opt, units: undefined });
  return { ...r, notes: [...notes, ...r.notes.filter((n) => !/units/i.test(n))] };
}
