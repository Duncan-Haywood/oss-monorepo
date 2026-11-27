// @ts-check
// Ridges, hips and valleys of an all-hip roof over ANY square-cornered outline.
//
// Every roof plane rises at one pitch from a level eave. Over a square-cornered
// eave line the height of the roof at a point is then (pitch / 12) times the
// largest t for which the square of half-side t centred on the point stays inside
// the eave line (the L-infinity distance to the eave): at an outside corner two
// planes meet on a 45-degree hip, at an inside corner on a 45-degree valley, and
// where two facing eaves' planes meet the roof has a level ridge.
//
// The roof is found by moving every eave side inward at one unit per unit of time
// (the contour of the roof at height t x pitch / 12). Between events each corner
// slides along a 45-degree line: an outside corner draws a hip, an inside corner a
// valley. An event is two facing sides becoming one line: the part they share is a
// ridge at that height, and the contour is rebuilt from what still has area (it may
// split in two). It ends when nothing is left. Every number is exact for that roof
// shape up to floating point; nothing here decides a pitch, a bearing or a structure.
//
// `hipRoofLines(points, pitch)` takes a counter-clockwise square-cornered outline (as
// `readOutline` in roofoutline.mjs returns) in inches.

const EPS = 1e-6;

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ kind: "hip" | "valley" | "ridge", x0: number, y0: number, z0: number, x1: number, y1: number, z1: number }} Line */

/**
 * @param {Pt[]} points counter-clockwise, every side along x or y
 * @param {number} pitch rise in 12
 * @returns {{ ok: true, lines: Line[], ridgePlanIn: number, hipPlanIn: number, valleyPlanIn: number, ridgeFeet: number, hipFeet: number, valleyFeet: number, hips: number, valleys: number, ridges: number, peakIn: number, volumeCuIn: number, events: number } | { ok: false, error: string }}
 */
export function hipRoofLines(points, pitch) {
  const rise = pitch / 12;
  /** @type {Pt[][]} */
  let loops = [clean(points.map((p) => ({ x: p.x, y: p.y })))].filter((l) => l.length >= 4);
  /** @type {Line[]} */
  const raw = [];
  let t = 0, volume = 0, events = 0;
  const limit = 20 * points.length + 100;
  while (loops.length) {
    if (++events > limit) return { ok: false, error: `The roof lines did not resolve within ${limit} steps; this outline is not handled.` };
    const verts = loops.map(vertices);
    // the next time two facing sides of one loop meet
    let dt = Infinity;
    for (const v of verts) {
      const d = nextMeeting(v);
      if (d < dt) dt = d;
    }
    if (!Number.isFinite(dt)) return { ok: false, error: "The roof contour stopped shrinking; this outline is not handled." };
    // area shrinks as A - P s + 4 s^2 per loop between events (each loop has four more outside corners than inside)
    for (const l of loops) { const { area, perimeter } = areaPer(l); volume += area * dt - perimeter * dt * dt / 2 + 4 * dt * dt * dt / 3; }
    const moved = verts.map((v) => v.map((c) => ({ x: c.x + dt * c.vx, y: c.y + dt * c.vy, convex: c.convex, x0: c.x, y0: c.y })));
    for (const v of moved) for (const c of v) {
      if (Math.abs(c.x - c.x0) > EPS) raw.push({ kind: c.convex ? "hip" : "valley", x0: c.x0, y0: c.y0, z0: t, x1: c.x, y1: c.y, z1: t + dt });
    }
    t += dt;
    // ridges: facing sides now on one line, the part they share
    for (const v of moved) {
      const n = v.length;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a = v[i], a2 = v[(i + 1) % n], b = v[j], b2 = v[(j + 1) % n];
        // a: bottom side (runs +x) or left side (runs -y); b: top side (runs -x) or right side (runs +y)
        if (a2.x - a.x > EPS && b.x - b2.x > EPS && Math.abs(a.y - b.y) <= 10 * EPS) {
          const lo = Math.max(a.x, b2.x), hi = Math.min(a2.x, b.x);
          if (hi - lo > 10 * EPS) raw.push({ kind: "ridge", x0: lo, y0: a.y, z0: t, x1: hi, y1: a.y, z1: t });
        } else if (a.y - a2.y > EPS && b2.y - b.y > EPS && Math.abs(a.x - b.x) <= 10 * EPS) {
          const lo = Math.max(a2.y, b.y), hi = Math.min(a.y, b2.y);
          if (hi - lo > 10 * EPS) raw.push({ kind: "ridge", x0: a.x, y0: lo, z0: t, x1: a.x, y1: hi, z1: t });
        }
      }
    }
    loops = regularize(moved.map((v) => v.map((c) => ({ x: c.x, y: c.y }))));
  }
  const lines = merge(raw).map((l) => ({ ...l, z0: l.z0 * rise, z1: l.z1 * rise }));
  const slope = Math.sqrt(2 + rise * rise); // a 45-degree line rising `rise` per unit of run along one axis
  let ridgePlanIn = 0, hipPlanIn = 0, valleyPlanIn = 0, hipIn = 0, valleyIn = 0;
  for (const l of lines) {
    const run = Math.abs(l.x1 - l.x0), plan = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    if (l.kind === "ridge") ridgePlanIn += plan;
    else if (l.kind === "hip") { hipPlanIn += plan; hipIn += run * slope; }
    else { valleyPlanIn += plan; valleyIn += run * slope; }
  }
  return {
    ok: true, lines, ridgePlanIn, hipPlanIn, valleyPlanIn,
    ridgeFeet: ridgePlanIn / 12, hipFeet: hipIn / 12, valleyFeet: valleyIn / 12,
    hips: lines.filter((l) => l.kind === "hip").length, valleys: lines.filter((l) => l.kind === "valley").length, ridges: lines.filter((l) => l.kind === "ridge").length,
    peakIn: t * rise, volumeCuIn: volume * rise, events,
  };
}

/** Corners with their inward velocity (sum of the two sides' inward normals) and whether they are outside corners. @param {Pt[]} l */
function vertices(l) {
  const n = l.length;
  const dir = (i) => { const a = l[i], b = l[(i + 1) % n]; return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }; };
  return l.map((c, i) => {
    const p = dir((i + n - 1) % n), q = dir(i);
    return { x: c.x, y: c.y, vx: -p.y - q.y, vy: p.x + q.x, convex: p.x * q.y - p.y * q.x > 0 };
  });
}

/**
 * Smallest time > 0 at which a bottom side meets a top side (or a left side a right side)
 * of the same loop while their spans still overlap (touching counts).
 * @param {ReturnType<typeof vertices>} v
 */
function nextMeeting(v) {
  const n = v.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = v[i], a2 = v[(i + 1) % n];
    const bottom = a2.x - a.x > EPS, left = a.y - a2.y > EPS;
    if (!bottom && !left) continue;
    for (let j = 0; j < n; j++) {
      const b = v[j], b2 = v[(j + 1) % n];
      if (bottom && b.x - b2.x > EPS && b.y - a.y > EPS) {
        const d = (b.y - a.y) / 2;
        if (d >= best) continue;
        const lo = Math.max(a.x + d * a.vx, b2.x + d * b2.vx), hi = Math.min(a2.x + d * a2.vx, b.x + d * b.vx);
        if (hi - lo >= -10 * EPS) best = d;
      } else if (left && b2.y - b.y > EPS && b.x - a.x > EPS) {
        const d = (b.x - a.x) / 2;
        if (d >= best) continue;
        const lo = Math.max(a2.y + d * a2.vy, b.y + d * b.vy), hi = Math.min(a.y + d * a.vy, b2.y + d * b2.vy);
        if (hi - lo >= -10 * EPS) best = d;
      }
    }
  }
  return best;
}

/** @param {Pt[]} l */
function areaPer(l) {
  let s = 0, per = 0;
  for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a.x * b.y - b.x * a.y; per += Math.abs(b.x - a.x) + Math.abs(b.y - a.y); }
  return { area: s / 2, perimeter: per };
}

/** Sorted distinct values, near-equal ones merged. @param {number[]} vs */
function distinct(vs) {
  const s = [...vs].sort((m, n) => m - n), out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > 10 * EPS) out.push(v);
  return out;
}

/** Index of the merged value nearest v. @param {number[]} s @param {number} v */
function idx(s, v) {
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v - 10 * EPS) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * The parts of a set of (possibly touching or zero-width) square-cornered loops that still
 * have area, as counter-clockwise loops. Built on the grid of their coordinates: a cell is in
 * when the even-odd rule puts its centre inside; zero-width slivers have no cells. Loops that
 * meet at one corner come out as separate loops.
 * @param {Pt[][]} loops
 * @returns {Pt[][]}
 */
export function regularize(loops) {
  const xs = distinct(loops.flatMap((l) => l.map((p) => p.x))), ys = distinct(loops.flatMap((l) => l.map((p) => p.y)));
  const W = xs.length - 1, H = ys.length - 1;
  if (W < 1 || H < 1) return [];
  /** @type {{ x: number, y0: number, y1: number }[]} */
  const vert = [];
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    if (Math.abs(a.x - b.x) <= 10 * EPS && Math.abs(a.y - b.y) > 10 * EPS) vert.push({ x: idx(xs, a.x), y0: Math.min(idx(ys, a.y), idx(ys, b.y)), y1: Math.max(idx(ys, a.y), idx(ys, b.y)) });
  }
  const inside = new Uint8Array(W * H);
  let any = false;
  for (let j = 0; j < H; j++) {
    const flips = new Int32Array(W + 1);
    for (const e of vert) if (e.y0 <= j && j < e.y1) flips[e.x] ^= 1;
    let on = 0;
    for (let i = 0; i < W; i++) { on ^= flips[i]; if (on) { inside[j * W + i] = 1; any = true; } }
  }
  if (!any) return [];
  const at = (i, j) => i >= 0 && j >= 0 && i < W && j < H && inside[j * W + i] === 1;
  // boundary edges of the cells, each cell's own sides counter-clockwise; key = grid corner
  /** @type {Map<number, { to: number, dx: number, dy: number, used: boolean }[]>} */
  const out = new Map();
  const key = (i, j) => j * (W + 1) + i;
  const add = (i0, j0, i1, j1) => { const k = key(i0, j0); if (!out.has(k)) out.set(k, []); out.get(k)?.push({ to: key(i1, j1), dx: i1 - i0, dy: j1 - j0, used: false }); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add(i, j, i + 1, j);
    if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!at(i - 1, j)) add(i, j + 1, i, j);
  }
  /** @type {Pt[][]} */
  const result = [];
  for (const [k0, list] of out) for (const e0 of list) {
    if (e0.used) continue;
    /** @type {Pt[]} */
    const pts = [];
    let k = k0, e = e0;
    for (let guard = 0; guard < 4 * W * H + 8; guard++) {
      e.used = true;
      pts.push({ x: xs[k % (W + 1)], y: ys[Math.floor(k / (W + 1))] });
      k = e.to;
      const next = (out.get(k) || []).filter((c) => !c.used);
      if (!next.length) break;
      // turn left first, so loops that touch at one corner stay apart
      const rank = (c) => { const cross = e.dx * c.dy - e.dy * c.dx; return cross > 0 ? 0 : cross === 0 ? 1 : 2; };
      next.sort((m, n) => rank(m) - rank(n));
      e = next[0];
    }
    const c = clean(pts);
    if (c.length >= 4 && areaPer(c).area > EPS) result.push(c);
  }
  return result;
}

/** Drop repeated corners and corners partway along a straight side. @param {Pt[]} pts */
function clean(pts) {
  const p = [...pts];
  for (let changed = true; changed && p.length >= 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], c = p[i], b = p[(i + 1) % p.length];
      const same = Math.abs(c.x - b.x) <= 10 * EPS && Math.abs(c.y - b.y) <= 10 * EPS;
      const straight = (Math.abs(a.x - c.x) <= 10 * EPS && Math.abs(c.x - b.x) <= 10 * EPS) || (Math.abs(a.y - c.y) <= 10 * EPS && Math.abs(c.y - b.y) <= 10 * EPS);
      if (same || straight) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}

/** Join pieces of one line drawn across several steps (same kind, same direction, end to start). @param {Line[]} raw */
function merge(raw) {
  const ls = raw.map((l) => ({ ...l }));
  const close = (a, b) => Math.abs(a - b) <= 100 * EPS;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < ls.length && !changed; i++) for (let j = 0; j < ls.length && !changed; j++) {
      if (i === j) continue;
      const a = ls[i], b = ls[j];
      if (a.kind !== b.kind || !close(a.x1, b.x0) || !close(a.y1, b.y0) || !close(a.z1, b.z0)) continue;
      const da = { x: Math.sign(a.x1 - a.x0), y: Math.sign(a.y1 - a.y0) }, db = { x: Math.sign(b.x1 - b.x0), y: Math.sign(b.y1 - b.y0) };
      if (da.x !== db.x || da.y !== db.y) continue;
      a.x1 = b.x1; a.y1 = b.y1; a.z1 = b.z1;
      ls.splice(j, 1);
      changed = true;
    }
  }
  return ls;
}
