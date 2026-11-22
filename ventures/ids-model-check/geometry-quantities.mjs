// Quantities read from an element's own geometry, for the model fill
// (model-fill.mjs, opts.geometry) when no quantity set in the model holds
// them. The measuring is ifc-quantity-takeoff's (its qto.mjs takeoff(): the
// body's volume, less its IfcRelVoidsElement openings, and areas cut through
// the body by the planes the standard Qto_ sets define). This file only maps
// its rows onto the Qto_ quantity names they stand for.
//
// Which names are offered, and why (eval/qto-from-geometry-2026-11-21.md
// measures each against the values exporters stored, on the HHS Office
// models):
//   GrossVolume, NetVolume   any element with a body (NetVolume only when
//                            every opening could be cut out)
//   GrossSideArea, NetSideArea, GrossFootprintArea, NetFootprintArea, Width
//                            walls (side: the wall's middle plane; footprint:
//                            the plan at its base; width: its thickness)
//   GrossArea, NetArea       slabs, plates, coverings, roofs (the extruded
//                            profile)
//   CrossSectionArea         columns, beams, members, piles
//   Length, Height           walls: the direction from a straight 'Axis'
//                            representation, or with none from the body's own
//                            side faces; the body extruded or faceted
//                            (wallLines below; eval/wall-axis-lengths-2026-11-21.md,
//                            eval/wall-brep-lengths-2026-11-21.md)
//   Length                   columns, beams, members, piles: the body's length
//                            along its extrusion (memberLength below), when
//                            the body is longer than its section is wide; with
//                            square ends only, or cut ends by the authoring
//                            tool's convention (ARCHICAD: volume / section;
//                            Tekla: the extent along its smallest box)
//                            (eval/member-lengths-2026-11-22.md)
//   OuterSurfaceArea, GrossSurfaceArea
//                            columns, beams, members, piles with square ends:
//                            the side faces' area (section perimeter x length)
//                            and that plus both end faces, each by the
//                            authoring tool's convention (memberSurface below;
//                            eval/member-surfaces-2026-11-22.md)
//   Width, Perimeter         slabs: the thickness across the extruded profile,
//                            and the profile's outline at mid-thickness
//                            (slabLines below; eval/slab-width-perimeter-2026-11-22.md)
//   Width, Height, Area, Perimeter
//                            doors and windows: the opening each fills, in
//                            its placement's x (width) and z (height), its
//                            section and bounding perimeter; ARCHICAD exports
//                            only, the one tool whose convention is known
//                            (openingLines below; eval/door-window-quantities-2026-11-22.md)
//   GrossFloorArea, GrossPerimeter, Height, FinishCeilingHeight,
//   GrossCeilingArea, GrossVolume, NetVolume, NetFloorArea
//                            spaces (IfcSpace): ifc-quantity-takeoff's room
//                            reading of the space's own solid, or its plan
//                            outline and box (spaceQuantities below;
//                            eval/space-quantities-2026-11-22.md)
// Other lengths and heights are not offered.
//
// Every value is in SI units (m, m2, m3), as the IDS standard reads values.

const WALL = /^IFCWALL/;
const PLAN = /^IFC(SLAB|PLATE|COVERING|ROOF)/;
const CROSS = /^IFC(COLUMN|BEAM|MEMBER|PILE)/;
const SLAB = /^IFCSLAB/;
const LINEAR = /^IFC(WALL|COLUMN|BEAM|MEMBER|PILE)/; // Length: walls and linear members
const OPENING = /^IFC(DOOR|WINDOW)/;
const LINES = new Set(["Length", "Height"]); // read from computed.lines, not the sections
const SURFACES = new Set(["OuterSurfaceArea", "GrossSurfaceArea"]); // computed.surface, faceted bodies too

// [quantity name, quantity kind, class test or null for any, reader(row) -> number|null]
export const GEOMETRY_QUANTITIES = [
  ["GrossVolume", "volume", null, (r) => r.computed.gross],
  ["NetVolume", "volume", null, (r) => r.computed.net],
  ["GrossSideArea", "area", WALL, (r) => r.computed.areas?.side?.gross],
  ["NetSideArea", "area", WALL, (r) => r.computed.areas?.side?.net],
  ["GrossFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.gross],
  ["NetFootprintArea", "area", WALL, (r) => r.computed.areas?.footprint?.net],
  ["Width", "length", WALL, (r) => r.computed.areas?.side?.width],
  ["Width", "length", SLAB, (r) => r.computed.slab?.width],
  ["Perimeter", "length", SLAB, (r) => r.computed.slab?.perimeter],
  ["GrossArea", "area", PLAN, (r) => r.computed.areas?.plan?.gross],
  ["NetArea", "area", PLAN, (r) => r.computed.areas?.plan?.net],
  ["CrossSectionArea", "area", CROSS, (r) => r.computed.areas?.cross?.gross],
  ["OuterSurfaceArea", "area", CROSS, (r) => r.computed.surface?.outer],
  ["GrossSurfaceArea", "area", CROSS, (r) => r.computed.surface?.gross],
  ["Length", "length", LINEAR, (r) => r.computed.lines?.length],
  ["Height", "length", WALL, (r) => r.computed.lines?.height],
  ["Width", "length", OPENING, (r) => r.computed.opening?.width ?? r.computed.revitSize?.width],
  ["Height", "length", OPENING, (r) => r.computed.opening?.height ?? r.computed.revitSize?.height],
  ["Area", "area", OPENING, (r) => r.computed.opening?.area ?? r.computed.revitSize?.area],
  ["Perimeter", "length", OPENING, (r) => r.computed.opening?.perimeter],
];

// The IFC quantity class each kind is written as.
export const KIND_CLASS = { volume: "IFCQUANTITYVOLUME", area: "IFCQUANTITYAREA", length: "IFCQUANTITYLENGTH" };

const usable = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * The quantities each element's geometry gives.
 * @param {Array} rows takeoff(model).rows from ifc-quantity-takeoff/qto.mjs
 * @returns {Map<number, Map<string, {value: number, kind: string}>>} STEP id -> name -> SI value
 */
export function quantitiesFromRows(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r.computed || r.computed.status !== "ok") continue;
    const A = r.computed.areas;
    const areasOk = A && !A.error && !A.faceted;
    let m = null;
    for (const [name, kind, cls, read] of GEOMETRY_QUANTITIES) {
      if (cls && !cls.test(r.ifcType)) continue;
      if (kind !== "volume" && !areasOk && !LINES.has(name) && !SURFACES.has(name) && !(cls === OPENING)) continue;
      const v = read(r);
      if (!usable(v)) continue;
      if (!m) out.set(r.id, (m = new Map()));
      m.set(name, { value: v, kind });
    }
  }
  return out;
}

// ---- a wall's length and height, from its axis and body --------------------
//
// Qto_WallBaseQuantities: Length is "the total nominal length of the wall
// along the wall path", Height "the total nominal height of the wall". The
// 'Axis' representation gives the path's direction but not its length:
// ARCHICAD draws it on the wall's reference line, often a face, and runs it
// to the reference line's corners (FZK-Haus: axis 4.59 m, stored Length 4.17
// m, the mean of its 4.05 m and 4.29 m faces). So the length is measured on
// the body: along the axis direction, on the plane halfway through the
// wall's thickness, at the level where the wall is longest (a gable wall's
// base). It reads the body as the takeoff holds it, a signed sum of convex
// pieces (a roof clip is a negative piece), so a line's inside is where the
// signs add up above zero. The height is the extrusion depth ("usually the
// extrusion depth", the Qto_ definition says): the positive pieces' extent
// up the wall, before a roof or slab clips it. Revit stores that; ARCHICAD
// stores the clipped wall's tallest point (`tallest`). Where the two differ
// (a clipped wall) the Height offered is the one the authoring tool's export
// stores (heightConvention: ARCHICAD or Revit), and none for other tools;
// elsewhere they are the same figure (eval/wall-axis-lengths-2026-11-21.md
// counts both; eval/wall-cut-top-heights-2026-11-22.md the clipped walls).

/** The parameter range [lo, hi] where the line o + t d is inside a convex polyhedron (outward planes), or null. */
function lineThrough(planes, o, d) {
  let lo = -Infinity, hi = Infinity;
  for (const [n, k] of planes) {
    const a = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
    const b = k - (n[0] * o[0] + n[1] * o[1] + n[2] * o[2]);
    if (Math.abs(a) < 1e-12) { if (b < -1e-9 * (Math.abs(k) + 1)) return null; continue; }
    const t = b / a;
    if (a > 0) { if (t < hi) hi = t; } else if (t > lo) lo = t;
    if (lo >= hi) return null;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/** First and last t where the signed pieces along the line add up above zero, or null. */
function insideSpan(pieces, o, d) {
  const ev = [];
  for (const { s, planes } of pieces) {
    const r = lineThrough(planes, o, d);
    if (r) { ev.push([r[0], s], [r[1], -s]); }
  }
  if (!ev.length) return null;
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let sum = 0, first = null, last = null;
  for (let i = 0; i < ev.length; i++) {
    const before = sum;
    sum += ev[i][1];
    if (before <= 0 && sum > 0 && first === null) first = ev[i][0];
    if (before > 0 && sum <= 0) last = ev[i][0];
  }
  return first !== null && last !== null && last > first ? [first, last] : null;
}

const MAX_SAMPLES = 400;

/**
 * A wall's length along its axis direction and its height, both on the plane
 * halfway through its thickness, in the body's own units.
 *
 * A faceted body (a brep, a tessellation: `mesh` with its closed `shells`)
 * is first taken as convex pieces by `asTerms` (geom.mjs: a convex shell is
 * one piece, any other a signed fan of tetrahedra whose signs add up to the
 * shell's inside), so the same line test reads it. Its extrusion is lost:
 * a roof's or slab's cut is already in the faces, so its depth up the wall
 * is the clipped wall's, and `flatTop` says whether the top is level along
 * the whole wall (addWallLines offers a faceted wall's Height only then).
 * @param {{terms: Array<{s: number, faces: number[][][]}>, mesh?: number, shells?: Array|null}} body
 * @param {number[]} dir the axis direction in the body's plane (x, y)
 * @param {(faces) => Array<[number[], number]>} polyPlanes ifc-quantity-takeoff's geom.mjs
 * @param {{asTerms?: Function}} [opts] geom.mjs asTerms, to read a faceted body
 * @returns {{length: number, height: number, tallest: number, faceted: boolean, flatTop: boolean} | null}
 *   null for a faceted body whose faces are not all known (or with no asTerms), or nothing found
 */
export function wallLines(body, dir, polyPlanes, opts = {}) {
  if (!body) return null;
  const faceted = !!body.mesh;
  let src = body;
  if (faceted) {
    if (!body.shells || !body.shells.length || typeof opts.asTerms !== "function") return null;
    src = opts.asTerms(body);
    if (!src || src.mesh) return null;
  } else if (body.shells && body.shells.length) return null;
  if (!src.terms?.length) return null;
  const L = Math.hypot(dir[0], dir[1]);
  if (!(L > 0)) return null;
  const d = [dir[0] / L, dir[1] / L, 0], n = [-d[1], d[0], 0];
  const pieces = src.terms.map((t) => ({ s: t.s, planes: polyPlanes(t.faces), faces: t.faces }));
  // the material's own vertices: an extruded body's positive pieces, or a
  // faceted body's material shells (a fan's tetrahedra share the shell's
  // centre, which is no vertex of the wall)
  const material = faceted
    ? [...body.terms.filter((t) => t.s > 0).map((t) => t.faces), ...body.shells.filter((sh) => sh.s > 0).map((sh) => sh.loops)]
    : pieces.filter((p) => p.s > 0).map((p) => p.faces);
  // the middle of the material's extent across the wall, and the vertices'
  // positions along it and up it: where the inside's ends can turn
  let nlo = Infinity, nhi = -Infinity;
  const along = new Set(), up = new Set();
  for (const faces of material) for (const f of faces) for (const q of f) { const x = n[0] * q[0] + n[1] * q[1]; if (x < nlo) nlo = x; if (x > nhi) nhi = x; }
  for (const p of pieces) {
    for (const f of p.faces) for (const q of f) {
      along.add(d[0] * q[0] + d[1] * q[1]);
      up.add(q[2]);
    }
  }
  if (!(nhi > nlo)) return null;
  const mid = (nlo + nhi) / 2;
  // sample between and a hair to each side of every vertex position
  const samples = (set) => {
    const v = [...set].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const span = (v[v.length - 1] - v[0]) || 1;
      out.push(v[i] + span * 1e-6, v[i] - span * 1e-6);
      if (i + 1 < v.length) out.push((v[i] + v[i + 1]) / 2);
    }
    if (out.length <= MAX_SAMPLES) return out;
    const step = out.length / MAX_SAMPLES;
    return Array.from({ length: MAX_SAMPLES }, (_, i) => out[Math.floor(i * step)]);
  };
  let length = 0, tallest = 0, zlo = Infinity, zhi = -Infinity;
  for (const z of samples(up)) {
    const o = [n[0] * mid, n[1] * mid, z];
    const r = insideSpan(pieces, o, d);
    if (r && r[1] - r[0] > length) length = r[1] - r[0];
  }
  // the extrusion depth: the material's extent up the wall
  for (const faces of material) for (const f of faces) for (const q of f) { if (q[2] < zlo) zlo = q[2]; if (q[2] > zhi) zhi = q[2]; }
  const height = zhi - zlo;
  // the tallest vertical line through the body as clipped (a roof's or slab's
  // cut taken off), on either face or the middle: for the evaluation's record.
  // On the middle plane, also the top's lowest point along the wall (a hair
  // in from its ends): a level top has it at the material's top.
  const eps = (nhi - nlo) * 1e-4;
  let topLow = Infinity, alo = Infinity, ahi = -Infinity;
  for (const a of along) { if (a < alo) alo = a; if (a > ahi) ahi = a; }
  for (const c of [nlo + eps, mid, nhi - eps]) {
    for (const a of samples(along)) {
      const o = [n[0] * c + d[0] * a, n[1] * c + d[1] * a, 0];
      const r = insideSpan(pieces, o, [0, 0, 1]);
      if (r && r[1] - r[0] > tallest) tallest = r[1] - r[0];
      if (r && c === mid && a > alo + (ahi - alo) * 0.01 && a < ahi - (ahi - alo) * 0.01 && r[1] < topLow) topLow = r[1];
    }
  }
  // and, on an extruded body (a faceted one's faces hold its cut already, so
  // its vertices' extent is its highest point), through every vertex, nudged
  // a hair into each quadrant around it: a
  // mitred end's acute corner or a hip clip's meeting point can hold the
  // highest point, where no line on a face or the middle passes (ARCHICAD's
  // stored Height is that point: eval/wall-cut-top-heights-2026-11-22.md)
  const corners = new Map();
  for (const p of pieces) for (const f of p.faces) for (const q of f) {
    const a = d[0] * q[0] + d[1] * q[1], c = n[0] * q[0] + n[1] * q[1];
    corners.set(`${a.toFixed(6)},${c.toFixed(6)}`, [a, c]);
  }
  if (!faceted && corners.size <= MAX_SAMPLES) {
    // (not diagonally: a 45-degree mitre's face would hold the line)
    for (const [a, c] of corners.values()) for (const da of [-eps, eps]) for (const dc of [-0.382 * eps, 0.382 * eps]) {
      const o = [n[0] * (c + dc) + d[0] * (a + da), n[1] * (c + dc) + d[1] * (a + da), 0];
      const r = insideSpan(pieces, o, [0, 0, 1]);
      if (r && r[1] - r[0] > tallest) tallest = r[1] - r[0];
    }
  }
  const flatTop = Number.isFinite(topLow) && zhi - topLow <= 0.005 * (zhi - zlo);
  // A body the middle line crosses on a short leg (an L-shaped plan: the
  // middle of its extent across runs through one arm only) is no single
  // straight wall: a length shorter than the body is thick is not offered.
  if (!(length >= nhi - nlo)) return null;
  return length > 0 && height > 0 ? { length, height, tallest, faceted, flatTop } : null;
}

/**
 * The plan direction of an element's straight 'Axis' representation, or
 * null (none, a curved or bent axis, or one that does not read).
 */
export function straightAxis(model, geo, e) {
  const shape = model.entities.get(e.args[6]?.ref);
  if (!shape || !Array.isArray(shape.args[2])) return null;
  for (const r of shape.args[2]) {
    const rep = model.entities.get(r?.ref);
    if (!rep || rep.type !== "IFCSHAPEREPRESENTATION" || rep.args[1] !== "Axis" || !Array.isArray(rep.args[3]) || rep.args[3].length !== 1) continue;
    let pts;
    try { pts = geo.curve(rep.args[3][0]); } catch { return null; }
    if (!pts || pts.length < 2) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!(L > 0)) return null;
    // every point on the chord: a polyline of collinear points is straight, an arc is not
    for (const p of pts) if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L > L * 1e-6) return null;
    return [dx / L, dy / L];
  }
  return null;
}

/**
 * The plan direction along a wall with no usable 'Axis': perpendicular to the
 * horizontal face normal its body is thinnest across (the takeoff's side
 * plane, computed.areas.side.n), or null.
 */
export function bodyDirection(row) {
  const n = row.computed?.areas?.side?.n;
  if (!Array.isArray(n) || !(Math.abs(n[2] ?? 0) < 1e-3)) return null;
  const L = Math.hypot(n[0], n[1]);
  return L > 0 ? [-n[1] / L, n[0] / L] : null;
}

// What each authoring tool's IFC export stores as a clipped wall's
// Qto_WallBaseQuantities Height, measured on the public models that store one
// (eval/wall-cut-top-heights-2026-11-22.md): ARCHICAD the clipped wall's
// highest point (its "Maximale Höhe der Wand"), Revit the unclipped extrusion
// depth. Other tools: not known, so nothing is offered.
const HEIGHT_CONVENTIONS = [
  [/archicad|graphisoft/i, "tallest"],
  [/revit/i, "extrusion"],
];

/**
 * The Height a wall's lines give (body units) and where it came from: an
 * unclipped wall's extrusion depth; a clipped one's only by its authoring
 * tool's convention ('tallest': the highest point, which is a faceted body's
 * own extent; 'extrusion' only while the body still holds one).
 * @returns {{height: number|null, heightFrom: string|null}}
 */
export function offeredHeight(w, clipped, convention) {
  if (!clipped) return { height: w.height, heightFrom: "body" };
  // a faceted body's faces are the clipped wall: its extent is its highest point
  if (convention === "tallest") return { height: w.faceted ? w.height : w.tallest, heightFrom: "tallest" };
  if (convention === "extrusion" && !w.faceted) return { height: w.height, heightFrom: "extrusion" };
  return { height: null, heightFrom: null };
}

/** The convention of the application an element's owner history names (or the file's only application), or null. */
export function heightConvention(model, e, cache = new Map()) {
  return toolConvention(model, e, HEIGHT_CONVENTIONS, cache);
}

/** The convention `table` gives the application an element's owner history names (or the file's only application), or null. */
export function toolConvention(model, e, table, cache = new Map()) {
  const E = model.entities;
  const appName = (a) => {
    if (!a || a.type !== "IFCAPPLICATION") return "";
    const dev = E.get(a.args[0]?.ref);
    return [a.args[2], a.args[3], dev?.args?.[1]].filter((x) => typeof x === "string").join(" ");
  };
  const ofApp = (a) => { const t = appName(a); for (const [re, c] of table) if (re.test(t)) return c; return null; };
  const oh = E.get(e?.args?.[1]?.ref);
  const own = oh && oh.type === "IFCOWNERHISTORY" ? E.get(oh.args[1]?.ref) : null;
  if (own) return ofApp(own);
  if (!cache.has("file")) {
    const all = new Set();
    for (const x of E.values()) if (x.type === "IFCAPPLICATION") all.add(ofApp(x));
    cache.set("file", all.size === 1 ? [...all][0] : null);
  }
  return cache.get("file");
}

/**
 * Adds computed.lines = {length, height} (SI) to each wall row whose
 * direction is known (a straight axis, or with no axis its body's side
 * faces: lines.from says which) and whose body reads as convex pieces
 * (extruded, or faceted with all its faces known; lines.faceted).
 * opts.asTerms (geom.mjs) reads faceted bodies; without it they are skipped.
 * opts.bodyDirection = false keeps to walls with an axis.
 */
export function addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms, bodyDirection: useBody = true }) {
  const units = readUnits(model);
  const geo = new Geometry(model, { angle: units.PLANEANGLEUNIT });
  const apps = new Map();
  let n = 0;
  for (const r of rows) {
    if (!WALL.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    const body = r.computed.solids?.body;
    const e = model.entities.get(r.id);
    if (!body || !e) continue;
    // the body's own z must be the world's up: the height is read along it
    const W = r.world;
    if (W && !(Math.abs(W[10]) > 0.999 * Math.hypot(W[2], W[6], W[10]))) continue;
    let dir = straightAxis(model, geo, e), from = "axis";
    if (!dir && useBody) { dir = bodyDirection(r); from = "body"; }
    if (!dir) continue;
    let w;
    try { w = wallLines(body, dir, polyPlanes, { asTerms }); } catch { w = null; }
    if (!w) continue;
    const f = r.lengthUnit ?? units.LENGTHUNIT;
    // A wall a roof or slab clips has two heights exporters disagree on (the
    // extrusion depth, Revit; the clipped tallest point, ARCHICAD): offer
    // neither, and leave it to the table. A faceted body has no extrusion
    // left, only its faces: its height is offered only when its top is
    // level along the whole wall, where the two readings are one figure.
    const clipped = Math.abs(w.height - w.tallest) > 0.005 * w.height || (w.faceted && !w.flatTop);
    // ...unless the authoring tool says which one its own export stores:
    // ARCHICAD the clipped tallest point, Revit the extrusion depth (which a
    // faceted body no longer holds). eval/wall-cut-top-heights-2026-11-22.md.
    const convention = clipped ? heightConvention(model, e, apps) : null;
    const { height, heightFrom } = offeredHeight(w, clipped, convention);
    r.computed.lines = { length: w.length * f, height: height == null ? null : height * f, extrusion: w.height * f, tallest: w.tallest * f, clipped, heightFrom, convention, from, faceted: w.faceted };
    n++;
  }
  return n;
}

// ---- a column's, beam's or member's length, from its body -------------------
//
// Qto_BeamBaseQuantities, Qto_ColumnBaseQuantities, Qto_MemberBaseQuantities
// and Qto_PileBaseQuantities define Length as "the total nominal length" of
// the element, along its axis. The takeoff already knows the axis (the
// extrusion direction, or a faceted body's prism axis: computed.areas.cross.n)
// and the section across it at mid-length. Two readings of the length follow:
// the body's extent along the axis, and its volume over that section, which
// for a prism cut by planes is the length of the line through the section's
// centroid. With square ends they are one figure, and every authoring tool's
// stored Length on the public models is that figure. With cut ends (a mitre,
// a sloped cut, a fitting) they part, and the tools part with them: ARCHICAD
// stores volume / section (16 of 17 on schependomlaan), Tekla the extent along
// the part's own axis, Revit no cut member here at all. So a cut member's
// Length is offered only by its tool's convention (eval/member-lengths-2026-11-22.md).
//
// Tekla's convention is 'box': the longest side of the body's smallest box
// whose faces are flush with its own faces (boxAxis). The takeoff's axis is
// right for a plain prism, but a Tekla brace drawn as a polygon outline
// (M3D-CON's 'DIA-2', a 250 mm slab of a diagonal) has its outline's faces
// lying along every direction in its plane, and the takeoff picked one 7 deg
// off the brace. The box follows the brace's long faces. A body whose volume
// over the box's mid section is longer than the box is not a straight prism
// (a downpipe with an offset bend, Mini Project's 'AFLOOP'): held back. So is
// one whose box is about as wide as it is long (a square base plate exported
// as a beam). eval/tekla-cut-members-2026-11-22.md.
//
// A body no longer along its axis than it is wide across it is not taken for
// a linear member: Tekla exports plates as IfcBeam ('PL6*60', its stored
// Length the plate's own 0.132 m, its extrusion the 0.060 m width), ARCHICAD
// a strip footing as a 0.5 m deep beam.

const LENGTH_CONVENTIONS = [
  [/archicad|graphisoft/i, "centroid"],
  [/tekla/i, "box"],
];

const MAX_BOX_NORMALS = 200;
const BOX_FIRST = 6;

/**
 * The smallest box around a body among the frames set by two of its own face
 * normals: one of its largest faces' normals (the BOX_FIRST largest planes by
 * area), and a second normal turned square to it. A cut prism's box is flush
 * with its side faces whatever its ends do. null when the body has no faces
 * to read or more than maxNormals distinct face directions.
 * @returns {{n: number[], axes: number[][], dims: number[]} | null} n the longest side's direction; axes all three, dims in body units, both longest first
 */
export function boxAxis(body, solidExtent, maxNormals = MAX_BOX_NORMALS) {
  const loops = [];
  for (const t of body.terms || []) loops.push(...t.faces);
  for (const sh of body.shells || []) loops.push(...sh.loops);
  if (!loops.length) return null;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // face directions with their area, a face and its opposite as one
  const ns = [];
  for (const l of loops) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i], q = l[(i + 1) % l.length];
      x += (p[1] - q[1]) * (p[2] + q[2]); y += (p[2] - q[2]) * (p[0] + q[0]); z += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const L = Math.hypot(x, y, z);
    if (!(L > 0)) continue;
    const u = [x / L, y / L, z / L];
    const m = ns.find((e) => Math.abs(dot(e.u, u)) > 1 - 1e-9);
    if (m) m.A += L / 2;
    else { ns.push({ u, A: L / 2 }); if (ns.length > maxNormals) return null; }
  }
  if (ns.length < 2) return null;
  const firsts = [...ns].sort((p, q) => q.A - p.A).slice(0, BOX_FIRST);
  const ext = (d) => { const [lo, hi] = solidExtent(body, d); return hi - lo; };
  let best = null;
  for (const { u: a } of firsts) {
    const ea = ext(a), seen = [];
    for (const { u: m } of ns) {
      let b = cross(a, m);
      const L = Math.hypot(...b);
      if (L < 1e-9) continue;
      b = b.map((x) => x / L);
      if (seen.some((e) => Math.abs(dot(e, b)) > 1 - 1e-9)) continue;
      seen.push(b);
      const c = cross(a, b), V = ea * ext(b) * ext(c);
      if (!best || V < best.V * (1 - 1e-9)) best = { V, axes: [a, b, c], ex: [ea, ext(b), ext(c)] };
    }
  }
  if (!best) return null;
  const o = [0, 1, 2].sort((p, q) => best.ex[q] - best.ex[p]);
  return { n: best.axes[o[0]], axes: o.map((k) => best.axes[k]), dims: o.map((k) => best.ex[k]) };
}

/**
 * How far the section through the middle of the box reaches across it, as a
 * share of the box's two widths: where the body's face edges cross the
 * mid plane. A straight prism's section spans its box however its ends are
 * cut (openings and recesses inside it included); a bent one's (a downpipe
 * with an offset) covers a part of it.
 */
export function midSpan(body, box, solidExtent) {
  const [n, b, c] = box.axes;
  const dot = (a, q) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2];
  const [lo, hi] = solidExtent(body, n);
  const at = (lo + hi) / 2 + (hi - lo) * 1e-7;
  let b0 = Infinity, b1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  const scan = (loops) => {
    for (const f of loops) for (let i = 0; i < f.length; i++) {
      const p = f[i], q = f[(i + 1) % f.length], dp = dot(n, p) - at, dq = dot(n, q) - at;
      if ((dp < 0) === (dq < 0)) continue;
      const t = dp / (dp - dq), x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const u = dot(b, x), v = dot(c, x);
      if (u < b0) b0 = u; if (u > b1) b1 = u; if (v < c0) c0 = v; if (v > c1) c1 = v;
    }
  };
  for (const t of body.terms || []) scan(t.faces);
  for (const sh of body.shells || []) scan(sh.loops);
  if (!(b1 > b0) || !(c1 > c0)) return null;
  return [(b1 - b0) / box.dims[1], (c1 - c0) / box.dims[2]];
}

const MID_SPAN = 0.9;

/**
 * A cut member's Length by Tekla's convention: the extent along boxAxis, or
 * null when the box is not clearly longer than wide (5%) or the section at
 * its middle spans less than 90% of either width (not a straight prism).
 */
export function boxLength(row, solidExtent) {
  const body = row.computed?.solids?.body;
  if (!body) return null;
  const box = boxAxis(body, solidExtent);
  if (!box) return null;
  const f = row.lengthUnit ?? 1;
  const length = box.dims[0] * f;
  const span = midSpan(body, box, solidExtent);
  const linear = box.dims[0] > 1.05 * box.dims[1];
  const straight = span != null && span[0] >= MID_SPAN && span[1] >= MID_SPAN;
  return { length: linear && straight ? length : null, box: length, span, widths: [box.dims[1] * f, box.dims[2] * f], linear, straight };
}

const SQUARE_TOL = 0.005;

/** The body's largest extent across direction n (12 directions in the plane normal to n), in body units. */
export function widthAcross(body, n, solidExtent) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  // u = a x n normalised, w = n x u
  let u = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const L = Math.hypot(...u);
  u = u.map((x) => x / L);
  const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  let D = 0;
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 12, c = Math.cos(t), s = Math.sin(t);
    const d = [c * u[0] + s * w[0], c * u[1] + s * w[1], c * u[2] + s * w[2]];
    const [lo, hi] = solidExtent(body, d);
    if (hi - lo > D) D = hi - lo;
  }
  return D;
}

/**
 * A linear member's two length readings (SI) and which one is offered.
 * @param {{computed: object, lengthUnit?: number}} row a takeoff row with computed.areas.cross
 * @param {Function} solidExtent geom.mjs
 * @param {string|null} convention the authoring tool's, for cut ends ('centroid', 'extent' or 'box')
 * @returns {{length: number|null, extent: number, centroid: number, width: number, square: boolean, lengthFrom: string|null} | null}
 */
export function memberLength(row, solidExtent, convention = null) {
  const c = row.computed?.areas?.cross, body = row.computed?.solids?.body;
  if (!c?.n || !body || !(c.gross > 0) || !(row.computed.gross > 0)) return null;
  const f = row.lengthUnit ?? 1;
  const [lo, hi] = solidExtent(body, c.n);
  const extent = (hi - lo) * f;
  const centroid = row.computed.gross / c.gross;
  const width = widthAcross(body, c.n, solidExtent) * f;
  if (!(extent > 0) || !(width > 0)) return null;
  const square = Math.abs(extent - centroid) <= SQUARE_TOL * extent;
  let length = null, lengthFrom = null;
  if (extent <= width) lengthFrom = null; // a plate or a footing, not a linear member
  else if (square) { length = extent; lengthFrom = "square"; }
  else if (convention === "centroid") { length = centroid; lengthFrom = "centroid"; }
  else if (convention === "extent") { length = extent; lengthFrom = "extent"; }
  else if (convention === "box") {
    const b = boxLength(row, solidExtent);
    if (b?.length != null) { length = b.length; lengthFrom = "box"; }
  }
  return { length, extent, centroid, width, square, lengthFrom };
}

/**
 * Adds computed.lines = {length} (SI) to each column, beam, member and pile
 * row memberLength offers one for. Returns how many.
 */
export function addMemberLines(model, rows, { solidExtent }) {
  const apps = new Map();
  let n = 0;
  for (const r of rows) {
    if (!CROSS.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    let m;
    try {
      m = memberLength(r, solidExtent, null);
      if (m && !m.square && m.extent > m.width) m = memberLength(r, solidExtent, toolConvention(model, model.entities.get(r.id), LENGTH_CONVENTIONS, apps));
    } catch { m = null; }
    try {
      const sf = memberSurface(r, solidExtent, toolConvention(model, model.entities.get(r.id), SURFACE_CONVENTIONS, apps));
      if (sf) r.computed.surface = sf;
    } catch { /* no surface reading */ }
    if (!m || m.length == null) continue;
    r.computed.lines = { length: m.length, height: null, lengthFrom: m.lengthFrom, extent: m.extent, centroid: m.centroid, width: m.width };
    n++;
  }
  return n;
}

// ---- a column's, beam's or member's surface areas -------------------------
//
// Qto_BeamBaseQuantities, Qto_ColumnBaseQuantities, Qto_MemberBaseQuantities
// and Qto_PileBaseQuantities: OuterSurfaceArea is "the total area of the
// extruded surfaces ... not taking into account the end cap areas", normally
// perimeter x length; GrossSurfaceArea "the total area ... normally generated
// as perimeter * length + 2 * cross section area". Coating, fire protection
// and galvanising are priced off them. Both are read only on a straight
// member with square ends (memberLength's 'square': extent = volume / section),
// where they are one figure whichever way they are measured:
//   - an extruded body (signed convex pieces): the section's outline at
//     mid-length (sectionPerimeter, a hollow section's inside included) times
//     the length;
//   - a faceted body: the area of the faces whose normal is square to the
//     axis, accepted only when the faces left over are the two end caps
//     (their area within 1% of twice the section).
// What the exporters store (eval/member-surfaces-2026-11-22.md, the public
// exports with either figure):
//   - ARCHICAD: Outer the side faces, Gross the side faces and both ends;
//   - Revit: Outer the side faces (one file, ARK_NUS, written in mm2 under an
//     m2 unit), Gross the same side-face figure again, so no Gross is offered;
//   - Tekla: both the total area, ends included, against the Outer definition;
//     on a hollow section (a tube) the outside faces alone, bore and ends left
//     out. ARCHICAD's and Revit's tube figures are not known: held back.
// For other tools the Gross figure (ARCHICAD and Tekla agree with the
// definition) is offered, and Outer only where the ends are under 2% of the
// total, so the two conventions are one figure.

const SURFACE_CONVENTIONS = [
  [/archicad|graphisoft/i, { outer: "side", gross: "total" }],
  [/revit/i, { outer: "side", gross: null }],
  [/tekla/i, { outer: "total", gross: "total", hollow: "outside" }],
];
const OTHER_SURFACE = { outer: null, gross: "total" };
const END_CAPS_TOL = 0.01;
const SMALL_ENDS = 0.02;

/** Area of a planar polygon loop (Newell's normal) and its unit normal. */
function loopArea(l) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    x += (p[1] - q[1]) * (p[2] + q[2]); y += (p[2] - q[2]) * (p[0] + q[0]); z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const L = Math.hypot(x, y, z);
  return L > 0 ? { area: L / 2, n: [x / L, y / L, z / L] } : null;
}

/**
 * A linear member's side-face and total surface areas (SI m2), and which
 * figures are offered as OuterSurfaceArea and GrossSurfaceArea.
 * @param {{computed: object, lengthUnit?: number}} row a takeoff row with computed.areas.cross
 * @param {Function} solidExtent geom.mjs
 * @param {{outer: string|null, gross: string|null}|null} convention SURFACE_CONVENTIONS' entry for the authoring tool, null for another tool
 * @returns {{outer: number|null, gross: number|null, side: number, total: number, from: string} | null}
 */
export function memberSurface(row, solidExtent, convention = null) {
  const c = row.computed?.areas?.cross, body = row.computed?.solids?.body;
  const m = memberLength(row, solidExtent);
  if (!m || !m.square || !(m.extent > m.width) || !c?.n || !(c.gross > 0)) return null;
  const f = row.lengthUnit ?? 1;
  let side, from, hollow = false, outside = null;
  if (body.shells?.length) {
    let lat = 0, all = 0;
    for (const sh of body.shells) for (const l of sh.loops) {
      const a = loopArea(l);
      if (!a) continue;
      all += a.area;
      if (Math.abs(a.n[0] * c.n[0] + a.n[1] * c.n[1] + a.n[2] * c.n[2]) < 1e-3) lat += a.area;
    }
    lat *= f * f; all *= f * f;
    if (!(lat > 0) || Math.abs(all - lat - 2 * c.gross) > END_CAPS_TOL * all) return null;
    side = lat; from = "faces";
  } else {
    const [lo, hi] = solidExtent(body, c.n);
    const k = (lo + hi) / 2 + (hi - lo) * 1e-7;
    const P = sectionPerimeter(body, c.n, k);
    if (P == null || !(P > 0)) return null;
    side = P * f * m.extent; from = "outline";
    // a hollow section (a tube): the outline less its inside
    const inner = innerTerms(body, c.n, k);
    if (inner.size) {
      const Po = sectionPerimeter({ ...body, terms: body.terms.filter((t) => !inner.has(t)) }, c.n, k);
      if (Po != null && Po > 0 && Po < P) { hollow = true; outside = Po * f * m.extent; }
    }
  }
  const total = side + 2 * c.gross;
  const conv = convention || OTHER_SURFACE;
  let outer, gross;
  if (hollow) {
    // only Tekla's figure is known: the outside faces alone
    // (Mini Project's lifting eyes and tubes); ARCHICAD's and Revit's not
    const t = conv.hollow === "outside" ? outside : null;
    outer = t; gross = t;
  } else {
    const pick = (x) => (x === "side" ? side : x === "total" ? total : null);
    outer = pick(conv.outer);
    gross = pick(conv.gross);
    if (outer == null && !convention && 2 * c.gross <= SMALL_ENDS * total) outer = side;
  }
  return { outer, gross, side, total, from, hollow, outside };
}

/**
 * The negative pieces of a body whose section at n.x = k lies wholly inside
 * one positive piece's section, touching none of its edges: a tube's bore,
 * not a notch cut from the outline.
 * @returns {Set<object>} the body's terms that are such insides
 */
export function innerTerms(s, n0, k) {
  const out = new Set();
  if (!s?.terms?.length) return out;
  const n = v3.unit(n0);
  const u = v3.unit(Math.abs(n[0]) < 0.9 ? v3.cross(n, [1, 0, 0]) : v3.cross(n, [0, 1, 0]));
  const v = v3.cross(n, u);
  const secs = s.terms.map((t) => ({ t, P: convexSection(t.faces, n, k, u, v) })).filter((x) => x.P);
  let span = 0;
  for (const { P } of secs) for (const p of P) span = Math.max(span, Math.abs(p[0]), Math.abs(p[1]));
  const tol = 1e-6 * (span + 1);
  // signed distance of q inside convex counter-clockwise polygon P's edge i
  const inside = (P, q) => P.every((a, i) => {
    const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return L <= tol || ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L > tol;
  });
  for (const x of secs) {
    if (x.t.s >= 0) continue;
    if (secs.some((y) => y.t.s > 0 && x.P.every((q) => inside(y.P, q)))) out.add(x.t);
  }
  return out;
}

// ---- a slab's thickness and perimeter ---------------------------------------
//
// Qto_SlabBaseQuantities: Width is "the total thickness of the slab",
// Perimeter "the perimeter of the slab's extruded profile". The thickness is
// the body's extent along the direction its plan area is cut across (the
// extrusion); the perimeter is the outline of that cut at mid-thickness. The
// takeoff holds a body as a signed sum of convex pieces (a notch is a negative
// piece), so each piece's section is a convex polygon, and the outline is
// where the pieces' signed edges do not cancel: along each line, an edge
// counts +1 or -1 by the side its piece lies on and its sign, and only the
// stretches whose count is not zero are outline. A faceted body (no convex
// pieces) gives no perimeter.
//
// What the exporters store (eval/slab-width-perimeter-2026-11-22.md, eleven
// public exports):
//   - Width: on an extruded body the extrusion's depth is the stored figure
//     259 of 259 times (Revit, ARCHICAD and Tekla). A faceted body's thinnest
//     extent is right 158 of 221 (Tekla's '533*193' grout strips store the
//     profile's 0.533 m, ARCHICAD's sloped 'sporenkap' a vertical 0.195 m),
//     so a faceted slab is offered no Width.
//   - Perimeter, a slab no opening cuts: the outline, every tool.
//   - With openings, ARCHICAD adds the openings' outlines (the net section's
//     outline, 7 of 7) and Revit mostly does not (the gross outline, 40 of
//     42; two ARK_NUS floors store the net one, nothing in the file tells
//     them apart). Other tools' figure is not known, so none is offered.

const SLAB_CONVENTIONS = [
  [/archicad|graphisoft/i, "net"],
  [/revit/i, "gross"],
];

const v3 = {
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  unit: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; },
};

/** The convex polygon (in-plane u, v coordinates, counter-clockwise about n) the plane n.x = k cuts from a convex polyhedron, or null. */
export function convexSection(faces, n, k, u, v) {
  let scale = 0;
  for (const f of faces) for (const p of f) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  const eps = 1e-9 * (scale + Math.abs(k) + 1), tol = eps * 10;
  const pts = [];
  const add = (p) => {
    const q = [v3.dot(p, u), v3.dot(p, v)];
    if (!pts.some((r) => Math.abs(r[0] - q[0]) <= tol && Math.abs(r[1] - q[1]) <= tol)) pts.push(q);
  };
  let above = false, below = false;
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const da = v3.dot(n, a) - k, db = v3.dot(n, b) - k;
      if (da > eps) above = true; else if (da < -eps) below = true;
      if (Math.abs(da) <= eps) add(a);
      else if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
        const t = da / (da - db);
        add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
  }
  if (!above || !below || pts.length < 3) return null;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  return pts;
}

/**
 * Outline length of the section of a solid (signed convex terms) by the plane
 * n.x = k, in body units; null for a faceted body or an empty section.
 */
export function sectionPerimeter(s, n0, k) {
  if (!s || s.mesh || s.shells?.length || !s.terms?.length) return null;
  const n = v3.unit(n0);
  if (!n) return null;
  const u = v3.unit(Math.abs(n[0]) < 0.9 ? v3.cross(n, [1, 0, 0]) : v3.cross(n, [0, 1, 0]));
  const v = v3.cross(n, u);
  const edges = [];
  let span = 0;
  for (const t of s.terms) {
    const P = convexSection(t.faces, n, k, u, v);
    if (!P) continue;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      edges.push([a, b, t.s]);
      span = Math.max(span, Math.abs(a[0]), Math.abs(a[1]));
    }
  }
  if (!edges.length) return null;
  const tol = 1e-6 * (span + 1);
  // edges grouped by the line they lie on; each kept as an interval along
  // the line's own direction, +-1 by which way it runs and its piece's sign
  const lines = [];
  for (const [a, b, sg] of edges) {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L <= tol) continue;
    dx /= L; dy /= L;
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
    const off = -dy * a[0] + dx * a[1];
    let g = null;
    for (const x of lines) {
      if (Math.abs(x.off - off) > tol) continue;
      // both ends on the line, not just a near-equal direction
      if (Math.abs(-x.dy * a[0] + x.dx * a[1] - x.off) <= tol && Math.abs(-x.dy * b[0] + x.dx * b[1] - x.off) <= tol) { g = x; break; }
    }
    if (!g) lines.push((g = { dx, dy, off, iv: [] }));
    const p = g.dx * a[0] + g.dy * a[1], q = g.dx * b[0] + g.dy * b[1];
    g.iv.push([Math.min(p, q), Math.max(p, q), q > p ? sg : -sg]);
  }
  let per = 0;
  for (const g of lines) {
    const ev = [];
    for (const [lo, hi, w] of g.iv) ev.push([lo, w], [hi, -w]);
    ev.sort((x, y) => x[0] - y[0]);
    let w = 0, last = null;
    for (const [x, d] of ev) {
      if (last != null && Math.abs(w) > 0.5) per += x - last;
      w += d;
      last = x;
    }
  }
  return per;
}

/**
 * A slab's thickness and outline readings (SI) and which are offered.
 * @param {{computed: object, lengthUnit?: number}} row a takeoff row with computed.areas.plan
 * @param {Function} solidExtent geom.mjs
 * @param {string|null} convention the authoring tool's outline with openings ('net', 'gross' or null)
 * @returns {{width: number|null, perimeter: number|null, thickness: number, extruded: boolean, gross: number|null, net: number|null, openings: boolean} | null}
 */
export function slabLines(row, solidExtent, convention = null) {
  const P = row.computed?.areas?.plan, body = row.computed?.solids?.body;
  if (!P?.n || !body) return null;
  const f = row.lengthUnit ?? 1;
  const [lo, hi] = solidExtent(body, P.n);
  if (!(hi > lo)) return null;
  const thickness = (hi - lo) * f;
  const k = lo + (hi - lo) * 0.5 + (hi - lo) * 1e-7;
  const g = sectionPerimeter(body, P.n, k);
  const net = row.computed.solids.net;
  const hasNet = !!net && net !== body;
  const nt = hasNet ? sectionPerimeter(net, P.n, k) : g;
  const gross = g == null ? null : g * f, netP = nt == null ? null : nt * f;
  // openings that change the outline (an opening wholly above or below the
  // middle, or none at all, leaves it as it is)
  const openings = hasNet && (gross == null || netP == null || Math.abs(netP - gross) > 1e-6 * gross);
  let perimeter = null;
  if (!openings || convention === "gross") perimeter = gross;
  else if (convention === "net") perimeter = netP;
  const extruded = !!body.axis && !body.shells?.length;
  return { width: extruded ? thickness : null, perimeter, thickness, extruded, gross, net: netP, openings };
}

/**
 * Adds computed.slab = {width, perimeter} (SI) to each slab row whose plan
 * cut is known. Returns how many rows got one.
 */
export function addSlabLines(model, rows, { solidExtent }) {
  const apps = new Map();
  let n = 0;
  for (const r of rows) {
    if (!SLAB.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    let m;
    try { m = slabLines(r, solidExtent, toolConvention(model, model.entities.get(r.id), SLAB_CONVENTIONS, apps)); } catch { m = null; }
    if (!m) continue;
    r.computed.slab = m;
    n++;
  }
  return n;
}

// ---- a door's or window's width, height, area and perimeter ----------------
//
// Qto_DoorBaseQuantities and Qto_WindowBaseQuantities: Width and Height are
// the door's (window's) overall width and height, Area its total area and
// Perimeter its total perimeter. They are read from the opening the element
// fills (IfcRelFillsElement), taken into the element's own placement, where
// x is the width and z the height as for OverallWidth and OverallHeight: its
// extent along x and z, and its section across y (the wall's thickness). The
// opening, not the element's attributes or body, because that is what the
// exporters measured (eval/door-window-quantities-2026-11-22.md): a Revit
// window's OverallHeight is its frame's 1.365 m where Width/Height/Area store
// the opening's 1.35 m, and a Revit door's body includes its casing.
//
// What each tool stores, measured on the public models that store the sets:
//   ARCHICAD   Width, Height: the opening's; Area: the opening's own section
//              (a round window's pi/4 m2, not 1 m2); Perimeter: 2 (W + H),
//              the bounding rectangle's, round windows included. Offered.
//   Revit      not the opening: the family's own Width and Height
//              parameters, which the export carries as properties
//              (revitSizeLines below). Offered from those.
//   others     no public export stores the sets to compare. Not offered.
// An opening several elements fill (a window assembly) offers nothing, nor
// one whose width or height is more than 1% off the element's own
// OverallWidth/OverallHeight (schependomlaan's 'merk J' windows: 0.9 x 1.5 m,
// in a 1.53 x 2.637 m opening, storing a 0.30 m Width).

const OPENING_CONVENTIONS = [
  [/archicad|graphisoft/i, "archicad"],
];

/**
 * A door's or window's readings from its opening (SI) and which are offered.
 * @param {object} opening the filled opening's solid in the element's placement frame (body units)
 * @param {number} f the length unit in metres
 * @param {string|null} convention 'archicad' or null (OPENING_CONVENTIONS)
 * @param {{width?: number|null, height?: number|null}} overall the element's OverallWidth/OverallHeight (SI), when set
 * @param {{solidExtent: Function, sectionArea: Function}} geom geom.mjs
 * @returns {{width: number|null, height: number|null, area: number|null, perimeter: number|null, openWidth: number, openHeight: number, section: number|null} | null}
 */
export function openingLines(opening, f, convention, overall, { solidExtent, sectionArea }) {
  const [x0, x1] = solidExtent(opening, [1, 0, 0]);
  const [z0, z1] = solidExtent(opening, [0, 0, 1]);
  if (!(x1 > x0) || !(z1 > z0) || !Number.isFinite(x1 - x0) || !Number.isFinite(z1 - z0)) return null;
  const W = (x1 - x0) * f, H = (z1 - z0) * f;
  let section = null;
  try { const a = sectionArea(opening, [0, 1, 0]); if (a > 0) section = a * f * f; } catch { section = null; }
  const off = (a, b) => a > 0 && Math.abs(a - b) > 0.01 * a;
  const agrees = !off(overall?.width, W) && !off(overall?.height, H);
  const out = { width: null, height: null, area: null, perimeter: null, openWidth: W, openHeight: H, section, convention, agrees };
  if (convention === "archicad" && agrees) {
    out.width = W; out.height = H;
    out.area = section;
    out.perimeter = 2 * (W + H);
  }
  return out;
}

/**
 * Adds computed.opening (SI) to each door and window row that fills an
 * opening with a readable body. Returns how many rows got one.
 */
export function addOpeningLines(model, rows, { Geometry, readUnits, solidExtent, sectionArea, mul, invert, transformSolid, asTerms }) {
  const E = model.entities;
  const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
  const fills = new Map();
  const filledBy = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELFILLSELEMENT") continue;
    const op = ref(e.args[4]), el = ref(e.args[5]);
    fills.set(el, op);
    filledBy.set(op, (filledBy.get(op) || 0) + 1);
  }
  let geo = null;
  const apps = new Map();
  let n = 0;
  for (const r of rows) {
    if (!OPENING.test(r.ifcType) || !r.computed || r.computed.status !== "ok") continue;
    const e = E.get(r.id), o = E.get(fills.get(r.id));
    if (!e || !o || filledBy.get(o.id) !== 1) continue;
    try {
      if (!geo) geo = new Geometry(model, { angle: readUnits(model).PLANEANGLEUNIT });
      const shape = E.get(ref(o.args[6]));
      const reps = Array.isArray(shape?.args?.[2]) ? shape.args[2].map(ref) : [];
      const label = (id) => { const x = E.get(id)?.args?.[1]; return typeof x === "string" ? x : x?.value; };
      const rid = reps.find((id) => label(id) === "Body") ?? reps[0];
      if (rid == null) continue;
      const body = geo.representation(rid);
      if (!body || body.error) continue;
      const solid = asTerms(body) ?? body;
      const W = geo.objectPlacement(ref(e.args[5])), Wo = geo.objectPlacement(ref(o.args[5]));
      const inElem = transformSolid(solid, mul(invert(W), Wo));
      const f = r.lengthUnit ?? readUnits(model).LENGTHUNIT;
      const num = (v) => (typeof v === "number" ? v : typeof v?.value === "number" ? v.value : null);
      const overall = { width: num(e.args[9]) > 0 ? num(e.args[9]) * f : null, height: num(e.args[8]) > 0 ? num(e.args[8]) * f : null };
      const m = openingLines(inElem, f, toolConvention(model, e, OPENING_CONVENTIONS, apps), overall, { solidExtent, sectionArea });
      if (!m) continue;
      r.computed.opening = m;
      n++;
    } catch { /* an unread opening offers nothing */ }
  }
  return n;
}

// ---- a Revit door's or window's size, from the parameters it exports -------
//
// The Revit IFC exporter (github.com/Autodesk/revit-ifc, WidthCalculator,
// HeightCalculator, AreaCalculator) writes a door's and window's Width and
// Height from the family's Width and Height parameters (DOOR_WIDTH,
// DOOR_HEIGHT; the instance's if it has them, else the type's) and Area as
// their product, the same since 2018. Its default export also writes those
// parameters as properties, in the group's set ("Dimensions",
// "Dimensions(Type)", 2010's "PSet_Revit_Dimensions" and
// "PSet_Revit_Type_Dimensions"; German "Bemaßungen"), on the element or its
// type. Read them back the same way (eval/revit-door-window-quantities-2026-11-22.md):
// Width and Height equal the stored figures on 566 of 566 Revit 2019 and 99
// of 99 Revit 2022 doors and windows, 129 of 133 Revit 2010 doors; Area = W x
// H on 99 of 99 Revit 2022 ones. Area only in IFC4 and later files: the
// exporter writes Qto_DoorBaseQuantities and Qto_WindowBaseQuantities (its
// W x H) only there, and an IFC2x3 export's "BaseQuantities" Area is not W x
// H (Revit 2019, 0 of 576). Perimeter is the body's outer outline in the
// exporter: not offered.

const REVIT_CONVENTIONS = [[/revit/i, "revit"]];
const REVIT_DIM_SET = /^(PSet_Revit_(Type_)?)?(Dimensions|Bema\u00dfungen|Abmessungen)( ?\(Type\))?$/i;
const REVIT_WIDTH = new Set(["width", "breite"]);
const REVIT_HEIGHT = new Set(["height", "h\u00f6he"]);

/**
 * A Revit door's or window's Width, Height and Area (SI) from the size
 * parameters on the element's and its type's property sets, or null.
 * @param {Array<{set: string, name: string, value: number, own: boolean}>} props length-typed properties in model units; own: on the element itself (not its type object)
 * @param {number} f the length unit in metres
 * @param {{area?: boolean}} opts area: false offers Width and Height only (an IFC2x3 file)
 */
export function revitSizeLines(props, f, { area = true } = {}) {
  const typeSet = (s) => /type/i.test(s);
  // the instance's own parameters, then type parameters (on the element, as
  // 2010 wrote them, or on the type object), as the exporter looks them up
  const rank = (p) => (p.own && !typeSet(p.set) ? 0 : p.own ? 1 : 2);
  const pick = (names) => {
    let best = null;
    for (const p of props) {
      if (!REVIT_DIM_SET.test(p.set) || !names.has(p.name.toLowerCase()) || !(p.value > 0)) continue;
      if (!best || rank(p) < rank(best)) best = p;
    }
    return best ? best.value * f : null;
  };
  const width = pick(REVIT_WIDTH), height = pick(REVIT_HEIGHT);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height, area: area ? width * height : null };
}

/**
 * Adds computed.revitSize = {width, height, area} (SI) to each Revit door
 * and window row whose exported size parameters read (revitSizeLines).
 * Returns how many rows got one.
 */
export function addRevitSizeLines(model, rows, { readUnits }) {
  const E = model.entities;
  const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
  const str = (v) => (typeof v === "string" ? v : typeof v?.value === "string" ? v.value : null);
  const doors = rows.filter((r) => OPENING.test(r.ifcType) && r.computed && r.computed.status === "ok");
  if (!doors.length) return 0;
  const apps = new Map();
  const want = new Set(doors.map((r) => r.id));
  if (!doors.some((r) => toolConvention(model, E.get(r.id), REVIT_CONVENTIONS, apps) === "revit")) return 0;
  const setsOf = new Map(), typeOf = new Map();
  const add = (o, p) => { if (!setsOf.has(o)) setsOf.set(o, []); setsOf.get(o).push(p); };
  for (const e of E.values()) {
    if (e.type === "IFCRELDEFINESBYPROPERTIES") for (const o of e.args[4] || []) add(ref(o), ref(e.args[5]));
    else if (e.type === "IFCRELDEFINESBYTYPE") for (const o of e.args[4] || []) if (want.has(ref(o))) typeOf.set(ref(o), ref(e.args[5]));
  }
  const lengths = (ids, own, out) => {
    for (const pid of ids) {
      const ps = E.get(pid);
      if (ps?.type !== "IFCPROPERTYSET") continue;
      const set = str(ps.args[2]) ?? "";
      if (!REVIT_DIM_SET.test(set)) continue;
      for (const x of ps.args[4] || []) {
        const p = E.get(ref(x));
        const v = p?.type === "IFCPROPERTYSINGLEVALUE" ? p.args[2] : null;
        if (!v || typeof v.value !== "number" || !/LENGTHMEASURE$/.test(v.typed || "")) continue;
        out.push({ set, name: str(p.args[0]) ?? "", value: v.value, own });
      }
    }
  };
  let n = 0;
  for (const r of doors) {
    const e = E.get(r.id);
    if (toolConvention(model, e, REVIT_CONVENTIONS, apps) !== "revit") continue;
    const props = [];
    lengths(setsOf.get(r.id) || [], true, props);
    const t = E.get(typeOf.get(r.id));
    if (t) {
      lengths(setsOf.get(t.id) || [], false, props);
      if (Array.isArray(t.args[5])) lengths(t.args[5].map(ref), false, props);
    }
    const m = revitSizeLines(props, r.lengthUnit ?? readUnits(model).LENGTHUNIT, { area: !/^IFC2X/.test(model.schema || "") });
    if (!m) continue;
    r.computed.revitSize = m;
    n++;
  }
  return n;
}

// ---- a space's quantities, from ifc-quantity-takeoff's room reading --------
//
// takeoff() already measures every IfcSpace (rooms.mjs roomGeometry): the
// floor area and perimeter cut 1 cm above the solid's lowest point, its
// height lowest to highest, its volume. Which Qto_SpaceBaseQuantities names
// those stand for, measured against 1,000+ stored figures in 8 public
// exports (eval/space-quantities-2026-11-22.md):
//   GrossFloorArea, GrossPerimeter  every space read (530 of 532, 466 of 468)
//   NetFloorArea      Revit only: a Revit room already stops at columns and
//                     finishes, so its net area is the solid's (332 of 334);
//                     ARCHICAD takes a per-room reduction off (0.97 on the
//                     FZK-Haus) the solid does not show
//   Height            only a constant-height space (the solid holds its floor
//                     area times its height: the Qto_ definition gives Height
//                     "only if the space has a constant height") whose top is
//                     not a ceiling's underside: a Revit room stops at a
//                     lowered ceiling while its stored Height is the nominal
//                     one above it (29 of ARK_NUS's 30 misses)
//   FinishCeilingHeight, GrossCeilingArea
//                     a constant-height space: its top is the finished
//                     ceiling, its area the floor's (191 of 191, 196 of 196)
//   NetVolume         a space with a body (one drawn only as an outline and a
//                     box holds more than a room under a sloped roof)
//   GrossVolume       where Height is offered, with a body: exporters store
//                     the floor area times the nominal height (ARCHICAD under
//                     a sloped roof, about twice the solid; Revit over a
//                     lowered ceiling), which only then is the solid's
// Not offered: NetPerimeter (the definition takes door openings off),
// NetCeilingArea, Gross/NetWallArea (exporters' figures agree with nothing
// measured here), FinishFloorHeight.

const SPACE_CONVENTIONS = [[/revit/i, "revit"]];

/** A ceiling covering's underside at the top of a room, overlapping its plan (boxes in m). */
function ceilingAtTop(room, ceilings, tol = 0.03) {
  const b = room.box;
  return ceilings.some((q) => Math.min(b[3], q[3]) - Math.max(b[0], q[0]) > 0.05 && Math.min(b[4], q[4]) - Math.max(b[1], q[1]) > 0.05 && Math.abs(q[2] - b[5]) <= tol);
}

/**
 * The Qto_SpaceBaseQuantities one room's reading gives.
 * @param {{computed: object|null, from: string, box?: number[]}} room a takeoff() room
 * @param {{tool?: string|null, ceilingAtTop?: boolean}} [ctx]
 * @returns {Map<string, {value: number, kind: string}>}
 */
export function spaceLines(room, ctx = {}) {
  const m = new Map();
  const c = room.computed;
  if (!c) return m;
  const put = (name, kind, v) => { if (usable(v)) m.set(name, { value: v, kind }); };
  const constant = usable(c.floorArea) && usable(c.height) && Math.abs(c.volume - c.floorArea * c.height) <= 0.02 * c.volume;
  put("GrossFloorArea", "area", c.floorArea);
  if (ctx.tool === "revit") put("NetFloorArea", "area", c.floorArea);
  put("GrossPerimeter", "length", c.perimeter);
  if (constant) {
    if (!ctx.ceilingAtTop) put("Height", "length", c.height);
    put("FinishCeilingHeight", "length", c.height);
    put("GrossCeilingArea", "area", c.floorArea);
  }
  if (room.from === "body") {
    if (constant && !ctx.ceilingAtTop) put("GrossVolume", "volume", c.volume);
    put("NetVolume", "volume", c.volume);
  }
  return m;
}

/**
 * Adds each measured room's quantities to `out` (STEP id -> name -> value).
 * @param {object} model parseStep's model (for each space's authoring tool)
 * @param {Array} rooms takeoff().rooms
 * @param {Array} rows takeoff().rows (for the ceilings)
 */
export function addSpaceQuantities(out, model, rooms, rows) {
  const ceilings = rows.filter((r) => /^IFCCOVERING/.test(r.ifcType) && r.predefinedType === "CEILING" && Array.isArray(r.box)).map((r) => r.box);
  const apps = new Map();
  for (const room of rooms || []) {
    if (!room.computed) continue;
    const ctx = {
      tool: toolConvention(model, model.entities.get(room.id), SPACE_CONVENTIONS, apps),
      ceilingAtTop: Array.isArray(room.box) && ceilingAtTop(room, ceilings),
    };
    const m = spaceLines(room, ctx);
    if (m.size) out.set(room.id, m);
  }
  return out;
}

/**
 * The model fill's opts.geometry: (element, quantity name, quantity class)
 * -> SI value or undefined.
 */
export function geometryLookup(byId) {
  return (e, name, qclass) => {
    const m = byId.get(e.id);
    const q = m && m.get(name);
    return q && Object.hasOwn(KIND_CLASS, q.kind) && KIND_CLASS[q.kind] === qclass ? q.value : undefined;
  };
}

/**
 * Loads ifc-quantity-takeoff (the sibling folder, in the monorepo and on the
 * site alike, or the URL given) and measures the model. Node or a worker.
 * @param {string|Uint8Array} ifcText the .ifc file's text or bytes
 * @param {{dir?: string|URL}} opts dir: ifc-quantity-takeoff's folder
 */
export async function measureModel(ifcText, opts = {}) {
  const base = opts.dir ? new URL(String(opts.dir).replace(/\/?$/, "/"), import.meta.url) : new URL("../ifc-quantity-takeoff/", import.meta.url);
  const { parseStep } = await import(new URL("step.mjs", base).href);
  const { takeoff, readUnits } = await import(new URL("qto.mjs", base).href);
  const { Geometry, polyPlanes, asTerms, solidExtent, sectionArea, mul, invert, transformSolid } = await import(new URL("geom.mjs", base).href);
  const model = parseStep(ifcText);
  const { rows, rooms } = takeoff(model);
  addWallLines(model, rows, { Geometry, polyPlanes, readUnits, asTerms });
  addMemberLines(model, rows, { solidExtent });
  addSlabLines(model, rows, { solidExtent });
  addOpeningLines(model, rows, { Geometry, readUnits, solidExtent, sectionArea, mul, invert, transformSolid, asTerms });
  addRevitSizeLines(model, rows, { readUnits });
  return addSpaceQuantities(quantitiesFromRows(rows), model, rooms, rows);
}
