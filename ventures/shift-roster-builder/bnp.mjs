// Branch-and-price on the least open hours: the Dantzig-Wolfe LP (one column per feasible set of shifts per person) solved
// exactly by a small revised simplex at every node, and branching on "person p holds shift s" / "p does not".
//
// Why: the open-hours floor in calc.mjs comes from a Lagrangian price tuned by subgradient steps, plus branching on that
// price. Subgradient steps only approach the LP value, and on the bench weeks they stop a few hours short of the true least
// open hours (eval/relaxation-check.py: the Dantzig-Wolfe LP is the strongest LP for these rules). Solving that LP exactly at
// each node, and branching on the fractional person-shift pairs it leaves, is the textbook way to close the integrality gap.
//
// Input: sets[p] = every valid shift set for person p (calc.mjs enumerates them with validList, so every hard rule the
// engine knows is inside the columns), len[s] = hours of shift s. The empty set must be among each person's sets.
// Output: a floor on open hours that is valid whatever the limits (the lowest bound still open, rounded up to the hour grid),
// `proven` when the floor reaches the incumbent, and the best roster an integral LP found, if it beat the incumbent.

const EPS = 1e-9;

// Revised simplex for  min c.x  s.t.  A x = 1 (every row), x >= 0, where each column of A is 0/1 and given by its row list.
// Rows 0..S-1 are shifts (held once, or open), rows S..S+P-1 are people (one set each). Big-M artificials start the basis
// for any row with no identity column; a basic artificial left positive at the optimum means the node is infeasible.
function solveLP(m, cols, cost, init, { maxPivots = 20000 } = {}) {
  const n = cols.length;
  const BIG_M = 1e6;
  // Column ids >= n are artificials: id n + r covers row r.
  const basis = Int32Array.from(init, (j, r) => (j >= 0 ? j : n + r));
  const colRows = (j) => (j < n ? cols[j] : [j - n]);
  const colCost = (j) => (j < n ? cost[j] : BIG_M);
  const inBasis = new Uint8Array(n + m);
  for (const j of basis) inBasis[j] = 1;
  let Binv = new Float64Array(m * m);
  const refactor = () => {
    // Invert B by Gauss-Jordan with partial pivoting (B is 0/1 and well scaled).
    const A = new Float64Array(m * 2 * m);
    for (let c = 0; c < m; c++) for (const r of colRows(basis[c])) A[r * 2 * m + c] = 1;
    for (let r = 0; r < m; r++) A[r * 2 * m + m + r] = 1;
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r * 2 * m + c]) > Math.abs(A[piv * 2 * m + c])) piv = r;
      if (Math.abs(A[piv * 2 * m + c]) < 1e-12) throw new Error("singular basis");
      if (piv !== c) for (let k = 0; k < 2 * m; k++) { const t = A[c * 2 * m + k]; A[c * 2 * m + k] = A[piv * 2 * m + k]; A[piv * 2 * m + k] = t; }
      const d = A[c * 2 * m + c];
      for (let k = 0; k < 2 * m; k++) A[c * 2 * m + k] /= d;
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const f = A[r * 2 * m + c];
        if (f !== 0) for (let k = 0; k < 2 * m; k++) A[r * 2 * m + k] -= f * A[c * 2 * m + k];
      }
    }
    // Rows of [I | B^-1] are in basis-position order after the swaps above: B^-1 row c belongs to basis position c.
    Binv = new Float64Array(m * m);
    for (let r = 0; r < m; r++) for (let k = 0; k < m; k++) Binv[r * m + k] = A[r * 2 * m + m + k];
  };
  refactor();
  const xB = new Float64Array(m);
  const computeX = () => { for (let r = 0; r < m; r++) { let v = 0; for (let k = 0; k < m; k++) v += Binv[r * m + k]; xB[r] = v; } };
  computeX();
  const y = new Float64Array(m);
  const d = new Float64Array(m);
  let pivots = 0, sinceRefactor = 0, degenerate = 0;
  for (;;) {
    // Duals y = c_B B^-1.
    y.fill(0);
    for (let r = 0; r < m; r++) { const cb = colCost(basis[r]); if (cb !== 0) for (let k = 0; k < m; k++) y[k] += cb * Binv[r * m + k]; }
    // Pricing: Dantzig's rule, Bland's (lowest index) after a run of degenerate pivots so the method cannot cycle.
    const bland = degenerate > 50;
    let enter = -1, best = -1e-9;
    for (let j = 0; j < n; j++) {
      if (inBasis[j]) continue;
      let rc = cost[j];
      for (const r of cols[j]) rc -= y[r];
      if (rc < best) { enter = j; best = rc; if (bland) break; }
    }
    if (enter < 0) break;
    d.fill(0);
    for (const r of cols[enter]) for (let k = 0; k < m; k++) d[k] += Binv[k * m + r];
    let leave = -1, ratio = Infinity;
    for (let r = 0; r < m; r++) {
      if (d[r] > EPS) {
        const t = xB[r] / d[r];
        if (t < ratio - 1e-12 || (Math.abs(t - ratio) <= 1e-12 && bland && basis[r] < basis[leave])) { ratio = t; leave = r; }
      }
    }
    if (leave < 0) throw new Error("unbounded LP"); // cannot happen: costs are >= 0
    degenerate = ratio < 1e-12 ? degenerate + 1 : 0;
    // Pivot.
    const dl = d[leave];
    for (let k = 0; k < m; k++) Binv[leave * m + k] /= dl;
    for (let r = 0; r < m; r++) {
      if (r === leave || Math.abs(d[r]) < 1e-15) continue;
      const f = d[r];
      for (let k = 0; k < m; k++) Binv[r * m + k] -= f * Binv[leave * m + k];
    }
    inBasis[basis[leave]] = 0;
    basis[leave] = enter;
    inBasis[enter] = 1;
    if (++sinceRefactor >= 64) { refactor(); sinceRefactor = 0; }
    computeX();
    if (++pivots > maxPivots) throw new Error("simplex pivot limit");
  }
  let obj = 0, infeasible = false;
  const x = new Float64Array(n);
  for (let r = 0; r < m; r++) {
    const j = basis[r];
    if (j >= n) { if (xB[r] > 1e-7) infeasible = true; continue; }
    x[j] = Math.max(0, xB[r]);
    obj += cost[j] * x[j];
  }
  return { obj, x, infeasible, pivots };
}

// Build a node's columns from the root sets and its branch decisions, solve its LP, and report the most fractional pair.
function evaluateNode(P, S, sets, len, fix) {
  // fix: Map key p*S+s -> 1 (p holds s) or 0 (p does not).
  const holder = new Int32Array(S).fill(-1);
  const ban = new Set();
  for (const [key, v] of fix) {
    const p = Math.floor(key / S), s = key % S;
    if (v === 1) holder[s] = p; else ban.add(key);
  }
  const cols = [], cost = [], owner = [], members = [];
  const init = new Int32Array(S + P).fill(-1);
  for (let s = 0; s < S; s++) {
    if (holder[s] >= 0) continue; // a held shift cannot stay open
    init[s] = cols.length;
    cols.push([s]); cost.push(len[s]); owner.push(-1); members.push([s]);
  }
  for (let p = 0; p < P; p++) {
    for (const f of sets[p]) {
      let ok = true;
      for (const s of f) if ((holder[s] >= 0 && holder[s] !== p) || ban.has(p * S + s)) { ok = false; break; }
      if (ok) for (let s = 0; s < S; s++) if (holder[s] === p && !f.includes(s)) { ok = false; break; }
      if (!ok) continue;
      if (f.length === 0) init[S + p] = cols.length;
      const rows = f.slice(); rows.push(S + p);
      cols.push(rows); cost.push(0); owner.push(p); members.push(f);
    }
  }
  const lp = solveLP(S + P, cols, cost, init);
  if (lp.infeasible) return { bound: Infinity };
  // x[p][s] = share of shift s that person p holds in the LP.
  const share = new Float64Array(P * S);
  let integral = true;
  for (let j = 0; j < cols.length; j++) {
    const v = lp.x[j];
    if (v <= EPS) continue;
    if (v < 1 - 1e-7) integral = false;
    if (owner[j] >= 0) for (const s of members[j]) share[owner[j] * S + s] += v;
  }
  let pick = -1, score = -1;
  for (let k = 0; k < P * S; k++) {
    const v = share[k];
    if (v > 1e-7 && v < 1 - 1e-7) {
      const sc = Math.min(v, 1 - v) * len[k % S];
      if (sc > score) { score = sc; pick = k; }
    }
  }
  let roster = null;
  if (integral) {
    roster = new Int32Array(S).fill(-1);
    for (let j = 0; j < cols.length; j++) if (lp.x[j] > 0.5 && owner[j] >= 0) for (const s of members[j]) roster[s] = owner[j];
  }
  return { bound: lp.obj, pick, roster, pivots: lp.pivots, columns: cols.length };
}

// Open hours come in whole shifts: when every shift length sits on one grid (hours, halves, quarters) a bound rounds up to it.
export function hourUnit(len) {
  return [1, 0.5, 0.25].find((u) => len.every((h) => Math.abs(h / u - Math.round(h / u)) < 1e-9)) || 0;
}
const roundUp = (v, unit) => Math.max(0, unit ? Math.ceil(v / unit - 1e-6) * unit : v - 1e-6);

export function branchAndPriceOpen(sets, len, { incumbentOpen = Infinity, nodeLimit = 5000, ms = 20000 } = {}) {
  const P = sets.length, S = len.length;
  const unit = hourUnit(len);
  const t0 = Date.now();
  const stats = { nodes: 0, pivots: 0, ms: 0, columns: sets.reduce((a, f) => a + f.length, 0) };
  let best = incumbentOpen, bestRoster = null;
  // A node is cut when its rounded bound cannot beat the best roster known.
  const cut = (b) => roundUp(b, unit) >= best - 1e-9;
  const evalFix = (fix) => {
    stats.nodes++;
    const r = evaluateNode(P, S, sets, len, fix);
    stats.pivots += r.pivots || 0;
    if (r.roster && r.bound < best - 1e-9) { best = r.bound; bestRoster = r.roster; }
    return { fix, ...r };
  };
  const root = evalFix(new Map());
  const rootLP = root.bound;
  const open = [];
  if (!cut(root.bound) && !root.roster) open.push(root);
  let aborted = false;
  while (open.length) {
    if (stats.nodes >= nodeLimit || Date.now() - t0 > ms) { aborted = true; break; }
    // Best-first: the lowest bound decides the floor, so expanding it is what can raise it.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].bound < open[bi].bound) bi = i;
    const nd = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cut(nd.bound)) continue;
    for (const v of [1, 0]) {
      const fix = new Map(nd.fix); fix.set(nd.pick, v);
      const c = evalFix(fix);
      if (c.bound === Infinity || cut(c.bound) || c.roster) continue;
      open.push(c);
    }
  }
  let low = best;
  for (const nd of open) if (nd.bound < low) low = nd.bound;
  const floor = Math.min(best, roundUp(low, unit));
  stats.ms = Date.now() - t0;
  return { floor, rootLP, best: best === Infinity ? null : best, roster: bestRoster, proven: !aborted || floor >= best - 1e-9, openNodes: open.length, stats };
}
