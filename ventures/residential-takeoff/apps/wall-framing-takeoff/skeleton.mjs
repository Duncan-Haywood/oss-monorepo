// @ts-check
// Ridges, hips and valleys of an all-hip roof over an outline with sides at ANY angle
// (bay windows, 45-degree corners, a wing set at an angle), not only square to the axes.
//
// Every plane rises at one pitch from a level eave, so the roof is the straight skeleton of
// the eave line: move every side inward at one unit per unit of time, each corner sliding
// along the bisector of its two sides (an outside corner draws a hip, an inside corner a
// valley); the roof's height at a point is (pitch / 12) times the time the moving outline
// passes over it. Events are a side shrinking to nothing (two corners meet: an edge event),
// a corner reaching another side (the outline splits in two: a split event) and two facing
// sides reaching each other (the part they share is a level ridge at that height).
//
// Events are not handled one by one with a case for each: after each step the moved outline
// is rebuilt from its geometry (`rebuild`): corners within a tolerance are welded, a corner
// lying on a side splits it, a stretch traced in both directions (two facing sides now on one
// line) is taken out as a ridge, and the rest is traced into counter-clockwise loops, turning
// as far left as possible where loops touch, so touching loops come apart. Each side keeps the
// original eave side it moves with, so the corners' velocities after an event are exact.
// hiproof.mjs does the same for square-cornered outlines on a grid; this file reproduces its
// lines for those (skeleton.test.mjs, 300 random outlines, also turned to random angles).
//
// `skeletonRoofLines(points, pitch)` takes a counter-clockwise simple polygon in inches.

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ kind: "hip" | "valley" | "ridge", x0: number, y0: number, z0: number, x1: number, y1: number, z1: number }} Line */
/** @typedef {{ nx: number, ny: number, c: number }} Side a moving eave side: n . p = c, n the inward unit normal */
/** @typedef {{ pts: Pt[], sides: Side[] }} Loop side i runs from pts[i] to pts[i + 1] */

/**
 * @param {Pt[]} points counter-clockwise, no side crossing another
 * @param {number} pitch rise in 12
 * @returns {{ ok: true, lines: Line[], ridgePlanIn: number, hipPlanIn: number, valleyPlanIn: number, ridgeFeet: number, hipFeet: number, valleyFeet: number, hips: number, valleys: number, ridges: number, peakIn: number, volumeCuIn: number, events: number } | { ok: false, error: string }}
 */
export function skeletonRoofLines(points, pitch) {
  const rise = pitch / 12;
  if (!(points.length >= 3)) return { ok: false, error: "The outline needs at least 3 corners." };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const scale = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const eps = 1e-9 * scale; // welding distance; inches for a house
  /** @type {Line[]} */
  const raw = [];
  const first = loopFromPoints(points);
  if (!first) return { ok: false, error: "The outline has a side of no length." };
  let loops = rebuild([first], eps, 0, raw);
  let t = 0, volume = 0, events = 0;
  const limit = 40 * points.length + 200;
  while (loops.length) {
    if (++events > limit) return { ok: false, error: `The roof lines did not resolve within ${limit} steps; this outline is not handled.` };
    const vel = loops.map(velocities);
    let dt = Infinity;
    loops.forEach((l, k) => { const d = nextEvent(l, vel[k], eps); if (d < dt) dt = d; });
    if (!Number.isFinite(dt)) return { ok: false, error: "The roof contour stopped shrinking; this outline is not handled." };
    // the area of each loop is a quadratic in time between events, so Simpson's rule is exact
    loops.forEach((l, k) => {
      const at = (/** @type {number} */ s) => area(l.pts.map((p, i) => ({ x: p.x + s * vel[k][i].x, y: p.y + s * vel[k][i].y })));
      volume += (dt / 6) * (at(0) + 4 * at(dt / 2) + at(dt));
    });
    /** @type {Loop[]} */
    const moved = loops.map((l, k) => {
      const pts = l.pts.map((p, i) => {
        const q = { x: p.x + dt * vel[k][i].x, y: p.y + dt * vel[k][i].y };
        if (Math.hypot(q.x - p.x, q.y - p.y) > eps) raw.push({ kind: vel[k][i].convex ? "hip" : "valley", x0: p.x, y0: p.y, z0: t, x1: q.x, y1: q.y, z1: t + dt });
        return q;
      });
      return { pts, sides: l.sides.map((s) => ({ ...s, c: s.c + dt })) };
    });
    t += dt;
    loops = rebuild(moved, eps, t, raw);
  }
  const lines = merge(raw, 1e3 * eps).map((l) => ({ ...l, z0: l.z0 * rise, z1: l.z1 * rise }));
  let ridgePlanIn = 0, hipPlanIn = 0, valleyPlanIn = 0, hipIn = 0, valleyIn = 0;
  for (const l of lines) {
    const plan = Math.hypot(l.x1 - l.x0, l.y1 - l.y0), along = Math.hypot(plan, l.z1 - l.z0);
    if (l.kind === "ridge") ridgePlanIn += plan;
    else if (l.kind === "hip") { hipPlanIn += plan; hipIn += along; }
    else { valleyPlanIn += plan; valleyIn += along; }
  }
  return {
    ok: true, lines, ridgePlanIn, hipPlanIn, valleyPlanIn,
    ridgeFeet: ridgePlanIn / 12, hipFeet: hipIn / 12, valleyFeet: valleyIn / 12,
    hips: lines.filter((l) => l.kind === "hip").length, valleys: lines.filter((l) => l.kind === "valley").length, ridges: lines.filter((l) => l.kind === "ridge").length,
    peakIn: t * rise, volumeCuIn: volume * rise, events,
  };
}

/** @param {Pt[]} pts @returns {Loop | null} */
function loopFromPoints(pts) {
  /** @type {Side[]} */
  const sides = [];
  for (let i = 0; i < pts.length; i++) {
    const s = sideThrough(pts[i], pts[(i + 1) % pts.length]);
    if (!s) return null;
    sides.push(s);
  }
  return { pts: pts.map((p) => ({ x: p.x, y: p.y })), sides };
}

/** The side from a to b, inside on the left. @param {Pt} a @param {Pt} b @returns {Side | null} */
function sideThrough(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  if (!(L > 0)) return null;
  const nx = -dy / L, ny = dx / L;
  return { nx, ny, c: nx * a.x + ny * a.y };
}

/** Each corner's velocity (it stays on both its sides' moving lines) and whether it is an outside corner. @param {Loop} l */
function velocities(l) {
  const n = l.pts.length;
  return l.pts.map((_, i) => {
    const a = l.sides[(i + n - 1) % n], b = l.sides[i];
    const det = a.nx * b.ny - a.ny * b.nx;
    // direction of travel along each side is (ny, -nx); cross of in and out > 0 is a left (outside) turn
    const convex = det > 0;
    if (Math.abs(det) < 1e-12) return { x: a.nx, y: a.ny, convex: true }; // straight through (rebuild removes these)
    return { x: (b.ny - a.ny) / det, y: (a.nx - b.nx) / det, convex };
  });
}

/**
 * Smallest time > 0 until a side of the loop shrinks to nothing or a corner reaches a side
 * it is not on (touching counts).
 * @param {Loop} l @param {{ x: number, y: number }[]} v @param {number} eps
 */
function nextEvent(l, v, eps) {
  const n = l.pts.length, P = l.pts;
  let best = Infinity;
  const tmin = 1e-12;
  for (let i = 0; i < n; i++) {
    const s = l.sides[i], j1 = (i + 1) % n, dx = s.ny, dy = -s.nx;
    const len = dx * (P[j1].x - P[i].x) + dy * (P[j1].y - P[i].y), rate = dx * (v[j1].x - v[i].x) + dy * (v[j1].y - v[i].y);
    if (rate < -1e-12) { const d = len / -rate; if (d > tmin && d < best) best = d; }
    for (let j = 0; j < n; j++) {
      if (j === i || j === j1) continue;
      const f0 = s.nx * P[j].x + s.ny * P[j].y - s.c, fr = s.nx * v[j].x + s.ny * v[j].y - 1;
      if (f0 < -eps || fr > -1e-12) continue;
      const d = Math.max(0, f0) / -fr;
      if (!(d > tmin && d < best)) continue;
      const ax = P[i].x + d * v[i].x, ay = P[i].y + d * v[i].y, bx = P[j1].x + d * v[j1].x, by = P[j1].y + d * v[j1].y;
      const qx = P[j].x + d * v[j].x, qy = P[j].y + d * v[j].y;
      const L = dx * (bx - ax) + dy * (by - ay), at = dx * (qx - ax) + dy * (qy - ay), tol = 1e3 * eps;
      if (L >= -tol && at >= -tol && at <= L + tol) best = d;
    }
  }
  return best;
}

/** Signed area. @param {Pt[]} p */
function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/**
 * The moved outline as clean counter-clockwise loops: corners welded, sides split where a
 * corner lies on them, stretches traced both ways taken out (pushed to `raw` as ridges at
 * time t), the rest traced turning furthest left, straight-through corners removed, and
 * loops with no area dropped.
 * @param {Loop[]} loops @param {number} eps @param {number} t @param {Line[]} raw
 * @returns {Loop[]}
 */
export function rebuild(loops, eps, t, raw) {
  const weld = 1e3 * eps;
  /** @type {Pt[]} */
  const nodes = [];
  const node = (/** @type {Pt} */ p) => {
    for (let k = 0; k < nodes.length; k++) if (Math.abs(nodes[k].x - p.x) <= weld && Math.abs(nodes[k].y - p.y) <= weld) return k;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  /** @type {{ u: number, v: number, side: Side }[]} */
  let segs = [];
  for (const l of loops) {
    const n = l.pts.length;
    for (let i = 0; i < n; i++) {
      const u = node(l.pts[i]), v = node(l.pts[(i + 1) % n]);
      if (u !== v) segs.push({ u, v, side: l.sides[i] });
    }
  }
  // sides crossing each other (only a numerical overshoot does this): a node at the crossing
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    if (A.u === B.u || A.u === B.v || A.v === B.u || A.v === B.v) continue;
    const p = crossAt(nodes[A.u], nodes[A.v], nodes[B.u], nodes[B.v]);
    if (p) node(p);
  }
  // split every side at the nodes lying on it
  /** @type {{ u: number, v: number, side: Side }[]} */
  const split = [];
  for (const s of segs) {
    const a = nodes[s.u], b = nodes[s.v], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const on = [];
    for (let k = 0; k < nodes.length; k++) {
      if (k === s.u || k === s.v) continue;
      const q = nodes[k], f = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2;
      if (f <= 0 || f >= 1) continue;
      if (Math.abs((q.x - a.x) * dy - (q.y - a.y) * dx) / Math.sqrt(L2) <= weld) on.push({ k, f });
    }
    on.sort((m, n) => m.f - n.f);
    let prev = s.u;
    for (const o of on) { if (o.k !== prev) split.push({ u: prev, v: o.k, side: s.side }); prev = o.k; }
    if (prev !== s.v) split.push({ u: prev, v: s.v, side: s.side });
  }
  segs = split;
  // a stretch traced both ways is two facing sides that met: a ridge
  const gone = new Set();
  for (let i = 0; i < segs.length; i++) {
    if (gone.has(i)) continue;
    for (let j = i + 1; j < segs.length; j++) {
      if (gone.has(j) || segs[j].u !== segs[i].v || segs[j].v !== segs[i].u) continue;
      gone.add(i); gone.add(j);
      const a = nodes[segs[i].u], b = nodes[segs[i].v];
      raw.push({ kind: "ridge", x0: a.x, y0: a.y, z0: t, x1: b.x, y1: b.y, z1: t });
      break;
    }
  }
  const live = segs.filter((_, i) => !gone.has(i));
  /** @type {Map<number, number[]>} */
  const out = new Map();
  live.forEach((s, i) => { const o = out.get(s.u); if (o) o.push(i); else out.set(s.u, [i]); });
  const used = new Set();
  /** @type {Loop[]} */
  const result = [];
  for (let e0 = 0; e0 < live.length; e0++) {
    if (used.has(e0)) continue;
    const chain = [e0];
    used.add(e0);
    let cur = e0, closed = false;
    for (let guard = 0; guard <= live.length; guard++) {
      const s = live[cur], a = nodes[s.u], b = nodes[s.v];
      const din = { x: b.x - a.x, y: b.y - a.y };
      const cand = (out.get(s.v) || []).filter((k) => !used.has(k) || (k === e0 && live[e0].u === s.v));
      if (!cand.length) break;
      let pick = -1, bestTurn = -Infinity;
      for (const k of cand) {
        const c = nodes[live[k].v], dout = { x: c.x - b.x, y: c.y - b.y };
        const turn = Math.atan2(din.x * dout.y - din.y * dout.x, din.x * dout.x + din.y * dout.y);
        if (turn > bestTurn) { bestTurn = turn; pick = k; }
      }
      if (pick === e0) { closed = true; break; }
      used.add(pick);
      chain.push(pick);
      cur = pick;
    }
    if (!closed) continue;
    const loop = simplify(chain.map((k) => ({ p: nodes[live[k].u], side: live[k].side })), weld);
    if (loop && area(loop.pts) > weld * weld) result.push(loop);
    else if (loop) for (let i = 0; i < loop.pts.length; i++) {
      // a sliver too thin to be a loop, which the welding did not pair up: its sides are a ridge
      const a = loop.pts[i], b = loop.pts[(i + 1) % loop.pts.length];
      raw.push({ kind: "ridge", x0: a.x, y0: a.y, z0: t, x1: b.x, y1: b.y, z1: t });
    }
  }
  return result;
}

/** Remove corners where the outline runs straight on. @param {{ p: Pt, side: Side }[]} ring @param {number} weld @returns {Loop | null} */
function simplify(ring, weld) {
  let r = ring.slice();
  for (let changed = true; changed && r.length >= 3;) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const prev = r[(i + r.length - 1) % r.length], cur = r[i];
      const det = prev.side.nx * cur.side.ny - prev.side.ny * cur.side.nx, dot = prev.side.nx * cur.side.nx + prev.side.ny * cur.side.ny;
      // same direction and the corner on the earlier side's line: one side
      if (Math.abs(det) < 1e-9 && dot > 0 && Math.abs(prev.side.nx * cur.p.x + prev.side.ny * cur.p.y - prev.side.c) <= weld) { r.splice(i, 1); changed = true; break; }
    }
  }
  if (r.length < 3) return null;
  return { pts: r.map((x) => ({ x: x.p.x, y: x.p.y })), sides: r.map((x) => x.side) };
}

/** Where segment ab properly crosses cd, or null. @param {Pt} a @param {Pt} b @param {Pt} c @param {Pt} d */
function crossAt(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-15) return null;
  const u = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, w = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (u <= 1e-12 || u >= 1 - 1e-12 || w <= 1e-12 || w >= 1 - 1e-12) return null;
  return { x: a.x + u * rx, y: a.y + u * ry };
}

/**
 * Join pieces of one line: same kind, end to start, in one direction (a corner's path cut at
 * events it passed straight through), and ridges at one height lying on one line and
 * touching or overlapping (a ridge taken out in parts).
 * @param {Line[]} raw @param {number} tol
 */
function merge(raw, tol) {
  const ls = raw.map((l) => ({ ...l }));
  const close = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= tol;
  const dir = (/** @type {Line} */ l) => { const L = Math.hypot(l.x1 - l.x0, l.y1 - l.y0, l.z1 - l.z0); return { x: (l.x1 - l.x0) / L, y: (l.y1 - l.y0) / L, z: (l.z1 - l.z0) / L }; };
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < ls.length; i++) for (let j = 0; j < ls.length; j++) {
      if (i === j) continue;
      const a = ls[i], b = ls[j];
      if (a.kind !== b.kind) continue;
      if (a.kind === "ridge") {
        if (!close(a.z0, b.z0)) continue;
        const da = dir(a);
        // b on a's line?
        const off = (/** @type {number} */ x, /** @type {number} */ y) => Math.abs((x - a.x0) * da.y - (y - a.y0) * da.x);
        if (off(b.x0, b.y0) > tol || off(b.x1, b.y1) > tol) continue;
        const pr = (/** @type {number} */ x, /** @type {number} */ y) => (x - a.x0) * da.x + (y - a.y0) * da.y;
        const a1 = pr(a.x1, a.y1), b0 = pr(b.x0, b.y0), b1 = pr(b.x1, b.y1);
        const lo = Math.min(b0, b1), hi = Math.max(b0, b1);
        if (lo > a1 + tol || hi < -tol) continue;
        const s0 = Math.min(0, lo), s1 = Math.max(a1, hi), x0 = a.x0, y0 = a.y0;
        a.x0 = x0 + s0 * da.x; a.y0 = y0 + s0 * da.y; a.x1 = x0 + s1 * da.x; a.y1 = y0 + s1 * da.y;
      } else {
        if (!close(a.x1, b.x0) || !close(a.y1, b.y0) || !close(a.z1, b.z0)) continue;
        const da = dir(a), db = dir(b);
        if (Math.abs(da.x - db.x) > 1e-7 || Math.abs(da.y - db.y) > 1e-7 || Math.abs(da.z - db.z) > 1e-7) continue;
        a.x1 = b.x1; a.y1 = b.y1; a.z1 = b.z1;
      }
      ls.splice(j, 1);
      changed = true;
      break outer;
    }
  }
  return ls.filter((l) => Math.hypot(l.x1 - l.x0, l.y1 - l.y0) > tol);
}
