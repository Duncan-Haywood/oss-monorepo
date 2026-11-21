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
  const head = ["Entity", "GlobalId", "Number", "Name", "Storey", "Floor area m2", "Perimeter m", "Height m", "Wall area m2 (perimeter x height)", "Volume m3", "Elements in room", "Stored gross floor area m2", "Stored net floor area m2", "Stored perimeter m", "Stored height m", "Stored volume m3", "Check", "Geometry status"];
  const out = [head.join(",")];
  for (const r of rooms) {
    const c = r.computed || {};
    const st = (key) => { const names = ROOM_PAIRS.find((p) => p[0] === key)[2]; const nm = names.find((n) => r.stored[n]); return nm ? r.stored[nm].value : null; };
    const bad = Object.entries(r.check || {}).filter(([, v]) => !v.agree).map(([k, v]) => `${k} ${v.diff > 0 ? "+" : ""}${(v.diff * 100).toFixed(1)}% vs stored ${v.name} (${v.reason})`);
    const pairs = Object.keys(r.check || {}).length;
    out.push([`#${r.id}`, r.globalId, r.number, r.name, r.storey, c.floorArea, c.perimeter, c.height, c.wallArea, c.volume, r.elements ?? 0, r.stored.GrossFloorArea?.value ?? null, r.stored.NetFloorArea?.value ?? null, st("perimeter"), st("height"), st("volume"), pairs ? (bad.length ? bad.join("; ") : "agrees") : "", r.status].map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}

/** Totals of the room schedule, per storey and overall. */
export function roomTotals(rooms) {
  const by = new Map();
  const add = (k, r) => {
    const t = by.get(k) ?? { storey: k, rooms: 0, floorArea: 0, wallArea: 0, volume: 0, unmeasured: 0 };
    t.rooms++;
    if (r.computed?.floorArea != null) { t.floorArea += r.computed.floorArea; t.wallArea += r.computed.wallArea ?? 0; t.volume += r.computed.volume; } else t.unmeasured++;
    by.set(k, t);
  };
  for (const r of rooms) { add(r.storey ?? "(no storey)", r); add("All storeys", r); }
  return [...by.values()];
}
