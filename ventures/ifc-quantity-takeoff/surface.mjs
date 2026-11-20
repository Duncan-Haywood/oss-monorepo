// Curved surfaces of advanced breps: B-spline curves and surfaces (rational
// too), and the cutting of a face on any surface with a parameter map into
// triangles that lie close to it.
//
// A face is given as its boundary points (already sampled, shared with its
// neighbours) and a map (u, v) -> point. The boundary goes to (u, v), is ear
// clipped there, and every edge inside the face is halved until its midpoint
// on the surface lies within a tolerance of the straight edge. Boundary edges
// are never split, so the face still meets its neighbours point for point.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

function expandKnots(mults, knots) {
  const U = [];
  knots.forEach((k, i) => { for (let j = 0; j < mults[i]; j++) U.push(k); });
  return U;
}

/** de Boor on homogeneous points H (each [x w, y w, z w, w]) at u. */
function deBoor(H, p, U, u, fixed = -1) {
  const n = H.length;
  let k = p;
  if (fixed >= 0) k = fixed;
  else while (k < n - 1 && u >= U[k + 1]) k++;
  const d = [];
  for (let j = 0; j <= p; j++) d.push(H[k - p + j].slice());
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1] - U[i];
      const al = den ? (u - U[i]) / den : 0;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - al) * d[j - 1][c] + al * d[j][c];
    }
  }
  return d[p];
}

const homog = (c, w) => [c[0] * w, c[1] * w, c[2] * w, w];
const fromHomog = (h) => [h[0] / h[3], h[1] / h[3], h[2] / h[3]];

/** A B-spline curve: at(u) for u in [u0, u1]. */
export function bsplineCurve(cp, p, mults, knots, weights = null) {
  const U = expandKnots(mults, knots);
  const H = cp.map((c, i) => homog(c, weights ? weights[i] : 1));
  const n = H.length;
  return { at: (u) => fromHomog(deBoor(H, p, U, u)), u0: U[p], u1: U[n], spans: U.slice(p, n + 1) };
}

/**
 * A B-spline surface: cp[i][j], i along u, j along v (as IFC lists them);
 * weights the same shape for a rational one.
 */
export function bsplineSurface(cp, pu, pv, umults, vmults, uknots, vknots, weights = null) {
  const U = expandKnots(umults, uknots), V = expandKnots(vmults, vknots);
  const H = cp.map((row, i) => row.map((c, j) => homog(c, weights ? weights[i][j] : 1)));
  const nu = H.length, nv = H[0].length;
  // only the pu + 1 rows of u's knot span bear on the point
  const at = (u, v) => {
    let k = pu;
    while (k < nu - 1 && u >= U[k + 1]) k++;
    const rows = [];
    for (let i = k - pu; i <= k; i++) rows.push(deBoor(H[i], pv, V, v));
    return fromHomog(deBoor(rows, pu, U.slice(k - pu, k + pu + 2), u, pu));
  };
  return { at, domain: [[U[pu], U[nu]], [V[pv], V[nv]]] };
}

/**
 * The (u, v) of point p on a surface by Newton's method on |S(u, v) - p|^2,
 * started from `seed` or, failing that, the nearest point of a grid over the
 * domain. Returns [u, v, distance].
 */
export function invertSurface(S, p, seed = null, grid = null) {
  const [[u0, u1], [v0, v1]] = S.domain;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const solve = (u, v) => {
    const hu = 1e-6 * (u1 - u0 || 1), hv = 1e-6 * (v1 - v0 || 1);
    for (let it = 0; it < 40; it++) {
      const P = S.at(u, v);
      const r = sub(P, p);
      const uu = clamp(u + hu, u0, u1) === u ? u - hu : u + hu;
      const vv = clamp(v + hv, v0, v1) === v ? v - hv : v + hv;
      const Su = sub(S.at(uu, v), P).map((x) => x / (uu - u));
      const Sv = sub(S.at(u, vv), P).map((x) => x / (vv - v));
      // Gauss-Newton step on the 2x2 normal equations
      const a = Su[0] * Su[0] + Su[1] * Su[1] + Su[2] * Su[2];
      const b = Su[0] * Sv[0] + Su[1] * Sv[1] + Su[2] * Sv[2];
      const c = Sv[0] * Sv[0] + Sv[1] * Sv[1] + Sv[2] * Sv[2];
      const g0 = Su[0] * r[0] + Su[1] * r[1] + Su[2] * r[2];
      const g1 = Sv[0] * r[0] + Sv[1] * r[1] + Sv[2] * r[2];
      const det = a * c - b * b;
      if (!(Math.abs(det) > 0)) break;
      const du = (c * g0 - b * g1) / det, dv = (a * g1 - b * g0) / det;
      const nu = clamp(u - du, u0, u1), nv = clamp(v - dv, v0, v1);
      const done = Math.abs(nu - u) < 1e-12 * (u1 - u0 || 1) && Math.abs(nv - v) < 1e-12 * (v1 - v0 || 1);
      u = nu; v = nv;
      if (done) break;
    }
    return [u, v, norm(sub(S.at(u, v), p))];
  };
  let best = seed ? solve(seed[0], seed[1]) : null;
  if (!best || best[2] > 1e-7 * (grid?.size ?? 1)) {
    let g = null, gd = Infinity;
    for (const q of grid.points) { const d = norm(sub(q.p, p)); if (d < gd) { gd = d; g = q; } }
    const r = solve(g.u, g.v);
    if (!best || r[2] < best[2]) best = r;
  }
  return best;
}

/** Sample points of a surface over its domain, for seeding invertSurface. */
export function surfaceGrid(S, n = 24) {
  const [[u0, u1], [v0, v1]] = S.domain;
  const points = [];
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const u = u0 + ((u1 - u0) * i) / n, v = v0 + ((v1 - v0) * j) / n;
    const p = S.at(u, v);
    points.push({ u, v, p });
    lo = lo.map((x, k) => Math.min(x, p[k])); hi = hi.map((x, k) => Math.max(x, p[k]));
  }
  return { points, size: norm(sub(hi, lo)) };
}

/**
 * Cut one face into triangles that lie close to its surface. V3 and UV are
 * the boundary loop's points and parameters, in order (more vertices are
 * appended to both); at(u, v) is the surface; triangulate(uv, ids) cuts a
 * loop of parameters into index triples (of ids), or is a list of such cuts
 * tried in turn until one gives triangles whose edges pair up (the last is
 * also used for corners in step 3).
 *
 * 1. Runs of boundary points that lie near a straight line in (u, v) (an
 *    edge along a parameter line, or any gently bending edge, sampled
 *    densely: within 1e-3 of the loop's size and 1e-2 of the chord's length) are set aside, so
 *    the loop triangulated first has only the run ends: dense edges do not
 *    force a dense inside.
 * 2. Triangles are refined while an edge has its midpoint on the surface
 *    more than tol from the straight edge, or a parameter length (scaled by
 *    su, sv) over maxLen. Refining is longest-edge bisection (Rivara): the
 *    neighbour across the longest edge is refined first until that edge is
 *    its longest too, then both are halved there, so triangles keep their
 *    shape. A boundary edge is halved only at a point set aside on it, the
 *    one nearest its middle, so no point is added to the boundary.
 * 3. The points still set aside on an edge are fanned to the triangle on it
 *    (a triangle with such points on two edges is cut as a loop).
 *
 * Returns index triples into V3; throws when more than maxTris are needed.
 */
export function meshFace(V3, UV, at, triangulate, { tol, maxLen = Infinity, su = 1, sv = 1, maxTris = 20000 }) {
  const n = V3.length;
  const sc = (i) => [UV[i][0] * su, UV[i][1] * sv];
  let diag = 0;
  for (let i = 0; i < n; i++) for (const j of [0, (i + (n >> 1)) % n]) { const a = sc(i), b = sc(j); diag = Math.max(diag, Math.hypot(a[0] - b[0], a[1] - b[1])); }
  // 1. straight runs: from each kept point, extend while every point between
  // lies on the chord and further along it than the last
  const kept = [];
  const between = new Map(); // edge key -> { from, ids }: the points set aside on it, in order from `from`
  const key = (i, j) => (i < j ? i * 1048576 + j : j * 1048576 + i);
  const onChord = (s, e) => {
    const a = sc(s), b = sc(e % n);
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!(L > 1e-9 * diag)) return false;
    const eps = Math.min(1e-3 * diag, 1e-2 * L);
    let last = 0;
    for (let k = s + 1; k < e; k++) {
      const q = sc(k % n);
      const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L;
      if (Math.abs((q[1] - a[1]) * dx - (q[0] - a[0]) * dy) / L > eps || t <= last || t >= L) return false;
      last = t;
    }
    return true;
  };
  for (let s = 0; s < n;) {
    let e = s + 1;
    while (e + 1 <= n && onChord(s, e + 1)) e++;
    kept.push(s);
    if (e - s > 1) between.set(key(s, e % n), { from: s, ids: Array.from({ length: e - s - 1 }, (_, k) => s + 1 + k) });
    s = e;
  }
  if (kept.length < 3) throw new Error("face is a sliver in (u, v)");
  // the first cut whose edges pair up: each loop edge used once, each other twice
  const valid = (tris) => {
    if (!tris) return false;
    const use = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) { const q = key(t[k], t[(k + 1) % 3]); use.set(q, (use.get(q) || 0) + 1); }
    const loopEdges = new Set(kept.map((i, x) => key(i, kept[(x + 1) % kept.length])));
    for (const [q, c] of use) if (c !== (loopEdges.has(q) ? 1 : 2)) return false;
    for (const q of loopEdges) if (!use.has(q)) return false;
    // and lie flat in (u, v): their areas, taken unsigned, add up to the loop's
    const ar = (x, y, z) => (UV[y][0] - UV[x][0]) * (UV[z][1] - UV[x][1]) - (UV[y][1] - UV[x][1]) * (UV[z][0] - UV[x][0]);
    let loopArea = 0, sum = 0;
    for (let x = 1; x + 1 < kept.length; x++) loopArea += ar(kept[0], kept[x], kept[x + 1]);
    // no piece of no area either: halving one makes more, without end
    for (const t of tris) { const x = Math.abs(ar(t[0], t[1], t[2])); if (x <= 1e-12 * Math.abs(loopArea)) return false; sum += x; }
    return Math.abs(sum - Math.abs(loopArea)) <= 1e-9 * (sum + Math.abs(loopArea));
  };
  const cuts = Array.isArray(triangulate) ? triangulate : [triangulate];
  let tris = null;
  for (const cut of cuts) {
    let t = null;
    try { t = cut(kept.map((i) => UV[i]), kept); } catch { t = null; }
    if (valid(t)) { tris = t; break; }
  }
  if (!tris) throw new Error("face could not be cut into triangles");

  // 2. refine
  const area = (x, y, z) => ((UV[y][0] - UV[x][0]) * (UV[z][1] - UV[x][1]) - (UV[y][1] - UV[x][1]) * (UV[z][0] - UV[x][0])) * su * sv;
  const edges = new Map(); // edge key -> triangle ids on it
  const T = [], alive = [];
  const link = (ti) => { const t = T[ti]; for (let k = 0; k < 3; k++) { const q = key(t[k], t[(k + 1) % 3]); let e = edges.get(q); if (!e) edges.set(q, (e = [])); e.push(ti); } };
  const unlink = (ti) => { const t = T[ti]; for (let k = 0; k < 3; k++) { const e = edges.get(key(t[k], t[(k + 1) % 3])); const x = e.indexOf(ti); if (x >= 0) e.splice(x, 1); } };
  const addTri = (t) => { T.push(t); alive.push(true); link(T.length - 1); return T.length - 1; };
  for (const t of tris) addTri(t.slice());
  const len = (i, j) => Math.hypot((UV[i][0] - UV[j][0]) * su, (UV[i][1] - UV[j][1]) * sv);
  // a boundary edge with nothing set aside cannot be halved, and the two other
  // edges of its triangle are at least half as long: maxLen must allow them
  for (let x = 0; x < kept.length; x++) {
    const a = kept[x], b = kept[(x + 1) % kept.length];
    if (!between.get(key(a, b))?.ids.length) maxLen = Math.max(maxLen, len(a, b));
  }
  const inner = (i, j) => edges.get(key(i, j)).length === 2;
  // where an edge is halved: its middle inside, the nearest point set aside on the boundary
  const splitPoint = (i, j) => {
    if (inner(i, j)) return -1;
    const b = between.get(key(i, j))?.ids;
    if (!b || !b.length) return null;
    const mu = [(UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2];
    let best = b[0], bd = Infinity;
    for (const p of b) { const d = Math.hypot((UV[p][0] - mu[0]) * su, (UV[p][1] - mu[1]) * sv); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const onSurf = [];
  const surfAt = (i) => onSurf[i] ?? (onSurf[i] = at(UV[i][0], UV[i][1]));
  const sag = (i, j, P) => {
    // against the surface's own chord, so a boundary point a little off the
    // surface (a sampled edge) does not keep the halving going
    const Si = surfAt(i), Sj = surfAt(j);
    return Math.hypot(P[0] - (Si[0] + Sj[0]) / 2, P[1] - (Si[1] + Sj[1]) / 2, P[2] - (Si[2] + Sj[2]) / 2);
  };
  const badEdge = (i, j) => {
    const sp = splitPoint(i, j);
    if (sp === null || len(i, j) <= minLen) return false;
    if (len(i, j) > maxLen) return true;
    const P = sp < 0 ? at((UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2) : at(UV[sp][0], UV[sp][1]);
    return sag(i, j, P) > tol;
  };
  const splitEdge = (ti) => {
    const t = T[ti];
    let best = -1, bl = -1;
    for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; const l = len(a, b); if (splitPoint(a, b) !== null && l > bl) { bl = l; best = k; } }
    return best < 0 ? null : [t[best], t[(best + 1) % 3]];
  };
  // Neighbouring boundary points as sampled can be further apart than the
  // tolerance asks for (a B-spline edge at 16 points to a span): an inner
  // edge no longer than such a pair is as fine as the boundary allows, and
  // halving it again would only pull a vertex onto the boundary without end.
  let minLen = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (sag(i, j, at((UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2)) > tol) minLen = Math.max(minLen, len(i, j));
  }
  const longest = (ti) => { const t = T[ti]; return Math.max(len(t[0], t[1]), len(t[1], t[2]), len(t[2], t[0])); };
  let count = T.length;
  const bisect = (i, j) => {
    const on = edges.get(key(i, j)).slice();
    if (count + on.length > maxTris) throw new Error(`over ${maxTris} triangles`);
    let m = splitPoint(i, j);
    if (m >= 0) {
      // the set-aside point nearest the middle that folds no piece over
      const t = T[on[0]];
      const c = t.find((x) => x !== i && x !== j);
      const sg = Math.sign(area(i, j, c));
      const mu = [(UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2];
      const d = (p) => Math.hypot((UV[p][0] - mu[0]) * su, (UV[p][1] - mu[1]) * sv);
      const ok = between.get(key(i, j)).ids.filter((p) => Math.sign(area(i, p, c)) === sg && Math.sign(area(p, j, c)) === sg).sort((p, q) => d(p) - d(q));
      if (!ok.length) throw new Error("a halving folds over");
      m = ok[0];
    }
    if (m < 0) {
      m = V3.length;
      const mu = [(UV[i][0] + UV[j][0]) / 2, (UV[i][1] + UV[j][1]) / 2];
      V3.push(at(mu[0], mu[1])); UV.push(mu);
    } else {
      const { from, ids } = between.get(key(i, j));
      const to = from === i ? j : i;
      const x = ids.indexOf(m);
      between.set(key(from, m), { from, ids: ids.slice(0, x) });
      between.set(key(m, to), { from: m, ids: ids.slice(x + 1) });
    }
    for (const ti of on) {
      const t = T[ti];
      const k = t.findIndex((x, s) => key(x, t[(s + 1) % 3]) === key(i, j));
      const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
      // halving a boundary edge at a point set aside off its chord must not
      // fold a piece over
      const A0 = area(a, b, c), tiny = 1e-9 * Math.abs(A0);
      if (A0 && (area(a, m, c) * Math.sign(A0) < -tiny || area(m, b, c) * Math.sign(A0) < -tiny)) throw new Error("a halving folds over");
      unlink(ti); alive[ti] = false;
      addTri([a, m, c]); addTri([m, b, c]);
    }
    count += on.length;
  };
  const refine = (ti, depth = 0) => {
    for (let guard = 0; alive[ti] && guard < 64; guard++) {
      const e = splitEdge(ti);
      if (!e) return;
      const other = edges.get(key(e[0], e[1])).find((x) => x !== ti);
      // the neighbour is refined first only while its longest edge is
      // another halvable one: refining towards an edge that cannot be halved
      // (a boundary edge) would pull a vertex onto it without end
      const oe = other == null ? null : splitEdge(other);
      if (depth < 200 && oe && key(oe[0], oe[1]) !== key(e[0], e[1]) && len(oe[0], oe[1]) >= longest(other)) { refine(other, depth + 1); continue; }
      bisect(e[0], e[1]);
      return;
    }
  };
  const isBad = (ti) => { const t = T[ti]; for (let k = 0; k < 3; k++) if (badEdge(t[k], t[(k + 1) % 3])) return true; return false; };
  const queue = T.map((_, i) => i);
  while (queue.length) {
    const ti = queue.pop();
    if (!alive[ti] || !isBad(ti)) continue;
    const before = T.length;
    refine(ti);
    for (let x = before; x < T.length; x++) if (alive[x]) queue.push(x);
  }

  // 3. fan the points set aside to the triangle on their edge
  const out = [];
  for (let ti = 0; ti < T.length; ti++) {
    if (!alive[ti]) continue;
    const t = T[ti];
    const runs = [];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      const list = between.get(key(a, b));
      if (list && list.ids.length && !inner(a, b)) runs.push(k);
    }
    if (!runs.length) { out.push(t); continue; }
    if (runs.length === 1) {
      const k = runs[0], a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
      const list = between.get(key(a, b));
      const run = [a, ...(list.from === a ? list.ids : list.ids.slice().reverse()), b];
      // the fan must not fold over in (u, v): every piece turns the same way
      const sgn = Math.sign(area(a, b, c));
      for (let r = 0; r + 1 < run.length; r++) {
        if (Math.sign(area(run[r], run[r + 1], c)) === -sgn) throw new Error("a fan folds over");
        out.push([run[r], run[r + 1], c]);
      }
      continue;
    }
    // points set aside on two or three edges (a corner): the triangle's
    // outline with them, cut as a loop
    const loop = [];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      loop.push(a);
      const list = between.get(key(a, b));
      if (list && list.ids.length && !inner(a, b)) loop.push(...(list.from === a ? list.ids : list.ids.slice().reverse()));
    }
    out.push(...cuts[cuts.length - 1](loop.map((i) => UV[i]), loop));
  }
  return out;
}
