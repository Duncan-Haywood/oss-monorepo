// Is a wall on the building's outside? A test from the geometry, for walls
// whose model does not say (no IsExternal in Pset_WallCommon) or says the
// same thing of every wall.
//
// Each wall is read in plan as an oriented rectangle: its points in world
// coordinates projected on the ground plane, with the direction in which they
// are thinnest taken as its thickness. Curtain walls, upright plates and
// members, and doors and windows that fill no wall's opening are read the
// same way. From nine points spread along each face of a wall, at a height
// inside it, rays are cast away from the face in a fan (straight out and 30
// and 60 degrees either side). A ray that crosses none of those rectangles at
// that height leaves the building. A face is open at a point when one of its
// rays leaves; a wall is exterior when one of its faces is open at half its
// points or more.
//
// Doors and windows do not let rays through: the rectangles are the walls'
// whole bodies, openings included, so a partition seen through a door is
// still inside. What it cannot see: a courtyard closed on all sides (its
// walls read as interior), a site wall or fence in front of a facade (that
// facade can read as interior), a facade with gaps in its model (partitions
// behind a gap read as exterior), and a building modelled without its outer
// walls.

import { apply, solidPoints } from "./geom.mjs";

const STEPS = 90; // directions tried for the thinnest one (2 degrees apart)

/**
 * The plan rectangle of a body under world matrix W (model length unit f):
 * { c: [x, y], u: [ux, uy] (along the wall), hl, ht (half length and half
 * thickness), z0, z1 } in metres, or null when the body has no points.
 */
export function planRect(body, W, f = 1) {
  const pts = [];
  let z0 = Infinity, z1 = -Infinity;
  for (const p of solidPoints(body)) {
    const q = apply(W, p);
    pts.push(q[0] * f, q[1] * f);
    if (q[2] * f < z0) z0 = q[2] * f;
    if (q[2] * f > z1) z1 = q[2] * f;
  }
  if (!pts.length) return null;
  const ext = (a) => {
    const nx = Math.cos(a), ny = Math.sin(a);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { const d = pts[i] * nx + pts[i + 1] * ny; if (d < lo) lo = d; if (d > hi) hi = d; }
    return [lo, hi];
  };
  let best = 0, bw = Infinity;
  for (let k = 0; k < STEPS; k++) { const a = (k * Math.PI) / STEPS; const [lo, hi] = ext(a); if (hi - lo < bw) { bw = hi - lo; best = a; } }
  // refine to a tenth of a degree around the best step
  for (let d = -10; d <= 10; d++) { const a = best + (d * Math.PI) / STEPS / 10; const [lo, hi] = ext(a); if (hi - lo < bw - 1e-12) { bw = hi - lo; best = a; } }
  const n = [Math.cos(best), Math.sin(best)], u = [-n[1], n[0]];
  const [nlo, nhi] = ext(best), [ulo, uhi] = ext(best + Math.PI / 2);
  const cn = (nlo + nhi) / 2, cu = (ulo + uhi) / 2;
  return { c: [cn * n[0] + cu * u[0], cn * n[1] + cu * u[1]], u, hl: (uhi - ulo) / 2, ht: (nhi - nlo) / 2, z0, z1 };
}

// distance along a ray (origin o, unit direction d) to an oriented
// rectangle grown by `pad`, or Infinity when it misses
function rayHit(o, d, r, pad) {
  const n = [-r.u[1], r.u[0]];
  const rx = o[0] - r.c[0], ry = o[1] - r.c[1];
  let t0 = 0, t1 = Infinity;
  for (const [ax, h] of [[r.u, r.hl + pad], [n, r.ht + pad]]) {
    const p = rx * ax[0] + ry * ax[1], v = d[0] * ax[0] + d[1] * ax[1];
    if (Math.abs(v) < 1e-12) { if (p < -h || p > h) return Infinity; continue; }
    let a = (-h - p) / v, b = (h - p) / v;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

const LEAF_GAP = 0.3; // m: the widest cavity between two leaves of one wall
const LEAF_COS = Math.cos((5 * Math.PI) / 180);
/** b is another leaf of wall p: parallel, beside it and overlapping it along its length. */
export function isLeaf(p, b) {
  if (Math.abs(p.u[0] * b.u[0] + p.u[1] * b.u[1]) < LEAF_COS) return false;
  const dx = b.c[0] - p.c[0], dy = b.c[1] - p.c[1];
  const off = Math.abs(-p.u[1] * dx + p.u[0] * dy), along = Math.abs(p.u[0] * dx + p.u[1] * dy);
  return off <= p.ht + b.ht + LEAF_GAP && along < p.hl + b.hl - 0.1;
}

const UPRIGHT_FILL = 0.5;
const UNIFORM_MIN = 10, UNIFORM_SHARE = 0.2;

const FAN = [0, 30, -30, 60, -60].map((a) => (a * Math.PI) / 180);
const SAMPLES = 9;
const PAD = 0.05; // m: walls drawn to meet at a corner rarely meet exactly

/**
 * What stops a ray: walls, curtain walls, and the pieces of a facade that
 * may stand outside any wall: plates and members standing upright (glazing
 * panels and mullions, filling half or more of their upright box, which some exporters write with no curtain wall
 * around them) and doors or windows that fill no wall's opening.
 */
export function isBlocker(r) {
  const c = r.effectiveClass || r.ifcType || "", p = r.plan;
  if (/^IFCWALL|^IFCCURTAINWALL$/.test(c)) return true;
  if (/^IFC(PLATE|MEMBER)/.test(c)) {
    // upright: tall, thin in plan, and filling most of its upright box (a
    // sloped rafter or roof panel fills a small share of it)
    const boxV = 4 * p.hl * p.ht * (p.z1 - p.z0), v = r.computed?.gross;
    return p.z1 - p.z0 > 0.5 && p.ht < 0.15 && v > 0 && v >= UPRIGHT_FILL * boxV;
  }
  if (/^IFC(DOOR|WINDOW)/.test(c)) return r.host == null;
  return false;
}

/**
 * Sets row.envelope = { exterior, open, points, side, leaf } on every wall
 * row that has a plan rectangle: `open` is how many of the `points` on its
 * more open face had a ray leave the building; `leaf` is true when it reads
 * exterior only with its other leaves seen through (an inner leaf, or a
 * lining on the inside of an exterior wall); `flagSaysNothing` is true on
 * every wall of a model whose IsExternal is the same on all its walls while
 * the geometry reads a fifth or more of them the other way.
 */
export function assignEnvelope(rows) {
  const blockers = rows.filter((r) => r.plan && isBlocker(r));
  for (const w of rows) {
    if (!w.plan || !/^IFCWALL/.test(w.effectiveClass || w.ifcType || "")) continue;
    const p = w.plan;
    if (!(p.hl > 0.05)) continue;
    const zr = p.z0 + Math.min(1.2, (p.z1 - p.z0) / 2); // a height inside the wall
    const near = blockers.filter((b) => b !== w && b.plan.z0 <= zr && b.plan.z1 >= zr);
    // other leaves of the same wall (a brick skin and its inner leaf, or a
    // lining on a wall, modelled as two walls) are seen through, so an inner
    // leaf is read with its skin
    const apart = near.filter((b) => !isLeaf(p, b.plan));
    const own = openCount(p, apart);
    const side = own[0] >= own[1] ? 0 : 1;
    const exterior = own[side] * 2 >= SAMPLES;
    // read on its own, would it be inside? then it is a lining or inner leaf
    const alone = exterior && apart.length < near.length ? Math.max(...openCount(p, near)) : own[side];
    w.envelope = { exterior, open: own[side], points: SAMPLES, side: side ? "-" : "+", leaf: exterior && alone * 2 < SAMPLES, flagSaysNothing: false };
  }
  // A model that flags every wall the same way (HHS Office's architect
  // model and advanced_model flag all their walls IsExternal, partitions
  // included) says nothing with the flag; when the geometry reads a fifth or
  // more of those walls the other way, the flag is set aside for them all.
  const read = rows.filter((r) => r.envelope && r.isExternal != null);
  const flags = new Set(read.map((r) => r.isExternal));
  if (read.length >= UNIFORM_MIN && flags.size === 1) {
    const other = read.filter((r) => r.envelope.exterior !== r.isExternal).length;
    if (other >= read.length * UNIFORM_SHARE) for (const r of read) r.envelope.flagSaysNothing = true;
  }
  return rows;
}

const RAIL_RAY = 0.5; // m above a railing's bottom: where its rays are cast
const RAIL_NEAR = 4; // fewest walls at that height for the test to be read

/**
 * Sets row.railSide = { exterior, open, points, near } on every railing row
 * with a plan rectangle: the same rays as a wall's, cast from both faces of
 * the railing at RAIL_RAY above its bottom (or half its height when it is
 * lower), with walls, curtain walls and facade pieces as blockers. A railing
 * one of whose faces is open at half its points or more stands outside the
 * building (a balcony or roof guard); one closed on both faces stands inside
 * (a gallery or void edge). Nothing is set where fewer than RAIL_NEAR
 * blockers reach that height (a railing above every wall, or a model
 * without walls), nor in a model with no door or window.
 */
export function assignRailingSides(rows) {
  // a model with no door or window is not an architect's model (HHS Office's
  // structural model): its walls are not the building's envelope
  if (!rows.some((r) => /^IFC(DOOR|WINDOW)/.test(r.effectiveClass || r.ifcType || ""))) return rows;
  const blockers = rows.filter((r) => r.plan && isBlocker(r));
  for (const r of rows) {
    if (!r.plan || r.isAssembly || (r.effectiveClass || r.ifcType) !== "IFCRAILING") continue;
    const p = r.plan;
    if (!(p.hl > 0.05)) continue;
    const zr = p.z0 + Math.min(RAIL_RAY, (p.z1 - p.z0) / 2);
    const near = blockers.filter((b) => b.plan.z0 <= zr && b.plan.z1 >= zr);
    if (near.length < RAIL_NEAR) continue;
    const own = openCount(p, near);
    const open = Math.max(own[0], own[1]);
    r.railSide = { exterior: open * 2 >= SAMPLES, open, points: SAMPLES, near: near.length };
  }
  return rows;
}

// how many sample points on each face of p have a ray that crosses nothing
function openCount(p, near) {
  const n = [-p.u[1], p.u[0]];
  const open = [0, 0];
  for (let k = 0; k < SAMPLES; k++) {
    const s = ((k + 0.5) / SAMPLES) * 2 - 1;
    const base = [p.c[0] + p.u[0] * s * p.hl, p.c[1] + p.u[1] * s * p.hl];
    for (const [side, sg] of [[0, 1], [1, -1]]) {
      const o = [base[0] + n[0] * sg * (p.ht + 0.01), base[1] + n[1] * sg * (p.ht + 0.01)];
      for (const a of FAN) {
        const dx = n[0] * sg, dy = n[1] * sg;
        const d = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
        if (near.every((b) => rayHit(o, d, b.plan, PAD) === Infinity)) { open[side]++; break; }
      }
    }
  }
  return open;
}
