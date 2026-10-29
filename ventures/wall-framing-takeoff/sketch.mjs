// @ts-check
// The plan editor's model: wall centre lines and openings drawn on a grid,
// turned into the plan the takeoff takes. Nothing here touches the page, so
// the geometry is tested on its own (sketch.test.mjs).
//
// The sketch is written out as the ASCII DXF a CAD program would save (walls,
// doors and windows on their own layers, inches) and read back by `planFromDxf`,
// so corners, tees, the exterior loop and opening offsets come from the same
// code that reads a real floor plan, not a second copy of it.
//
// Coordinates are inches, x to the right, y down the screen (as drawn).

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ id: number, a: Pt, b: Pt }} SketchWall */
/** @typedef {{ id: number, wall: number, kind: "door" | "window", offset: number, width: number }} SketchOpening */
/** @typedef {{ walls: SketchWall[], openings: SketchOpening[], nextId: number }} Sketch */

import { planFromDxf } from "./dxf.mjs";

export const emptySketch = () => /** @type {Sketch} */ ({ walls: [], openings: [], nextId: 1 });

const len = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

/**
 * Snap a cursor point: to a nearby wall end first (so walls close up), else to
 * the grid. With `from` and `ortho`, the point is first pulled onto the
 * horizontal or vertical line through `from`, whichever is nearer.
 * @param {Pt} p
 * @param {Sketch} sk
 * @param {{ grid?: number, tol?: number, from?: Pt | null, ortho?: boolean }} [o]
 * @returns {Pt}
 */
export function snapPoint(p, sk, o = {}) {
  const grid = o.grid ?? 6, tol = o.tol ?? 8;
  let q = { x: p.x, y: p.y };
  if (o.from && o.ortho) {
    if (Math.abs(q.x - o.from.x) >= Math.abs(q.y - o.from.y)) q.y = o.from.y; else q.x = o.from.x;
  }
  let best = null;
  for (const w of sk.walls) for (const e of [w.a, w.b]) {
    const d = Math.hypot(e.x - q.x, e.y - q.y);
    if (d <= tol && (!best || d < best.d)) best = { d, e };
  }
  if (best) {
    // an ortho line must stay ortho: only take the end if it is on that line
    if (!(o.from && o.ortho) || best.e.x === o.from.x || best.e.y === o.from.y) return { x: best.e.x, y: best.e.y };
  }
  if (grid > 0) {
    const g = (v) => Math.round(v / grid) * grid;
    if (o.from && o.ortho) {
      if (q.y === o.from.y) q = { x: g(q.x), y: q.y }; else q = { x: q.x, y: g(q.y) };
    } else q = { x: g(q.x), y: g(q.y) };
  }
  return q;
}

/**
 * A wall of `length` from `from` toward `toward` (the direction only; with
 * ortho the nearer axis). Lets a typed length rule while the mouse picks the way.
 * @param {Pt} from @param {Pt} toward @param {number} length @param {boolean} ortho
 * @returns {Pt | null}
 */
export function pointAtLength(from, toward, length, ortho) {
  if (!(length > 0)) return null;
  let dx = toward.x - from.x, dy = toward.y - from.y;
  if (ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return null;
  return { x: from.x + (dx / d) * length, y: from.y + (dy / d) * length };
}

/**
 * Add a wall. Zero-length and duplicate walls are refused.
 * @param {Sketch} sk @param {Pt} a @param {Pt} b
 * @returns {SketchWall | null}
 */
export function addWall(sk, a, b) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return null;
  for (const w of sk.walls) {
    if ((same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a))) return null;
  }
  const w = { id: sk.nextId++, a: { ...a }, b: { ...b } };
  sk.walls.push(w);
  return w;
}
const same = (p, q) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01;

/**
 * The wall nearest a point within `tol` inches, with the distance along it.
 * @param {Sketch} sk @param {Pt} p @param {number} [tol]
 * @returns {{ wall: SketchWall, along: number, dist: number } | null}
 */
export function nearestWall(sk, p, tol = 10) {
  let best = null;
  for (const w of sk.walls) {
    const L = len(w);
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    const t = (p.x - w.a.x) * ux + (p.y - w.a.y) * uy;
    if (t < 0 || t > L) continue;
    const d = Math.abs((p.x - w.a.x) * uy - (p.y - w.a.y) * ux);
    if (d <= tol && (!best || d < best.dist)) best = { wall: w, along: t, dist: d };
  }
  return best;
}

/**
 * Put a door or window centred at `along` on a wall. The opening is slid to fit
 * inside the wall and refused when it overlaps another opening on that wall or
 * the wall is shorter than the opening.
 * @param {Sketch} sk @param {number} wallId @param {"door"|"window"} kind
 * @param {number} along inches from the wall's `a` end to the opening's centre
 * @param {number} width
 * @returns {{ ok: true, opening: SketchOpening } | { ok: false, error: string }}
 */
export function addOpening(sk, wallId, kind, along, width) {
  const w = sk.walls.find((x) => x.id === wallId);
  if (!w) return { ok: false, error: "No such wall." };
  if (!(width > 0)) return { ok: false, error: "The opening needs a width." };
  const L = len(w);
  if (width > L) return { ok: false, error: `A ${width} in opening does not fit a ${Math.round(L * 16) / 16} in wall.` };
  let offset = Math.min(Math.max(along - width / 2, 0), L - width);
  offset = Math.round(offset * 16) / 16;
  for (const o of sk.openings) {
    if (o.wall === wallId && offset < o.offset + o.width && o.offset < offset + width) return { ok: false, error: "That would overlap another opening." };
  }
  const opening = { id: sk.nextId++, wall: wallId, kind, offset, width };
  sk.openings.push(opening);
  return { ok: true, opening };
}

/**
 * Move wall ends. Every wall end at one of the `moves[i].from` points goes to
 * `moves[i].to`, so walls that met at a corner still meet. The move is refused
 * (and nothing changes) when a wall would shrink under 1 in or collapse onto
 * another wall, or when an opening would no longer fit on its shortened wall.
 * @param {Sketch} sk @param {{ from: Pt, to: Pt }[]} moves
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function moveEnds(sk, moves) {
  const next = sk.walls.map((w) => {
    const mv = (p) => { const m = moves.find((x) => same(x.from, p)); return m ? { x: m.to.x, y: m.to.y } : { x: p.x, y: p.y }; };
    return { id: w.id, a: mv(w.a), b: mv(w.b) };
  });
  for (let i = 0; i < next.length; i++) {
    const w = next[i];
    if (len(w) < 1) return { ok: false, error: "That would shrink a wall to nothing." };
    for (let j = i + 1; j < next.length; j++) {
      const v = next[j];
      if ((same(w.a, v.a) && same(w.b, v.b)) || (same(w.a, v.b) && same(w.b, v.a))) return { ok: false, error: "That would lay one wall on top of another." };
    }
  }
  for (const o of sk.openings) {
    const w = next.find((x) => x.id === o.wall);
    if (w && o.offset + o.width > len(w) + 1e-9) return { ok: false, error: `A ${o.kind} would no longer fit on its ${Math.round(len(w) * 16) / 16} in wall.` };
  }
  sk.walls.forEach((w, i) => { w.a = next[i].a; w.b = next[i].b; });
  return { ok: true };
}

/**
 * Drag one end of a wall (and every wall end sharing that corner) to `to`.
 * @param {Sketch} sk @param {number} wallId @param {"a"|"b"} end @param {Pt} to
 */
export function moveCorner(sk, wallId, end, to) {
  const w = sk.walls.find((x) => x.id === wallId);
  if (!w) return { ok: false, error: "No such wall." };
  return moveEnds(sk, [{ from: { ...w[end] }, to }]);
}

/**
 * Slide a whole wall by (dx, dy); walls meeting its ends follow at those ends.
 * @param {Sketch} sk @param {number} wallId @param {number} dx @param {number} dy
 */
export function moveWall(sk, wallId, dx, dy) {
  const w = sk.walls.find((x) => x.id === wallId);
  if (!w) return { ok: false, error: "No such wall." };
  return moveEnds(sk, [w.a, w.b].map((p) => ({ from: { ...p }, to: { x: p.x + dx, y: p.y + dy } })));
}

/**
 * Slide an opening along its wall so its centre is at `along` inches from the
 * wall's `a` end. Clamped to the wall; refused (nothing changes) when it would
 * overlap another opening on that wall.
 * @param {Sketch} sk @param {number} id @param {number} along
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function moveOpening(sk, id, along) {
  const o = sk.openings.find((x) => x.id === id);
  if (!o) return { ok: false, error: "No such opening." };
  const w = /** @type {SketchWall} */ (sk.walls.find((x) => x.id === o.wall));
  const offset = Math.round(Math.min(Math.max(along - o.width / 2, 0), len(w) - o.width) * 16) / 16;
  if (sk.openings.some((x) => x !== o && x.wall === o.wall && offset < x.offset + x.width && x.offset < offset + o.width)) return { ok: false, error: "That would overlap another opening." };
  o.offset = offset;
  return { ok: true };
}

/**
 * Drag one edge of an opening to `pos` inches along its wall; the other edge
 * stays put. Refused when the opening would be under 6 in wide, run past the
 * wall, or overlap a neighbour.
 * @param {Sketch} sk @param {number} id @param {"a"|"b"} edge @param {number} pos
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function resizeOpening(sk, id, edge, pos) {
  const o = sk.openings.find((x) => x.id === id);
  if (!o) return { ok: false, error: "No such opening." };
  const w = /** @type {SketchWall} */ (sk.walls.find((x) => x.id === o.wall));
  const p = Math.round(pos * 16) / 16;
  const lo = edge === "a" ? p : o.offset, hi = edge === "a" ? o.offset + o.width : p;
  if (hi - lo < 6) return { ok: false, error: "An opening under 6 in wide is not worth framing." };
  if (lo < 0 || hi > len(w) + 1e-9) return { ok: false, error: "That would run past the end of the wall." };
  if (sk.openings.some((x) => x !== o && x.wall === o.wall && lo < x.offset + x.width && x.offset < hi)) return { ok: false, error: "That would overlap another opening." };
  o.offset = lo; o.width = hi - lo;
  return { ok: true };
}

/** Remove a wall and the openings on it. @param {Sketch} sk @param {number} id */
export function removeWall(sk, id) {
  sk.walls = sk.walls.filter((w) => w.id !== id);
  sk.openings = sk.openings.filter((o) => o.wall !== id);
}

/** @param {Sketch} sk @param {number} id */
export function removeOpening(sk, id) { sk.openings = sk.openings.filter((o) => o.id !== id); }

/** @param {Sketch} sk @param {SketchOpening} o @returns {{ a: Pt, b: Pt }} the opening's two ends on its wall */
export function openingEnds(sk, o) {
  const w = /** @type {SketchWall} */ (sk.walls.find((x) => x.id === o.wall));
  const L = len(w), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
  return { a: { x: w.a.x + ux * o.offset, y: w.a.y + uy * o.offset }, b: { x: w.a.x + ux * (o.offset + o.width), y: w.a.y + uy * (o.offset + o.width) } };
}

/**
 * The sketch as an ASCII DXF in inches: walls on WALLS, doors on DOORS,
 * windows on WINDOWS. y is flipped so the file reads as the drawing looks.
 * @param {Sketch} sk
 */
export function sketchToDxf(sk) {
  const g = (c, v) => `${c}\n${v}\n`;
  const line = (layer, a, b) => g(0, "LINE") + g(8, layer) + g(10, a.x) + g(20, -a.y) + g(30, 0) + g(11, b.x) + g(21, -b.y) + g(31, 0);
  let s = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, 1) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  for (const w of sk.walls) s += line("WALLS", w.a, w.b);
  for (const o of sk.openings) {
    if (!sk.walls.some((w) => w.id === o.wall)) continue;
    const e = openingEnds(sk, o);
    s += line(o.kind === "door" ? "DOORS" : "WINDOWS", e.a, e.b);
  }
  return s + g(0, "ENDSEC") + g(0, "EOF");
}

/**
 * The takeoff plan for a sketch: the same result shape as `planFromDxf`.
 * @param {Sketch} sk
 * @param {Parameters<typeof planFromDxf>[1]} [opt]
 */
export function planFromSketch(sk, opt = {}) {
  if (!sk.walls.length) return { ok: false, errors: ["Draw at least one wall first."], notes: [] };
  return planFromDxf(sketchToDxf(sk), { units: "in", ...opt });
}

/** Total centre-line length of the sketch's walls, inches. @param {Sketch} sk */
export const totalLength = (sk) => sk.walls.reduce((t, w) => t + len(w), 0);

/** One-line description of a wall for labels: its length. @param {SketchWall} w */
export const wallLength = (w) => len(w);
