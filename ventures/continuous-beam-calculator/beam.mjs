// Continuous beam analysis: any number of spans, pinned, fixed or free supports,
// point loads, point moments and full or partial uniform/trapezoidal loads, in
// dead (D) and live (L) cases, with the live load patterned span by span.
//
// Method. The beam is cut into elements at every support and at every load
// start, end and point. Inside an element the load is linear, so an
// Euler-Bernoulli element with a consistent load vector gives exact nodal
// displacements (Hermite cubics reproduce the exact solution at the nodes).
// Shear, moment, slope and deflection inside each element are then integrated
// in closed form from the element's end forces: shear is quadratic, moment
// cubic, deflection quintic. Nothing is sampled except where the report
// scans for a deflection peak, and that peak is then pinned by bisection on
// the slope.
//
// Live-load patterning. The response is linear in the loads, so live load on
// span i alone is solved once per span. At any station the worst pattern is
// "every span whose own contribution is the same sign as the effect you want",
// and the envelope is dead + the sum of those contributions, exact without
// enumerating 2^n patterns. The report then re-solves each governing pattern
// and finds its exact peak inside the span.
//
// Sign conventions (outputs): loads and deflection are positive DOWN, support
// reactions positive UP, moment positive SAGGING (tension at the bottom), and
// a point moment or a fixed-end reaction moment positive CLOCKWISE.
// Consistent units throughout: length L, force F, distributed F/L, EI in F·L².

const TOL = 1e-9;

function check(cond, msg) { if (!cond) throw new Error(msg); }

/**
 * Validate and normalise a model.
 * model = {
 *   spans: [L1, L2, ...]                        lengths (> 0)
 *   supports: ['pin'|'fixed'|'free', ...]      one per node, spans.length + 1
 *   EI: number | [per span]                     flexural rigidity
 *   loads: [
 *     { type: 'point', x, P, case: 'D'|'L' }            P down
 *     { type: 'udl', x1, x2, w1, w2?, case }            w down per length, linear from w1 to w2
 *     { type: 'moment', x, M, case }                    M clockwise
 *   ]
 * }
 */
export function normalise(model) {
  check(model && Array.isArray(model.spans) && model.spans.length >= 1, 'Give at least one span.');
  const spans = model.spans.map(Number);
  check(spans.length <= 40, 'At most 40 spans.');
  for (const L of spans) check(Number.isFinite(L) && L > 0, 'Every span length must be a positive number.');
  const supports = (model.supports || []).map(s => String(s).toLowerCase());
  check(supports.length === spans.length + 1, `Give ${spans.length + 1} supports (one at each end of each span), got ${supports.length}.`);
  for (const s of supports) check(['pin', 'fixed', 'free'].includes(s), `Unknown support "${s}": use pin, fixed or free.`);
  const EI = Array.isArray(model.EI) ? model.EI.map(Number) : spans.map(() => Number(model.EI));
  check(EI.length === spans.length, 'Give one EI per span, or one EI for the whole beam.');
  for (const e of EI) check(Number.isFinite(e) && e > 0, 'EI must be a positive number.');
  const total = spans.reduce((a, b) => a + b, 0);
  const loads = (model.loads || []).map((l, i) => {
    const c = String(l.case || 'D').toUpperCase();
    check(c === 'D' || c === 'L', `Load ${i + 1}: case must be D or L.`);
    if (l.type === 'point' || l.type === 'moment') {
      const x = Number(l.x); const v = Number(l.type === 'point' ? l.P : l.M);
      check(Number.isFinite(x) && x >= -TOL * total && x <= total * (1 + TOL), `Load ${i + 1}: position must be on the beam (0 to ${total}).`);
      check(Number.isFinite(v), `Load ${i + 1}: magnitude must be a number.`);
      return { type: l.type, x: Math.min(Math.max(x, 0), total), [l.type === 'point' ? 'P' : 'M']: v, case: c };
    }
    if (l.type === 'udl') {
      let x1 = Number(l.x1 ?? 0), x2 = Number(l.x2 ?? total);
      const w1 = Number(l.w1 ?? l.w); const w2 = Number(l.w2 ?? w1);
      check(Number.isFinite(x1) && Number.isFinite(x2) && x2 > x1, `Load ${i + 1}: a distributed load needs x2 greater than x1.`);
      check(Number.isFinite(w1) && Number.isFinite(w2), `Load ${i + 1}: intensity must be a number.`);
      check(x1 >= -TOL * total && x2 <= total * (1 + TOL), `Load ${i + 1}: a distributed load must lie on the beam (0 to ${total}).`);
      return { type: 'udl', x1: Math.max(x1, 0), x2: Math.min(x2, total), w1, w2, case: c };
    }
    throw new Error(`Load ${i + 1}: type must be point, udl or moment.`);
  });
  return { spans, supports, EI, loads, total };
}

// Node positions: supports, then every load breakpoint.
function buildMesh(m) {
  const sup = [0]; for (const L of m.spans) sup.push(sup[sup.length - 1] + L);
  const xs = [...sup];
  for (const l of m.loads) {
    if (l.type === 'udl') xs.push(l.x1, l.x2); else xs.push(l.x);
  }
  xs.sort((a, b) => a - b);
  const eps = TOL * m.total;
  const nodes = [];
  for (const x of xs) if (!nodes.length || x - nodes[nodes.length - 1] > eps) nodes.push(x);
  // snap support positions exactly
  const supNode = sup.map(s => nodes.reduce((bi, x, i) => (Math.abs(x - s) < Math.abs(nodes[bi] - s) ? i : bi), 0));
  supNode.forEach((ni, k) => { nodes[ni] = sup[k]; });
  const elems = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1], mid = (a + b) / 2;
    let span = 0; while (span < m.spans.length - 1 && mid > sup[span + 1]) span++;
    elems.push({ a, b, L: b - a, span, EI: m.EI[span] });
  }
  return { nodes, elems, sup, supNode };
}

function spanOf(x, sup) {
  let s = 0; while (s < sup.length - 2 && x > sup[s + 1] + 1e-12) s++; return s;
}

// LU factorisation with partial pivoting of the free-dof stiffness.
function luFactor(A) {
  const n = A.length; const piv = Array.from({ length: n }, (_, i) => i);
  let scale = 0; for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(A[i][i]));
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (!(Math.abs(A[p][k]) > 1e-11 * scale)) return null;
    if (p !== k) { [A[p], A[k]] = [A[k], A[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; }
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k]; A[i][k] = f;
      if (f !== 0) for (let j = k + 1; j < n; j++) A[i][j] -= f * A[k][j];
    }
  }
  return { A, piv };
}
function luSolve({ A, piv }, b) {
  const n = A.length; const y = piv.map(i => b[i]);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) y[i] -= A[i][j] * y[j];
  for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) y[i] -= A[i][j] * y[j]; y[i] /= A[i][i]; }
  return y;
}

function kElem(EI, L) {
  const c = EI / (L * L * L);
  return [
    [12 * c, 6 * L * c, -12 * c, 6 * L * c],
    [6 * L * c, 4 * L * L * c, -6 * L * c, 2 * L * L * c],
    [-12 * c, -6 * L * c, 12 * c, -6 * L * c],
    [6 * L * c, 2 * L * L * c, -6 * L * c, 4 * L * L * c],
  ];
}

// Consistent load vector of a linear upward load q1..q2 on an element of length L
// (Hermite shapes times a linear load is degree 4: three Gauss points are exact).
const G3 = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
function feq(q1, q2, L) {
  const F = [0, 0, 0, 0];
  for (const [g, wt] of G3) {
    const xi = (g + 1) / 2, q = q1 + (q2 - q1) * xi, w = wt * L / 2;
    F[0] += w * q * (1 - 3 * xi * xi + 2 * xi ** 3);
    F[1] += w * q * L * (xi - 2 * xi * xi + xi ** 3);
    F[2] += w * q * (3 * xi * xi - 2 * xi ** 3);
    F[3] += w * q * L * (-xi * xi + xi ** 3);
  }
  return F;
}

/**
 * Build a solver for the model: factorises once, then solves any subset of loads.
 */
export function createSolver(model) {
  const m = normalise(model);
  const mesh = buildMesh(m);
  const nn = mesh.nodes.length, ndof = 2 * nn;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  for (let e = 0; e < mesh.elems.length; e++) {
    const el = mesh.elems[e]; const k = kElem(el.EI, el.L); const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i]][d[j]] += k[i][j];
  }
  const fixed = new Set();
  m.supports.forEach((s, k) => { const n = mesh.supNode[k]; if (s !== 'free') fixed.add(2 * n); if (s === 'fixed') fixed.add(2 * n + 1); });
  const free = []; for (let i = 0; i < ndof; i++) if (!fixed.has(i)) free.push(i);
  const Kff = free.map(i => free.map(j => K[i][j]));
  const lu = free.length ? luFactor(Kff) : { A: [], piv: [] };
  if (!lu) throw new Error('The beam is unstable as supported (it can move or spin freely). Add a support, or make an end fixed.');

  /** Solve for the given loads (already normalised, positions on the beam). Returns a linear "solution" object. */
  function solve(loads) {
    const q1 = new Array(mesh.elems.length).fill(0), q2 = new Array(mesh.elems.length).fill(0);
    const F = new Array(ndof).fill(0);
    const eps = TOL * m.total;
    for (const l of loads) {
      if (l.type === 'point' || l.type === 'moment') {
        let n = 0; for (let i = 1; i < nn; i++) if (Math.abs(mesh.nodes[i] - l.x) < Math.abs(mesh.nodes[n] - l.x)) n = i;
        if (l.type === 'point') F[2 * n] -= l.P; else F[2 * n + 1] -= l.M;
      } else {
        const slope = (l.w2 - l.w1) / (l.x2 - l.x1);
        mesh.elems.forEach((el, e) => {
          if (el.a >= l.x1 - eps && el.b <= l.x2 + eps) {
            q1[e] -= l.w1 + slope * (el.a - l.x1); q2[e] -= l.w1 + slope * (el.b - l.x1);
          }
        });
      }
    }
    const Fe = mesh.elems.map((el, e) => feq(q1[e], q2[e], el.L));
    Fe.forEach((fe, e) => { for (let i = 0; i < 4; i++) F[2 * e + i] += fe[i]; });
    const df = luSolve(lu, free.map(i => F[i]));
    const d = new Array(ndof).fill(0); free.forEach((i, k) => { d[i] = df[k]; });
    // element end forces exerted by the nodes on the element: f1 up, m1 ccw at the left end
    const f1 = [], m1 = [];
    mesh.elems.forEach((el, e) => {
      const k = kElem(el.EI, el.L); const de = [d[2 * e], d[2 * e + 1], d[2 * e + 2], d[2 * e + 3]];
      f1.push(k[0].reduce((s, kij, j) => s + kij * de[j], 0) - Fe[e][0]);
      m1.push(k[1].reduce((s, kij, j) => s + kij * de[j], 0) - Fe[e][1]);
    });
    // reactions at support nodes: (K d - F) on the restrained dofs
    const R = m.supports.map((s, k) => {
      const n = mesh.supNode[k];
      const r = dof => (s === 'free' || (dof % 2 === 1 && s !== 'fixed')) ? 0 : K[dof].reduce((acc, kij, j) => acc + kij * d[j], 0) - F[dof];
      return { force: r(2 * n), moment: -r(2 * n + 1) }; // moment reported clockwise-positive
    });
    return { d, f1, m1, q1, q2, R };
  }

  return { m, mesh, solve };
}

/** Linear combination of solutions: sum of c_k * sol_k. */
export function combine(terms) {
  const out = { d: null, f1: null, m1: null, q1: null, q2: null, R: null };
  for (const [c, s] of terms) {
    for (const key of ['d', 'f1', 'm1', 'q1', 'q2']) {
      if (!out[key]) out[key] = s[key].map(() => 0);
      s[key].forEach((v, i) => { out[key][i] += c * v; });
    }
    if (!out.R) out.R = s.R.map(() => ({ force: 0, moment: 0 }));
    s.R.forEach((r, i) => { out.R[i].force += c * r.force; out.R[i].moment += c * r.moment; });
  }
  return out;
}

/** Exact internal actions at local coordinate x in element e. V, M (sagging +), defl (down +), slope. */
export function at(mesh, sol, e, x) {
  const el = mesh.elems[e], L = el.L, EI = el.EI;
  const f1 = sol.f1[e], m1 = sol.m1[e], q1 = sol.q1[e], dq = sol.q2[e] - sol.q1[e];
  const v0 = sol.d[2 * e], t0 = sol.d[2 * e + 1];
  const V = f1 + q1 * x + dq * x * x / (2 * L);
  const M = -m1 + f1 * x + q1 * x * x / 2 + dq * x ** 3 / (6 * L);
  const theta = t0 + (-m1 * x + f1 * x * x / 2 + q1 * x ** 3 / 6 + dq * x ** 4 / (24 * L)) / EI;
  const v = v0 + t0 * x + (-m1 * x * x / 2 + f1 * x ** 3 / 6 + q1 * x ** 4 / 24 + dq * x ** 5 / (120 * L)) / EI;
  return { V, M, defl: -v, slope: theta };
}

// Exact extremes of M, |V| and deflection over the elements of one span, for one solution.
function spanExtremes(mesh, sol, span) {
  const r = { Mmax: { v: -Infinity }, Mmin: { v: Infinity }, Vabs: { v: 0 }, Dmax: { v: -Infinity }, Dmin: { v: Infinity } };
  const take = (key, cmp, val, x) => { if (cmp(val, r[key].v)) r[key] = { v: val, x }; };
  mesh.elems.forEach((el, e) => {
    if (el.span !== span) return;
    const L = el.L, f1 = sol.f1[e], q1 = sol.q1[e], dq = sol.q2[e] - sol.q1[e];
    const cand = [0, L];
    // V(x) = f1 + q1 x + dq x^2/(2L) = 0 -> M extremes; q(x)=0 -> V extreme
    const a = dq / (2 * L), b = q1, c = f1;
    if (Math.abs(a) > 1e-300) {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) { const s = Math.sqrt(disc); cand.push((-b + s) / (2 * a), (-b - s) / (2 * a)); }
    } else if (Math.abs(b) > 1e-300) cand.push(-c / b);
    if (Math.abs(dq) > 1e-300) cand.push(-q1 * L / dq);
    for (const x of cand) {
      if (!(x >= 0 && x <= L)) continue;
      const s = at(mesh, sol, e, x);
      take('Mmax', (p, q) => p > q, s.M, el.a + x); take('Mmin', (p, q) => p < q, s.M, el.a + x);
      take('Vabs', (p, q) => Math.abs(p) > Math.abs(q), s.V, el.a + x);
    }
    // deflection: scan the slope for sign changes, bisect
    const N = 48; let px = 0, ps = at(mesh, sol, e, 0);
    const consider = (x, s) => { take('Dmax', (p, q) => p > q, s.defl, el.a + x); take('Dmin', (p, q) => p < q, s.defl, el.a + x); };
    consider(0, ps);
    for (let i = 1; i <= N; i++) {
      const x = L * i / N, s = at(mesh, sol, e, x);
      consider(x, s);
      if (ps.slope === 0 || ps.slope * s.slope < 0) {
        let lo = px, hi = x, slo = ps.slope;
        for (let it = 0; it < 80; it++) {
          const mid = (lo + hi) / 2, sm = at(mesh, sol, e, mid).slope;
          if (slo * sm <= 0) hi = mid; else { lo = mid; slo = sm; }
        }
        const xr = (lo + hi) / 2; consider(xr, at(mesh, sol, e, xr));
      }
      px = x; ps = s;
    }
  });
  if (r.Vabs.x === undefined) r.Vabs = { v: 0, x: null };
  return r;
}

/** Split live loads into one group per span (a distributed load crossing supports is cut there). */
export function liveBySpan(m, sup) {
  const groups = m.spans.map(() => []);
  for (const l of m.loads) {
    if (l.case !== 'L') continue;
    if (l.type !== 'udl') { groups[spanOf(l.x, sup)].push(l); continue; }
    const slope = (l.w2 - l.w1) / (l.x2 - l.x1);
    for (let s = 0; s < m.spans.length; s++) {
      const a = Math.max(l.x1, sup[s]), b = Math.min(l.x2, sup[s + 1]);
      if (b - a > TOL * m.total) groups[s].push({ ...l, x1: a, x2: b, w1: l.w1 + slope * (a - l.x1), w2: l.w1 + slope * (b - l.x1) });
    }
  }
  return groups;
}

/**
 * Analyse a beam: dead, live by span, the patterned envelope, and exact peaks per span.
 * opts = { pattern: true, factors: { D: 1, L: 1 }, stations: 24 }
 */
export function analyse(model, opts = {}) {
  const { m, mesh, solve } = createSolver(model);
  const pattern = opts.pattern !== false;
  const fD = opts.factors?.D ?? 1, fL = opts.factors?.L ?? 1;
  const dead = solve(m.loads.filter(l => l.case === 'D'));
  const groups = pattern ? liveBySpan(m, mesh.sup) : [m.loads.filter(l => l.case === 'L')];
  const live = groups.map(g => solve(g));
  const nG = live.length;
  const hasLive = m.loads.some(l => l.case === 'L');

  // Stations: each element's ends (both sides of a jump) plus interior points.
  const per = opts.stations ?? 24;
  const stations = [];
  mesh.elems.forEach((el, e) => { for (let i = 0; i <= per; i++) stations.push({ e, x: el.L * i / per, X: el.a + el.L * i / per, span: el.span }); });

  // A span with no real effect at a station (a cantilever's moment is statically determinate)
  // still returns round-off; contributions below 1e-10 of the largest at that station count as zero.
  const pick = (vals, sign) => vals.map(v => (sign * v > 0 ? 1 : 0));
  const clean = (Ls, D) => {
    const out = Ls.map(s => ({ ...s }));
    for (const k of ['M', 'V', 'defl']) {
      const scale = Math.max(Math.abs(D[k]), ...Ls.map(s => Math.abs(s[k])));
      for (const s of out) if (Math.abs(s[k]) <= 1e-10 * scale) s[k] = 0;
    }
    return out;
  };
  const env = stations.map(st => {
    const D = at(mesh, dead, st.e, st.x), Ls = clean(live.map(s => at(mesh, s, st.e, st.x)), D);
    const sum = (key, sign) => Ls.reduce((a, s) => a + (sign * s[key] > 0 ? s[key] : 0), 0);
    return {
      X: st.X, span: st.span,
      Mmax: fD * D.M + fL * sum('M', 1), Mmin: fD * D.M + fL * sum('M', -1),
      Vmax: fD * D.V + fL * sum('V', 1), Vmin: fD * D.V + fL * sum('V', -1),
      DLmax: sum('defl', 1), DLmin: sum('defl', -1),
      DTmax: D.defl + sum('defl', 1), DTmin: D.defl + sum('defl', -1),
      pat: { Mmax: pick(Ls.map(s => s.M), 1), Mmin: pick(Ls.map(s => s.M), -1), Vmax: pick(Ls.map(s => s.V), 1), Vmin: pick(Ls.map(s => s.V), -1), Dmax: pick(Ls.map(s => s.defl), 1), Dmin: pick(Ls.map(s => s.defl), -1) },
    };
  });

  const build = (p, withDead, cD = fD, cL = fL) => combine([...(withDead ? [[cD, dead]] : [[0, dead]]), ...live.map((s, i) => [cL * p[i], s])]);
  const key = p => p.join('');

  // Per span: take the station that governs each quantity, re-solve its pattern, find the exact peak.
  const spanResults = m.spans.map((L, s) => {
    const sts = env.filter(r => r.span === s);
    const best = (field, cmp) => sts.reduce((b, r) => (cmp(r[field], b[field]) ? r : b));
    const out = { span: s + 1, length: L, cantilever: m.supports[s] === 'free' || m.supports[s + 1] === 'free' };
    const exact = (patArr, withDead, cL) => spanExtremes(mesh, build(patArr, withDead, fD, cL), s);
    const bMmax = best('Mmax', (a, b) => a > b), bMmin = best('Mmin', (a, b) => a < b);
    const eMax = exact(bMmax.pat.Mmax, true, fL).Mmax, eMin = exact(bMmin.pat.Mmin, true, fL).Mmin;
    out.Mpos = { value: Math.max(bMmax.Mmax, eMax.v), at: eMax.v >= bMmax.Mmax ? eMax.x : bMmax.X, liveOn: spansOn(bMmax.pat.Mmax, pattern) };
    out.Mneg = { value: Math.min(bMmin.Mmin, eMin.v), at: eMin.v <= bMmin.Mmin ? eMin.x : bMmin.X, liveOn: spansOn(bMmin.pat.Mmin, pattern) };
    const bVmax = best('Vmax', (a, b) => a > b), bVmin = best('Vmin', (a, b) => a < b);
    out.Vmax = Math.max(Math.abs(bVmax.Vmax), Math.abs(bVmin.Vmin));
    // deflection, live alone and total
    const bL = best('DLmax', (a, b) => a > b), bLn = best('DLmin', (a, b) => a < b);
    const bT = best('DTmax', (a, b) => a > b), bTn = best('DTmin', (a, b) => a < b);
    const eL = exact(bL.pat.Dmax, false, 1).Dmax, eLn = exact(bLn.pat.Dmin, false, 1).Dmin;
    const eT = exact(bT.pat.Dmax, true, 1), eTn = exact(bTn.pat.Dmin, true, 1);
    // total deflection uses unfactored D + L
    const deadOnly = spanExtremes(mesh, dead, s);
    const liveDown = Math.max(bL.DLmax, eL.v), liveUp = Math.min(bLn.DLmin, eLn.v);
    const totDown = Math.max(bT.DTmax, deadOnly.Dmax.v, eT.Dmax.v), totUp = Math.min(bTn.DTmin, deadOnly.Dmin.v, eTn.Dmin.v);
    out.defl = {
      live: Math.abs(liveDown) >= Math.abs(liveUp) ? liveDown : liveUp,
      liveAt: Math.abs(liveDown) >= Math.abs(liveUp) ? (eL.v >= bL.DLmax ? eL.x : bL.X) : (eLn.v <= bLn.DLmin ? eLn.x : bLn.X),
      total: Math.abs(totDown) >= Math.abs(totUp) ? totDown : totUp,
      dead: Math.abs(deadOnly.Dmax.v) >= Math.abs(deadOnly.Dmin.v) ? deadOnly.Dmax.v : deadOnly.Dmin.v,
    };
    if (!hasLive) { out.defl.live = 0; out.defl.liveAt = null; }
    return out;
  });

  // Reactions: dead, and the live envelope.
  const reactions = m.supports.map((type, k) => {
    const D = dead.R[k], Ls = live.map(s => s.R[k]);
    const pos = f => Ls.reduce((a, r) => a + Math.max(0, f(r)), 0), neg = f => Ls.reduce((a, r) => a + Math.min(0, f(r)), 0);
    return {
      support: k + 1, type, x: mesh.sup[k],
      dead: D.force, liveMax: pos(r => r.force), liveMin: neg(r => r.force),
      max: fD * D.force + fL * pos(r => r.force), min: fD * D.force + fL * neg(r => r.force),
      // unfactored D + worst-case live (used for uplift / bearing)
      serviceMax: D.force + pos(r => r.force), serviceMin: D.force + neg(r => r.force),
      momentMax: type === 'fixed' ? fD * D.moment + fL * pos(r => r.moment) : 0,
      momentMin: type === 'fixed' ? fD * D.moment + fL * neg(r => r.moment) : 0,
    };
  });

  const totals = {
    dead: m.loads.filter(l => l.case === 'D').reduce((a, l) => a + loadResultant(l), 0),
    live: m.loads.filter(l => l.case === 'L').reduce((a, l) => a + loadResultant(l), 0),
  };
  return { model: m, mesh, spans: spanResults, reactions, envelope: env.map(({ pat, ...r }) => r), totals, patterned: pattern && nG > 1, factors: { D: fD, L: fL }, _solve: { dead, live, build, key } };
}

function spansOn(p, pattern) { if (!pattern) return null; const on = []; p.forEach((v, i) => { if (v) on.push(i + 1); }); return on; }

export function loadResultant(l) {
  if (l.type === 'point') return l.P;
  if (l.type === 'udl') return (l.w1 + l.w2) / 2 * (l.x2 - l.x1);
  return 0;
}

/**
 * Serviceability and strength checks against typed allowables.
 * section = { S, A? (rectangular shear 1.5V/A), Fb, Fv?, liveLimit = 360, totalLimit = 240 } in consistent units
 * Cantilever spans are judged on twice the overhang (the common code footnote).
 */
export function checks(result, section = {}) {
  const liveLimit = section.liveLimit ?? 360, totalLimit = section.totalLimit ?? 240;
  return result.spans.map(s => {
    const Lref = s.cantilever ? 2 * s.length : s.length;
    const row = {
      span: s.span, Lref,
      liveRatio: s.defl.live ? Lref / Math.abs(s.defl.live) : Infinity,
      totalRatio: s.defl.total ? Lref / Math.abs(s.defl.total) : Infinity,
      liveAllowed: Lref / liveLimit, totalAllowed: Lref / totalLimit,
    };
    row.liveOk = Math.abs(s.defl.live) <= row.liveAllowed * (1 + 1e-12);
    row.totalOk = Math.abs(s.defl.total) <= row.totalAllowed * (1 + 1e-12);
    const Mabs = Math.max(Math.abs(s.Mpos.value), Math.abs(s.Mneg.value));
    if (section.S) { row.fb = Mabs / section.S; if (section.Fb) { row.fbRatio = row.fb / section.Fb; row.fbOk = row.fbRatio <= 1 + 1e-12; } }
    if (section.A) { row.fv = 1.5 * s.Vmax / section.A; if (section.Fv) { row.fvRatio = row.fv / section.Fv; row.fvOk = row.fvRatio <= 1 + 1e-12; } }
    return row;
  });
}

// ---- Units -------------------------------------------------------------
// Imperial: positions ft, P lb, w lb/ft, M lb·ft, E psi, I in^4 -> EI lb·ft², deflection reported in inches.
// Metric: positions m, P kN, w kN/m, M kN·m, E GPa, I mm^4 -> EI kN·m², deflection reported in mm.
export const UNITS = {
  imperial: { len: 'ft', force: 'lb', dist: 'lb/ft', moment: 'lb·ft', defl: 'in', deflScale: 12, E: 'psi', I: 'in⁴', S: 'in³', A: 'in²', stress: 'psi', EI: (E, I) => E * I / 144, stressOf: (M, S) => M * 12 / S, shearOf: (V, A) => V / A, sec: 'in' },
  metric: { len: 'm', force: 'kN', dist: 'kN/m', moment: 'kN·m', defl: 'mm', deflScale: 1000, E: 'GPa', I: 'mm⁴', S: 'mm³', A: 'mm²', stress: 'MPa', EI: (E, I) => E * 1e6 * I * 1e-12, stressOf: (M, S) => M * 1e6 / S, shearOf: (V, A) => V * 1e3 / A, sec: 'mm' },
};

/** Rectangular section properties from width b and depth d (in or mm). */
export function rectangle(b, d) { return { I: b * d ** 3 / 12, S: b * d * d / 6, A: b * d }; }

/**
 * One call for the page, CLI and agent: typed inputs in practical units, results in practical units.
 * input = { units, spans, supports, E, I | section:{b,d} | {I,S,A}, loads, pattern, factors, Fb, Fv, liveLimit, totalLimit }
 */
export function run(input) {
  const u = UNITS[input.units || 'imperial']; check(u, 'Units must be imperial or metric.');
  let sec = {};
  if (input.section && input.section.b != null) {
    const b = Number(input.section.b), d = Number(input.section.d);
    check(b > 0 && d > 0, 'Section width and depth must be positive.');
    const plies = Number(input.section.plies || 1); check(Number.isInteger(plies) && plies >= 1 && plies <= 6, 'Plies must be a whole number from 1 to 6.');
    sec = rectangle(b * plies, d);
  } else if (input.section) {
    sec = { I: Number(input.section.I), S: input.section.S != null ? Number(input.section.S) : undefined, A: input.section.A != null ? Number(input.section.A) : undefined };
  }
  const I = sec.I ?? Number(input.I);
  const E = Number(input.E);
  check(Number.isFinite(E) && E > 0, `Give the modulus E (${u.E}).`);
  check(Number.isFinite(I) && I > 0, `Give the moment of inertia I (${u.I}) or a section.`);
  const EI = u.EI(E, I);
  const result = analyse({ spans: input.spans, supports: input.supports, EI, loads: input.loads }, { pattern: input.pattern !== false, factors: input.factors });
  // stress per unit of S and A in the practical units
  const S = sec.S ?? (input.S != null ? Number(input.S) : undefined), A = sec.A ?? (input.A != null ? Number(input.A) : undefined);
  const rows = checks(result, { liveLimit: input.liveLimit, totalLimit: input.totalLimit });
  rows.forEach((r, i) => {
    const s = result.spans[i];
    const Mabs = Math.max(Math.abs(s.Mpos.value), Math.abs(s.Mneg.value));
    if (S) { r.fb = u.stressOf(Mabs, S); if (input.Fb) { r.fbRatio = r.fb / Number(input.Fb); r.fbOk = r.fbRatio <= 1 + 1e-12; } }
    if (A) { r.fv = 1.5 * u.shearOf(s.Vmax, A); if (input.Fv) { r.fvRatio = r.fv / Number(input.Fv); r.fvOk = r.fvRatio <= 1 + 1e-12; } }
  });
  const notes = [];
  for (const r of result.reactions) {
    if (r.type !== 'free' && r.serviceMin < -1e-9 * Math.max(1, Math.abs(result.totals.dead) + Math.abs(result.totals.live))) notes.push(`Support ${r.support} lifts: ${fmt(-r.serviceMin)} ${u.force} upward with dead load and the worst live pattern. It needs a hold-down sized by your engineer (an uplift check usually uses only part of the dead load, so the real figure is larger).`);
  }
  if (!S) notes.push('No section modulus given, so bending stress is not checked.');
  return { units: input.units || 'imperial', u, EI, section: sec, result, checks: rows, notes, ok: rows.every(r => r.liveOk && r.totalOk && r.fbOk !== false && r.fvOk !== false) };
}

export function fmt(v, dp = 0) {
  if (!Number.isFinite(v)) return '∞';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// A deck beam: three posts 8 ft apart with 18 in overhangs, carrying half of 12 ft joists
// at 40 psf live and 10 psf dead (240 and 60 lb/ft). E, Fb and Fv are example figures typed
// for illustration; take yours from the grade-stamp table for your species and grade.
export const EXAMPLE = {
  units: 'imperial',
  spans: [1.5, 8, 8, 1.5],
  supports: ['free', 'pin', 'pin', 'pin', 'free'],
  E: 1400000,
  section: { b: 1.5, d: 9.25, plies: 3 },
  Fb: 1000, Fv: 175,
  loads: [
    { type: 'udl', x1: 0, x2: 19, w1: 60, case: 'D' },
    { type: 'udl', x1: 0, x2: 19, w1: 240, case: 'L' },
  ],
};

/** Read one load written as CASE:value[..value2][@x1[-x2]], e.g. L:400@0-14, D:100..300@2-8, D:900@38. */
export function parseLoad(type, spec) {
  const m = /^([DL]):(-?[\d.]+)(?:\.\.(-?[\d.]+))?(?:@(-?[\d.]+)(?:-(-?[\d.]+))?)?$/i.exec(spec.trim());
  if (!m) throw new Error(`Cannot read the ${type} load "${spec}": use CASE:value@position, e.g. L:400@0-14 or D:900@38.`);
  const [, c, a, b, x1, x2] = m;
  if (type === 'udl') return { type, case: c.toUpperCase(), w1: +a, w2: b != null ? +b : +a, ...(x1 != null ? { x1: +x1 } : {}), ...(x2 != null ? { x2: +x2 } : {}) };
  if (x1 == null || b != null || x2 != null) throw new Error(`${type} load "${spec}": give one value and one position, e.g. D:900@38.`);
  return type === 'point' ? { type, case: c.toUpperCase(), P: +a, x: +x1 } : { type, case: c.toUpperCase(), M: +a, x: +x1 };
}


/** Parse the page's load box: one load per line, "udl L:240", "point D:900@12", "moment D:500@6"; # starts a comment. */
export function parseLoadLines(text) {
  const loads = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim(); if (!line) return;
    const m = /^(udl|point|moment)\s+(.+)$/i.exec(line);
    if (!m) throw new Error(`Load line ${i + 1}: start with udl, point or moment, e.g. "udl L:240" or "point D:900@12".`);
    try { loads.push(parseLoad(m[1].toLowerCase(), m[2].replace(/\s+/g, ''))); } catch (e) { throw new Error(`Load line ${i + 1}: ${e.message}`); }
  });
  return loads;
}
