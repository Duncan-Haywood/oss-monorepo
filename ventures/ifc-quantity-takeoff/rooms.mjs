// Rooms: a schedule of the model's IfcSpaces measured from their own
// geometry, and which room each element stands in.
//
// An estimator prices finishes room by room: floor finish by floor area,
// skirting by perimeter, wall finish by perimeter times height, ceilings by
// area, and the loose items (furniture, sanitary fittings, light fittings) by
// the room they are in. Exporters write some of this in each space's
// quantity set (Qto_SpaceBaseQuantities: NetFloorArea, GrossPerimeter,
// Height, NetVolume), but as with elements the stored figure is the
// exporter's word; this reads the space's own solid and says where the two
// disagree.
//
//   roomGeometry(body, W, f)   floor area, perimeter, height, volume of one
//                              space's solid (local coordinates, placement W,
//                              length unit f) in m, m2, m3
//   pointInSolid(s, p)         whether local point p is inside solid s
//   sectionPerimeter(s, n, k)  length of the outline the plane n.x = k cuts
//   assignRooms(rows, rooms)   row.space for elements no room contains in the
//                              file, by where their box stands
//
// Solids are the signed sums geom.mjs builds: convex polyhedra (terms) and
// closed faceted shells, each with a sign that says whether it adds or cuts.

import { solidVolume, solidExtent, sectionArea, polyPlanes, polyVolume, invert, apply, convexPieces, prism } from "./geom.mjs";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : null; };
const sign = (x) => (x < 0 ? -1 : 1);

/** A 2D basis (u, v) of the plane normal to n with u x v = n. */
function planeBasis(n) {
  const u = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
  return [u, cross(n, u)];
}

/**
 * The directed edges the plane n.x = k cuts from a solid, in the plane's 2D
 * basis, each with a weight: +1 for an edge of the region traversed
 * counter-clockwise about n, -1 for one traversed the other way. A convex
 * term gives its section polygon (counter-clockwise, times its sign); a
 * closed shell gives one edge per fanned triangle it crosses (see
 * shellSection in geom.mjs, whose Y-to-X edges run counter-clockwise for an
 * outward shell).
 */
export function sectionEdges(s, n, k) {
  const nn = unit(n);
  const [u, v] = planeBasis(nn);
  const to2 = (p) => [dot(p, u), dot(p, v)];
  const edges = [];
  for (const t of s.terms) {
    const vol = polyVolume(t.faces);
    if (!vol) continue;
    const w = sign(t.s * vol);
    const pts = [];
    let scale = 0;
    for (const f of t.faces) for (const p of f) scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
    const eps = 1e-9 * (scale + Math.abs(k) + 1);
    let above = false, below = false;
    const addPt = (p) => { const q = to2(p); if (!pts.some((r) => Math.abs(r[0] - q[0]) <= eps * 10 && Math.abs(r[1] - q[1]) <= eps * 10)) pts.push(q); };
    for (const f of t.faces) {
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const da = dot(nn, a) - k, db = dot(nn, b) - k;
        if (da > eps) above = true; else if (da < -eps) below = true;
        if (Math.abs(da) <= eps) addPt(a);
        else if ((da < -eps && db > eps) || (da > eps && db < -eps)) { const r = da / (da - db); addPt([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r]); }
      }
    }
    if (!above || !below || pts.length < 3) continue;
    const c = [pts.reduce((x, p) => x + p[0], 0) / pts.length, pts.reduce((y, p) => y + p[1], 0) / pts.length];
    pts.sort((p, q) => Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]));
    for (let i = 0; i < pts.length; i++) edges.push({ a: pts[i], b: pts[(i + 1) % pts.length], w });
  }
  for (const sh of s.shells || []) {
    for (const f of sh.loops) {
      if (f.length < 3) continue;
      const d = f.map((p) => dot(nn, p) - k);
      for (let i = 1; i + 1 < f.length; i++) {
        const tri = [f[0], f[i], f[i + 1]], dt = [d[0], d[i], d[i + 1]];
        let X = null, Y = null;
        for (let j = 0; j < 3; j++) {
          const p = tri[j], q = tri[(j + 1) % 3], dp = dt[j], dq = dt[(j + 1) % 3];
          if ((dp <= 0) === (dq <= 0)) continue;
          const r = dp / (dp - dq);
          const pt = [p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r, p[2] + (q[2] - p[2]) * r];
          if (dp <= 0) X = pt; else Y = pt;
        }
        if (X && Y) edges.push({ a: to2(Y), b: to2(X), w: sign(sh.s) });
      }
    }
  }
  return edges;
}

/**
 * Length of the outline of a set of weighted directed edges. Edges on one
 * line are laid along it: an edge two adjacent pieces share runs both ways
 * and cancels, a cut's edge cancels the part of the piece's edge it removes,
 * and what is left with a non-zero net weight is outline. This is what makes
 * the perimeter of a room cut into convex pieces the room's, not the sum of
 * the pieces'.
 */
export function outlineLength(edges) {
  if (!edges.length) return 0;
  let scale = 0;
  for (const e of edges) scale = Math.max(scale, Math.abs(e.a[0]), Math.abs(e.a[1]), Math.abs(e.b[0]), Math.abs(e.b[1]));
  const tolOff = 1e-7 * (scale + 1), tolAng = 1e-7;
  const lines = [];
  for (const e of edges) {
    let dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
    const len = Math.hypot(dx, dy);
    if (!(len > tolOff)) continue;
    dx /= len; dy /= len;
    let w = e.w;
    // one direction per line: flip so the angle is in [0, pi)
    if (dy < -1e-12 || (Math.abs(dy) <= 1e-12 && dx < 0)) { dx = -dx; dy = -dy; w = -w; }
    let ang = Math.atan2(dy, dx);
    let off = dx * e.a[1] - dy * e.a[0];
    let t0 = dx * e.a[0] + dy * e.a[1], t1 = dx * e.b[0] + dy * e.b[1];
    // a line at an angle just under pi is the one just over 0, run the other way
    if (ang > Math.PI - tolAng) { ang -= Math.PI; off = -off; t0 = -t0; t1 = -t1; w = -w; }
    lines.push({ ang, off, lo: Math.min(t0, t1), hi: Math.max(t0, t1), w });
  }
  lines.sort((p, q) => p.ang - q.ang || p.off - q.off);
  let total = 0;
  const used = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const L = lines[i];
    const ev = [];
    for (let j = i; j < lines.length && lines[j].ang - L.ang <= tolAng; j++) {
      const M = lines[j];
      if (used[j] || Math.abs(M.off - L.off) > tolOff) continue;
      used[j] = 1;
      ev.push([M.lo, M.w], [M.hi, -M.w]);
    }
    ev.sort((p, q) => p[0] - q[0]);
    let net = 0, last = null;
    for (const [t, dw] of ev) {
      if (last != null && net !== 0) total += t - last;
      net += dw; last = t;
    }
  }
  return total;
}

/** Length of the outline the plane n.x = k cuts from a solid (null when it has faces this cannot see). */
export function sectionPerimeter(s, n, k) {
  if (s.mesh && !s.shells) return null;
  return outlineLength(sectionEdges(s, n, k));
}

/**
 * Whether local point p is inside solid s: the signed count of the convex
 * terms that hold it plus the winding number of each shell, times the sign
 * of the whole (a solid built inside out still has its inside). null when
 * the solid has faces this cannot see.
 */
export function pointInSolid(s, p, tol = 1e-7) {
  if (s.mesh && !s.shells) return null;
  let n = 0;
  for (const t of s.terms) {
    const vol = polyVolume(t.faces);
    if (!vol) continue;
    let c = [0, 0, 0], m = 0;
    for (const f of t.faces) for (const q of f) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; m++; }
    c = [c[0] / m, c[1] / m, c[2] / m];
    let inside = true;
    for (const [nn, k] of polyPlanes(t.faces)) {
      const sc = dot(nn, c) - k, sp = dot(nn, p) - k;
      if (sign(sc) * sp < -tol * (1 + Math.abs(k))) { inside = false; break; }
    }
    if (inside) n += sign(t.s * vol);
  }
  for (const sh of s.shells || []) n += sh.s * windingNumber(sh.loops, p);
  const whole = solidVolume(s);
  return n * sign(whole) > 0.5;
}

/** Winding number of closed face loops about p (solid angles, Van Oosterom and Strackee). */
export function windingNumber(loops, p) {
  let omega = 0;
  for (const f of loops) {
    for (let i = 1; i + 1 < f.length; i++) {
      const a = sub(f[0], p), b = sub(f[i], p), c = sub(f[i + 1], p);
      const la = norm(a), lb = norm(b), lc = norm(c);
      const num = dot(a, cross(b, c));
      const den = la * lb * lc + dot(a, b) * lc + dot(a, c) * lb + dot(b, c) * la;
      omega += 2 * Math.atan2(num, den);
    }
  }
  return Math.round(omega / (4 * Math.PI));
}

/**
 * A space's quantities from its solid: the floor area and perimeter cut 1 cm
 * above its lowest point (where a floor finish and skirting go, below any
 * sloped ceiling), its height, its volume, and the wall area as perimeter x
 * height (the gross area of wall finish, before doors and windows come off).
 * W is the space's placement and f the length unit; the result is in m, m2
 * and m3. null when the solid has no extent.
 */
export function roomGeometry(body, W, f) {
  const up = [W[8], W[9], W[10]];
  const len = norm(up);
  if (!(len > 0)) return null;
  const n = [up[0] / len, up[1] / len, up[2] / len];
  const [lo, hi] = solidExtent(body, n);
  if (!(hi > lo)) return null;
  const s = len * f; // metres per local unit along any axis (placements are rigid or uniformly scaled)
  const at = lo + Math.min(0.01 / s, (hi - lo) * 0.1);
  const area = sectionArea(body, n, at);
  const perimeter = sectionPerimeter(body, n, at);
  const height = (hi - lo) * s;
  const volume = Math.abs(solidVolume(body)) * s * s * s;
  return {
    floorArea: area == null ? null : area * s * s,
    perimeter: perimeter == null ? null : perimeter * s,
    height,
    volume,
    wallArea: perimeter == null ? null : perimeter * s * height,
    faceted: !!body.mesh,
  };
}

/**
 * The solid of a space drawn only as a plan outline and a bounding box (Revit
 * and ArchiCAD both export rooms this way: schependomlaan's 94 of 100): the
 * outline (local x, y) extruded from the box's bottom z0 by its height h, as
 * convex pieces. null when the outline encloses nothing.
 */
export function footprintSolid(pts0, z0, h) {
  const pts = pts0.slice();
  while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3 || !(h > 0)) return null;
  const terms = [];
  for (const piece of convexPieces(pts)) terms.push({ s: piece.s, faces: prism(piece.pts, [0, 0, h]).map((f) => f.map((q) => [q[0], q[1], q[2] + z0])) });
  if (!terms.length) return null;
  return { terms, mesh: 0, notes: ["from the plan outline and bounding box"], shells: [] };
}

// The stored figure each computed one is checked against, in the order the
// names are tried (Qto_SpaceBaseQuantities, then the names exporters use).
export const ROOM_PAIRS = [
  // gross first: a space's solid is its gross floor; ArchiCAD's NetFloorArea
  // takes a plaster allowance (FZK-Haus: x 0.97) and low-headroom zones off
  ["floorArea", "floor area", ["GrossFloorArea", "NetFloorArea"]],
  ["perimeter", "perimeter", ["GrossPerimeter", "NetPerimeter", "Perimeter"]],
  ["height", "height", ["Height", "ClearHeight", "FinishCeilingHeight", "NominalHeight"]],
  ["volume", "volume", ["NetVolume", "GrossVolume", "Volume"]],
];

/**
 * Each computed quantity of a room against the stored one, when both exist,
 * with the likely cause of a disagreement:
 *   unit-slip   stored = computed x a power of ten (HouseZ writes its areas in
 *               mm2 and volumes in mm3 under square and cubic metres);
 *   nominal     a stored height above the solid's top, where the solid is
 *               lower than its floor x that height (a ceiling cut by a sloped
 *               roof: the stored height is the space's nominal one);
 *   floor-x-height  the stored volume is the floor area times the stored
 *               height, and the solid is lower (lowered ceilings: ARK_NUS's
 *               wcs and corridors); floor-x-height-unit, the same written in
 *               another unit (ARK_NUS writes litres under cubic metres);
 *   outline-prism  a room drawn only as an outline and a box, measured as the
 *               outline through the box's full height, holds more than its
 *               stored volume: a sloped or stepped ceiling (schependomlaan's
 *               top-floor rooms);
 *   unexplained none of these.
 */
export function checkRoom(room, tol = 0.02) {
  const out = {};
  if (!room.computed) return out;
  for (const [key, , names] of ROOM_PAIRS) {
    const c = room.computed[key];
    const name = names.find((nm) => room.stored[nm] && room.stored[nm].value > 0);
    if (c == null || !(c > 0) || !name) continue;
    const st = room.stored[name].value;
    const diff = (c - st) / st;
    const res = { name, stored: st, computed: c, diff, agree: Math.abs(diff) <= tol };
    if (!res.agree) {
      const pow = Math.round(Math.log10(st / c));
      const fa = room.computed.floorArea;
      // the stored volume as the floor area times the stored (nominal) height,
      // in whatever unit it was written
      const hName = ROOM_PAIRS[2][2].find((nm) => room.stored[nm] && room.stored[nm].value > 0);
      const v0 = key === "volume" && hName && fa > 0 ? fa * room.stored[hName].value : null;
      const pow0 = v0 ? Math.round(Math.log10(st / v0)) : 0;
      if (pow !== 0 && Math.abs(c * 10 ** pow - st) <= tol / 4 * st) res.reason = "unit-slip";
      else if (v0 && Math.abs(v0 * 10 ** pow0 - st) <= tol / 4 * st && Math.abs(c - v0) > tol * v0) res.reason = pow0 ? "floor-x-height-unit" : "floor-x-height";
      else if (key === "volume" && room.from === "footprint" && c > st) res.reason = "outline-prism";
      else if (key === "height" && c < st && fa > 0 && room.computed.volume < fa * st * (1 - tol)) res.reason = "nominal";
      else res.reason = "unexplained";
    }
    out[key] = res;
  }
  return out;
}

export const ROOM_REASON_TEXT = {
  "unit-slip": "the stored figure is the computed one times a power of ten: written in the wrong unit",
  nominal: "the stored height is the room's nominal one; its ceiling is cut lower (a sloped roof)",
  "floor-x-height": "the stored volume is the floor area times the room's nominal height; its ceiling is lower, so the solid holds less",
  "floor-x-height-unit": "the stored volume is the floor area times the room's nominal height, written in the wrong unit (litres under cubic metres); its ceiling is lower",
  "outline-prism": "the room is drawn only as a plan outline and a box; the outline through the box's full height holds more than the stored volume (a sloped ceiling): use the stored volume",
  unexplained: "no known cause: check the room",
};

/** "101 Office" from a space's Name (often the number) and LongName. */
export function roomLabel(name, longName, id) {
  if (name && longName && name !== longName) return `${name} ${longName}`;
  return longName ?? name ?? `#${id}`;
}

// How far into a room an element's test point sits above the bottom of its
// box: a chair's legs stand on the floor the space starts at, so its very
// bottom is on the room's boundary.
const LIFT = 0.1;

// Elements that bound rooms rather than stand in them: a wall, door or
// curtain-wall member sits on the line between two rooms, and spaces drawn to
// wall centrelines (ARK_NUS: 901 walls, 306 doors and 852 members fell inside
// one) would hand each to whichever room it was tested against first. Only a
// room the file itself names for one of them counts.
export const BOUNDS_ROOMS = /^IFC(WALL|CURTAINWALL|SLAB|ROOF|DOOR|WINDOW|PLATE|MEMBER|BEAM|COLUMN|FOOTING|PILE|STAIR|RAMP|RAILING|CHIMNEY|BUILDINGELEMENTPART|SHADINGDEVICE|ELEMENTASSEMBLY)/;

/**
 * Gives each element no room contains in the file the room it stands in: the
 * middle of its plan box, 10 cm above its bottom (then at half height, then
 * 10 cm under its top), tested against each room's solid; where rooms overlap
 * the smallest wins. Walls, slabs, doors and the rest that bound rooms
 * (BOUNDS_ROOMS) are not placed by geometry. Sets row.space and row.spaceFrom ("contained", "geometry") and
 * room.elements (how many elements are in each room). rooms are the
 * takeoff's, with non-enumerable `solid` (local body), `world` and
 * `lengthUnit`; a room without them takes only the contained elements.
 */
export function assignRooms(rows, rooms) {
  const testable = rooms.filter((r) => r.solid && r.box).map((r) => ({ r, inv: invert(r.world) })).sort((a, b) => (a.r.computed?.volume ?? Infinity) - (b.r.computed?.volume ?? Infinity));
  const byLabel = new Map(rooms.map((r) => [r.label, r]));
  for (const r of rooms) r.elements = 0;
  for (const row of rows) {
    if (row.space) { row.spaceFrom = "contained"; const rm = byLabel.get(row.space); if (rm && !row.isAssembly) rm.elements++; continue; }
    if (!row.box || row.isAssembly || BOUNDS_ROOMS.test(row.ifcType ?? "")) continue;
    const b = row.box;
    const x = (b[0] + b[3]) / 2, y = (b[1] + b[4]) / 2, lift = Math.min(LIFT, (b[5] - b[2]) / 2);
    // near the bottom first (furniture, floor finishes), then the middle, then
    // near the top (a suspended ceiling hangs at the top of its room)
    let hit = null;
    const zs = [b[2] + lift, (b[2] + b[5]) / 2, b[5] - lift];
    // a ceiling closes the room under it and a floor finish the one over it:
    // Revit rooms stop at the ceiling's underside (Office_A: 83 of 83 ceilings)
    if (/^IFCCOVERING/.test(row.ifcType ?? "")) {
      if (row.predefinedType === "CEILING") zs.push(b[2] - LIFT);
      else if (row.predefinedType === "FLOORING") zs.push(b[5] + LIFT);
    }
    for (const z of zs) {
      for (const { r, inv } of testable) {
        const B = r.box, e = 1e-6;
        if (x < B[0] - e || x > B[3] + e || y < B[1] - e || y > B[4] + e || z < B[2] - e || z > B[5] + e) continue;
        const f = r.lengthUnit;
        if (pointInSolid(r.solid, apply(inv, [x / f, y / f, z / f]))) { hit = r; break; }
      }
      if (hit) break;
    }
    if (hit) { row.space = hit.label; row.spaceFrom = "geometry"; hit.elements++; }
  }
}

// the same cell rules as qto.mjs: a name from the file that starts like a
// formula (=, +, -, @) is quoted with a leading apostrophe so a spreadsheet
// does not run it
const csvCell = (v) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e4) / 1e4) : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

/** The room schedule as CSV: one line a room, computed and stored side by side. */
export function roomsCsv(rooms) {
  const head = ["Entity", "GlobalId", "Number", "Name", "Storey", "Floor area m2", "Perimeter m", "Height m", "Wall area m2 (perimeter x height)", "Doors and windows", "Door and window area m2", "Door and window area above the room's top m2", "Curtain wall area m2", "Net wall area m2", "Volume m3", "Elements in room", "Stored gross floor area m2", "Stored net floor area m2", "Stored perimeter m", "Stored height m", "Stored volume m3", "Check", "Geometry status"];
  const out = [head.join(",")];
  for (const r of rooms) {
    const c = r.computed || {};
    const st = (key) => { const names = ROOM_PAIRS.find((p) => p[0] === key)[2]; const nm = names.find((n) => r.stored[n]); return nm ? r.stored[nm].value : null; };
    const bad = Object.entries(r.check || {}).filter(([, v]) => !v.agree).map(([k, v]) => `${k} ${v.diff > 0 ? "+" : ""}${(v.diff * 100).toFixed(1)}% vs stored ${v.name} (${v.reason})`);
    const pairs = Object.keys(r.check || {}).length;
    out.push([`#${r.id}`, r.globalId, r.number, r.name, r.storey, c.floorArea, c.perimeter, c.height, c.wallArea, c.openings, c.openingArea, c.clippedArea, c.glazedArea, c.netWallArea, c.volume, r.elements ?? 0, r.stored.GrossFloorArea?.value ?? null, r.stored.NetFloorArea?.value ?? null, st("perimeter"), st("height"), st("volume"), pairs ? (bad.length ? bad.join("; ") : "agrees") : "", r.status].map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}

/** Totals of the room schedule, per storey and overall. */
export function roomTotals(rooms) {
  const by = new Map();
  const add = (k, r) => {
    const t = by.get(k) ?? { storey: k, rooms: 0, floorArea: 0, wallArea: 0, netWallArea: 0, volume: 0, unmeasured: 0 };
    t.rooms++;
    if (r.computed?.floorArea != null) { t.floorArea += r.computed.floorArea; t.wallArea += r.computed.wallArea ?? 0; t.netWallArea += r.computed.netWallArea ?? r.computed.wallArea ?? 0; t.volume += r.computed.volume; } else t.unmeasured++;
    by.set(k, t);
  };
  for (const r of rooms) { add(r.storey ?? "(no storey)", r); add("All storeys", r); }
  return [...by.values()];
}

// ---- net wall finish: doors, windows and curtain walls off each room's walls

// What comes off a room's wall finish: an opening filled by a door or window
// (on each side it faces), and a curtain wall (glazing takes no wall finish).
export const OPENING_CLASS = /^IFC(DOOR|WINDOW)/;
export const GLAZED_CLASS = /^IFCCURTAINWALL/;

/**
 * Area of a space boundary's connection surface, in the file's length unit
 * squared, or null when it is a kind this does not read. The two exporters
 * write: Revit an IfcSurfaceOfLinearExtrusion (the boundary line swept up by
 * the wall's height), ArchiCAD, Allplan and others an IfcCurveBoundedPlane
 * (an outline in its plane, less any inner outlines). geo is geom.mjs's
 * Geometry for the model.
 */
export function connectionArea(geo, ref) {
  let c = geo.get(ref);
  if (!c) return null;
  if (c.type === "IFCCONNECTIONSURFACEGEOMETRY") c = geo.get(c.args[0]);
  if (!c) return null;
  if (c.type === "IFCSURFACEOFLINEAREXTRUSION") {
    const prof = geo.get(c.args[0]);
    const depth = geo.num(c.args[3]);
    if (!prof || !(depth > 0) || !/^IFCARBITRARY(OPEN|CLOSED)PROFILEDEF/.test(prof.type)) return null;
    const pts = geo.curve(prof.args[2]);
    const d = geo.dir(c.args[2], [0, 0, 1]);
    let a = 0;
    for (let i = 0; i + 1 < pts.length; i++) a += norm(cross([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], 0], d));
    return a * depth;
  }
  if (c.type === "IFCCURVEBOUNDEDPLANE") {
    const area = (r) => { const p = geo.curve(r); return p.length >= 3 ? Math.abs(planeArea(p)) : 0; };
    let a = area(c.args[1]);
    for (const r of Array.isArray(c.args[2]) ? c.args[2] : []) a -= area(r);
    return a > 0 ? a : null;
  }
  return null;
}

const planeArea = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};

/** The rooms with a solid, smallest first, each with its inverse placement: what openingSides tests against. */
export function roomTests(rooms) {
  return rooms.filter((r) => r.solid && r.box).map((r) => ({ r, inv: invert(r.world) })).sort((a, b) => (a.r.computed?.volume ?? Infinity) - (b.r.computed?.volume ?? Infinity));
}

// How far past an opening's faces its two sides are tested for a room (m):
// 20 cm, then 60 cm for a side that found none (a window frame set in the
// outer face of a 30 cm wall, schependomlaan's sub-frames).
const SIDES = [0.2, 0.6];

/** Local extents of a row's body, its up axis, its two horizontal axes and metres per local unit, or null. */
function bodyFrame(row) {
  const body = row.computed?.solids?.body, W = row.world, f = row.lengthUnit;
  if (!body || !W || !f) return null;
  const ex = [0, 1, 2].map((i) => solidExtent(body, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]));
  if (ex.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b))) return null;
  // which local axis is world up decides which two are horizontal
  const up = [0, 1, 2].reduce((m, i) => (Math.abs(W[8 + i]) > Math.abs(W[8 + m]) ? i : m), 0);
  const horiz = [0, 1, 2].filter((i) => i !== up);
  const scale = norm([W[0], W[4], W[8]]) * f;
  const span = (i) => (ex[i][1] - ex[i][0]) * scale;
  const [thin, wide] = span(horiz[0]) <= span(horiz[1]) ? horiz : [horiz[1], horiz[0]];
  return { ex, up, thin, wide, scale, span, W, f };
}

/** An opening's face from its body: its wider horizontal side x its height (m2), or null. */
export function openingFace(row) {
  const b = bodyFrame(row);
  return b ? b.span(b.wide) * b.span(b.up) : null;
}

/**
 * The rooms a door or window opens into, by where it stands: the middle of its
 * body, moved out through its thinner horizontal side (through the wall) by
 * half its depth plus 20 cm each way (60 cm where that finds none), tested against each room's solid; the
 * smallest room holding each point wins. Returns the rooms (0, 1 or 2).
 */
export function openingSides(row, testable) {
  const b = bodyFrame(row);
  if (!b) return [];
  const { ex, thin: t, scale, W, f } = b;
  const c = ex.map(([lo, hi]) => (lo + hi) / 2);
  const found = [];
  for (const sgn of [-1, 1]) {
    for (const side of SIDES) {
      const p = c.slice();
      p[t] += sgn * ((ex[t][1] - ex[t][0]) / 2 + side / scale);
      const w = apply(W, p); // file units, world
      const x = w[0] * f, y = w[1] * f, z = w[2] * f;
      let hit = null;
      for (const { r, inv } of testable) {
        const B = r.box, e = 1e-6;
        if (x < B[0] - e || x > B[3] + e || y < B[1] - e || y > B[4] + e || z < B[2] - e || z > B[5] + e) continue;
        if (pointInSolid(r.solid, apply(inv, w.map((v) => v * f / r.lengthUnit)))) { hit = r; break; }
      }
      if (hit) { if (!found.includes(hit)) found.push(hit); break; }
    }
  }
  return found;
}

// How far an opening may stand past a room's ceiling before its area is cut
// (m): a frame runs a little past a suspended ceiling's line.
const CLIP_SLACK = 0.05;

/**
 * The share (0..1) of an opening's height that lies below a room's top, from
 * their world boxes [x0, y0, z0, x1, y1, z1] in m: 1 when either box is
 * missing or the opening's top is within CLIP_SLACK of the room's. The gross
 * wall area is the perimeter times the room solid's height, so the part of a
 * window above that solid's top (a lowered ceiling) is no wall the room's
 * finish covers. Only the top is cut: a door's body that runs into the floor
 * build-up (FM_ARC_DigitalHub's 15 cm, HouseZ's 51 cm) is no part of the
 * opening, and its stored height already leaves it out; the share is of the
 * part above the room's floor.
 */
export function heightShare(box, roomBox, slack = CLIP_SLACK) {
  if (!box || !roomBox) return 1;
  const top = roomBox[5];
  if (!(box[5] > top + slack)) return 1;
  const lo = Math.max(box[2], roomBox[2]), h = box[5] - lo;
  if (!(h > 0)) return 1;
  return Math.max(0, Math.min(1, (top - lo) / h));
}

/**
 * Takes the doors, windows and curtain walls off each room's gross wall
 * area (perimeter x height). Where the file has space boundaries
 * (IfcRelSpaceBoundary) for an element they say which rooms it faces and the
 * boundary surface gives the area; an opening the boundaries do not name is
 * placed by where it stands (openingSides). A door or window comes off at its
 * stored OverallWidth x OverallHeight, else its boundary surface, else its
 * body's width x height; a curtain wall at its boundary surface.
 *
 *   bounds   [{space, element, type, area}] from the file (area in m2 or null)
 *   overall  Map element id -> {width, height} in m (IfcDoor/IfcWindow)
 *
 * Sets on each measured room: computed.openings (count), computed.openingArea,
 * A door or window that reaches past the room's height (a window over a
 * lowered ceiling, a roof light over the room below) comes off only for the
 * share of its height below the room's top (heightShare); opts.clip false takes
 * every one off in full, as before 2026-11-21.
 *
 * Sets on each measured room: computed.openings (count), computed.openingArea,
 * computed.glazedArea (curtain walls), computed.netWallArea, and
 * computed.openingsFrom ({boundary, geometry}), computed.nestedPieces (door
 * or window pieces inside a larger one, not taken twice), computed.clipped
 * (openings cut at the room's height), computed.clippedArea (m2 left on the
 * wall by that cut), computed.outside (openings wholly above the room's top,
 * not taken); on each door and window row, row.facesRooms (labels) and
 * row.facesFrom ("boundary" | "geometry").
 */
export function deductOpenings(rows, rooms, bounds = [], overall = new Map(), opts = {}) {
  const clip = opts.clip !== false;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const testable = roomTests(rooms);
  const named = new Set();
  // (room, element) -> area: one entry per pair, the largest surface the file gives
  const pairs = new Map();
  const put = (room, row, area, from) => {
    const k = `${room.id}/${row.id}`;
    const old = pairs.get(k);
    if (!old || (area ?? 0) > (old.area ?? 0)) pairs.set(k, { room, row, area, from });
  };
  for (const b of bounds) {
    const room = byId.get(b.space);
    if (!room) continue;
    // a curtain wall is often no element of its own here (Revit's carry no
    // body: their plates and members do), so it is taken by its boundary alone
    if (GLAZED_CLASS.test(b.type ?? "")) { if (b.area > 0) put(room, { id: b.element, ifcType: b.type }, b.area, "boundary"); continue; }
    const row = rowById.get(b.element);
    if (!row || !OPENING_CLASS.test(row.ifcType)) continue;
    named.add(row.id);
    put(room, row, b.area, "boundary");
  }
  for (const row of rows) {
    if (!OPENING_CLASS.test(row.ifcType ?? "") || row.isAssembly || named.has(row.id)) continue;
    for (const room of openingSides(row, testable)) put(room, row, null, "geometry");
  }
  const own = (row) => {
    const o = overall.get(row.id);
    if (o && o.width > 0 && o.height > 0) return o.width * o.height;
    return null;
  };
  for (const row of rows) {
    const o = OPENING_CLASS.test(row.ifcType ?? "") ? overall.get(row.id) : null;
    if (o) Object.defineProperty(row, "overallArea", { value: o.width * o.height, enumerable: false, writable: true });
  }
  for (const r of rooms) if (r.computed) Object.assign(r.computed, { openings: 0, openingArea: 0, glazedArea: 0, openingsFrom: { boundary: 0, geometry: 0 }, nestedPieces: 0, clipped: 0, clippedArea: 0, outside: 0 });
  // one opening drawn as several door or window pieces (schependomlaan: a
  // window, its sub-frame and the sub-frame's sill, each an IfcWindow) comes
  // off once: in each room, a piece whose box lies mostly inside a larger
  // piece's (half or more along every axis, 5 cm slack) is dropped
  const kept = [];
  const byRoom = new Map();
  for (const p of pairs.values()) { const l = byRoom.get(p.room) ?? []; l.push(p); byRoom.set(p.room, l); }
  const sizeOf = (p) => (GLAZED_CLASS.test(p.row.ifcType) ? p.area : own(p.row) ?? (p.area > 0 ? p.area : openingFace(p.row))) ?? 0;
  const inside = (a, b) => { // box a mostly inside box b
    for (let i = 0; i < 3; i++) {
      const lo = Math.max(a[i], b[i] - 0.05), hi = Math.min(a[i + 3], b[i + 3] + 0.05);
      const len = a[i + 3] - a[i];
      if (hi - lo < 0.5 * len - 1e-9) return false;
    }
    return true;
  };
  for (const list of byRoom.values()) {
    list.sort((p, q) => sizeOf(q) - sizeOf(p));
    const here = [];
    for (const p of list) {
      if (p.row.box && OPENING_CLASS.test(p.row.ifcType) && here.some((q) => q.row.box && inside(p.row.box, q.row.box))) { if (p.room.computed) p.room.computed.nestedPieces++; continue; }
      here.push(p);
    }
    kept.push(...here);
  }
  for (const { room, row, area, from } of pairs.values()) {
    if (!OPENING_CLASS.test(row.ifcType)) continue;
    (row.facesRooms ??= []).push(room.label);
    row.facesFrom = from;
    if (area > 0) {
      if (!row.boundaryAreas) Object.defineProperty(row, "boundaryAreas", { value: {}, enumerable: false, writable: true });
      row.boundaryAreas[room.label] = area;
    }
  }
  for (const { room, row, area, from } of kept) {
    if (!room.computed) continue;
    // a door or window comes off at its stored overall size: Revit's boundary
    // for one is the wall strip it sits in, swept to the room's height (Office_A:
    // 1.37 x width x height), so the boundary surface is used only for a
    // curtain wall, or an opening that stores no size
    const a = GLAZED_CLASS.test(row.ifcType) ? area : (own(row) ?? (area > 0 ? area : openingFace(row)));
    if (!(a > 0)) continue;
    if (GLAZED_CLASS.test(row.ifcType)) { room.computed.glazedArea += a; continue; }
    const k = clip ? heightShare(row.box, room.box) : 1;
    if (k < 1) {
      room.computed.clippedArea += a * (1 - k);
      if (k > 0) room.computed.clipped++;
      else { room.computed.outside++; continue; }
    }
    room.computed.openingArea += a * k; room.computed.openings++; room.computed.openingsFrom[from]++;
  }
  for (const r of rooms) {
    const c = r.computed;
    if (!c) continue;
    c.netWallArea = c.wallArea == null ? null : Math.max(0, c.wallArea - c.openingArea - c.glazedArea);
  }
}
