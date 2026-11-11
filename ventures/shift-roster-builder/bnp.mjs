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
// `warm` (optional) is a basis from an earlier solve of the same rows, as `basis` returns it: a column id, or -1 - r for the
// artificial of row r. Column ids must mean the same columns (callers only append columns between solves).
// `bigM` is the cost of an artificial; it must exceed every column cost (the whole-score LP has open shifts at 100,000 per hour).
export function solveLP(m, cols, cost, init, { maxPivots = 20000, warm = null, bigM = 1e6 } = {}) {
  const n = cols.length;
  const BIG_M = bigM;
  // Column ids >= n are artificials: id n + r covers row r.
  const basis = warm ? Int32Array.from(warm, (j) => (j >= 0 ? j : n + (-1 - j))) : Int32Array.from(init, (j, r) => (j >= 0 ? j : n + r));
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
  // Basic values within 1e-9 of zero are set to zero. Without this, rounding left values like 1e-11 on degenerate rows, the
  // ratio test saw a step of 1e-11 as progress, the anti-cycling switch below never stayed on, and a 20-person week (102 rows,
  // 497 columns) cycled at its optimum past 400,000 pivots (eval/cg-scale-bench.mjs, 2026-11-10). With it: 479 pivots.
  const computeX = () => { for (let r = 0; r < m; r++) { let v = 0; for (let k = 0; k < m; k++) v += Binv[r * m + k]; xB[r] = Math.abs(v) < 1e-9 ? 0 : v; } };
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
    // Entering tolerance relative to the duals: while big-M artificials are basic the duals are near 1e6 and a reduced cost of
    // -1e-9 is rounding, and a 40-person week made 200,000 pivots on such columns without ending (eval/cg-scale-bench.mjs).
    let ymax = 0;
    for (let k = 0; k < m; k++) if (Math.abs(y[k]) > ymax) ymax = Math.abs(y[k]);
    let enter = -1, best = -1e-11 * (1 + ymax);
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
    degenerate = ratio < 1e-9 ? degenerate + 1 : 0;
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
  return { obj, x, infeasible, pivots, y, basis: Int32Array.from(basis, (j) => (j < n ? j : -1 - (j - n))) };
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

// Branch-and-price by true column generation: the same Dantzig-Wolfe LP as branchAndPriceOpen, but the columns are not
// enumerated up front. `price(p, w, need, ban)` is a per-person pricing oracle: the valid shift set for person p that holds every
// shift in `need` (an array), none in `ban` (a Set), and has the largest sum of w[s]; it returns { set, value, exact }, with
// set null when no valid set holds all of `need`. Weeks where one person has more valid sets than can be listed (the 60,000 cap
// in calc.mjs) get the LP this way.
//
// Each node solves the restricted LP over the columns found so far, asks the oracle for each person's best set at the LP's
// shift prices, adds any set with negative reduced cost, and repeats. Before the LP is settled, the Lagrangian (Lasdon) bound
// (sum of duals) + sum_p min(0, best reduced cost of p) is still a valid floor, because each person holds exactly one set; so a
// node can be cut early, and a node the time limit stops keeps a valid bound. When the oracle cannot finish (`exact: false`)
// the node keeps its parent's bound, which is valid because a child's LP can only be higher.
//
// Identical shifts (`cls[s]`, the same class for copies of one shift line: same day, times and who may take them) are branched
// on as one: "p holds a copy of class k" or "p holds none". Branching on single copies leaves the LP free to move p to the
// other copy at no cost, so the bound never rises (measured: 47.00 at every node of the rolling-gap 10x28 set 0 for 100,000
// nodes, against an optimum of 48). A node whose LP is settled and whose class shares are all 0 or 1 is solved: every set
// p uses at that node holds the same classes, so handing each holder of a class a different copy is a roster at the LP value.
//
// Costed columns (2026-11-10, later): the same search bounds any objective of the form  sum over open shifts of openCost[s]  +  sum over
// people of cost(p, set), when `price` also returns the set's `cost` and its `value` is sum of w[s] over the set minus that cost.
// The open-hours LP is the case openCost = len, cost = 0. The whole roster score (pay, penalties and 100,000 per open hour) is
// another (scoreBoundByColumnGeneration in calc.mjs); pass `unit: 0` there so bounds are not rounded to the hour grid.
export function columnGenerationOpen(P, len, price, { incumbentOpen = Infinity, nodeLimit = 2000, ms = 20000, maxRounds = 400, cls = null, dive = true, rootDive = true, diveWidth = null, warm = true, openCost = null, unit: unitOpt = null, tolerance = 0, diveBacktrack = null } = {}) {
  const S = len.length;
  const oc = openCost || len;
  let maxCost = 0;
  for (const c of oc) if (c > maxCost) maxCost = c;
  const bigM = Math.max(1e6, maxCost * 1000);
  const C = cls ? Int32Array.from(cls) : Int32Array.from({ length: S }, (_, s) => s);
  const copies = new Map();
  for (let s = 0; s < S; s++) { if (!copies.has(C[s])) copies.set(C[s], []); copies.get(C[s]).push(s); }
  const unit = unitOpt ?? hourUnit(len);
  const t0 = Date.now();
  const timeUp = () => Date.now() - t0 > ms;
  const stats = { nodes: 0, pivots: 0, ms: 0, columns: 0, rounds: 0, pricingCalls: 0, inexactPricing: 0, maxPricingNodes: 0, pricingMs: 0, classes: copies.size };
  const pool = [], seen = new Set();
  const addCol = (p, set, cost = 0) => {
    const f = [...set].sort((a, b) => a - b);
    const key = p + ":" + f.join(",");
    if (seen.has(key)) return false;
    seen.add(key); pool.push({ p, f, cost }); stats.columns++;
    return true;
  };
  // Each person's empty set starts the pool (it keeps every person row covered); with costed columns its cost comes from the
  // oracle with every price at zero and every shift banned, which can only return the empty set.
  const allBanned = new Set(Array.from({ length: S }, (_, s) => s));
  for (let p = 0; p < P; p++) addCol(p, [], openCost ? price(p, new Float64Array(S), [], allBanned).cost || 0 : 0);
  let best = incumbentOpen, bestRoster = null;
  // A node is cut when its bound cannot beat the best roster by more than `tolerance`. The lowest bound cut that way is kept, so
  // the floor reported stays valid when the tolerance (not the bound) closed the search.
  let cutLow = Infinity;
  const cut = (b) => {
    const r = roundUp(b, unit);
    if (r >= best - tolerance - 1e-9) { if (r < cutLow) cutLow = r; return true; }
    return false;
  };

  // fix: Map key p*S+k -> 1 (p holds a copy of class k) or 0 (p holds no copy of class k).
  // pins (dive only): Map p -> { f, key }, person p holds exactly set f (those very copies) and nobody else holds them. A pinned
  // node's bound holds only for rosters inside the pins, so the dive uses it to find rosters, never as a floor.
  const evalNode = (fix, parentBound, pins = null) => {
    stats.nodes++;
    const needCls = Array.from({ length: P }, () => []);
    const ban = Array.from({ length: P }, () => new Set());
    for (const [key, v] of fix) {
      const p = Math.floor(key / S), k = key % S;
      if (v === 1) needCls[p].push(k); else for (const s of copies.get(k)) ban[p].add(s);
    }
    if (pins) for (const [q, { f }] of pins) for (let p = 0; p < P; p++) if (p !== q) for (const s of f) ban[p].add(s);
    const fits = (c) => {
      const pin = pins && pins.get(c.p);
      if (pin) return pin.key === c.f.join(",");
      return c.f.every((s) => !ban[c.p].has(s)) && needCls[c.p].every((k) => c.f.some((s) => C[s] === k));
    };
    let lb = parentBound, z = Infinity, lp = null, cols = null, owner = null, members = null, cost = null, settled = false
    let prevBasis = null;
    for (let round = 0; round < maxRounds; round++) {
      stats.rounds++;
      cols = []; owner = []; members = []; cost = [];
      const init = new Int32Array(S + P).fill(-1);
      for (let s = 0; s < S; s++) { init[s] = cols.length; cols.push([s]); cost.push(oc[s]); owner.push(-1); members.push([s]); }
      for (const c of pool) {
        if (!fits(c)) continue;
        if (c.f.length === 0) init[S + c.p] = cols.length;
        const rows = c.f.slice(); rows.push(S + c.p);
        cols.push(rows); cost.push(c.cost); owner.push(c.p); members.push(c.f);
      }
      try {
        // Within a node the pool only grows at the end and `fits` does not change, so last round's basis is still a feasible
        // basis of this round's LP: start from it (warm) rather than from the artificials. A failed warm solve retries cold.
        try { lp = solveLP(S + P, cols, cost, init, { warm: warm ? prevBasis : null, bigM }); }
        catch (e) { if (!warm || !prevBasis) throw e; lp = solveLP(S + P, cols, cost, init, { bigM }); }
        prevBasis = lp.basis;
      } catch (e) {
        // A solver failure (pivot limit, singular basis) stops this node with the bound it already has, which is still valid;
        // the search then reports the floor unproven instead of throwing out of buildRoster.
        stats.lpFailures = (stats.lpFailures || 0) + 1;
        return { fix, bound: lb, pick: -1, settled: false, solved: false };
      }
      stats.pivots += lp.pivots;
      // The restricted LP's full objective (big-M artificials included) equals its dual objective, the sum of the duals.
      z = 0;
      for (let r = 0; r < S + P; r++) z += lp.y[r];
      const w = Float64Array.from({ length: S }, (_, s) => lp.y[s]);
      let added = 0, lagr = z, exact = true;
      for (let p = 0; p < P; p++) {
        const pin = pins && pins.get(p);
        if (pin) {
          // A pinned person has one column; its reduced cost still enters the Lagrangian bound of the pinned problem.
          let rc = pin.cost - lp.y[S + p];
          for (const s of pin.f) rc -= lp.y[s];
          if (rc < 0) lagr += rc;
          continue;
        }
        stats.pricingCalls++;
        // A needed class is held through its highest-priced copy: copies are interchangeable for p, so that copy is p's best.
        const need = needCls[p].map((k) => copies.get(k).reduce((a, s) => (w[s] > w[a] ? s : a)));
        const tp = Date.now();
        const r = price(p, w, need, ban[p]);
        stats.pricingMs += Date.now() - tp;
        if (r.nodes > stats.maxPricingNodes) stats.maxPricingNodes = r.nodes;
        if (!r.exact) { exact = false; stats.inexactPricing++; }
        if (!r.set) { lagr = Infinity; continue; }
        const rc = -r.value - lp.y[S + p];
        // Any negative reduced cost lowers the Lagrangian bound (so it stays valid under rounding); only a clearly negative one is a new
        // column, or the duals' rounding (about 1e-10 of 100,000-per-hour open costs) would add columns forever.
        if (rc < 0) lagr += rc;
        if (rc < -1e-9 * (1 + Math.abs(lp.y[S + p])) && addCol(p, r.set, r.cost || 0)) added++;
      }
      if (lagr === Infinity) return { bound: Infinity }; // someone has no valid set under this node's fixes
      if (exact) lb = Math.max(lb, lagr);
      if (!added) { if (exact) { lb = Math.max(lb, lp.infeasible ? Infinity : lagr); settled = true; } break; }
      if (cut(lb) || timeUp()) break;
    }
    if (lb === Infinity) return { bound: Infinity };
    // Class shares: how much of class k person p holds in the LP. Branch on the most fractional pair, weighted by hours.
    const share = new Map();
    for (let j = 0; j < cols.length; j++) {
      const v = lp.x[j];
      if (v <= EPS || owner[j] < 0) continue;
      for (const s of members[j]) { const key = owner[j] * S + C[s]; share.set(key, (share.get(key) || 0) + v); }
    }
    let pick = -1, score = -1;
    for (const [key, v] of share) {
      if (v > 1e-7 && v < 1 - 1e-7) { const sc = Math.min(v, 1 - v) * len[key % S]; if (sc > score) { score = sc; pick = key; } }
    }
    let solved = false;
    if (pick < 0 && settled && !lp.infeasible) {
      // Every class share is 0 or 1: build the roster from each person's heaviest column, giving holders distinct copies.
      const roster = new Int32Array(S).fill(-1);
      const free = new Map([...copies].map(([k, ss]) => [k, ss.slice()]));
      let ok = true, used = 0;
      for (let p = 0; p < P && ok; p++) {
        let bj = -1;
        for (let j = 0; j < cols.length; j++) if (owner[j] === p && lp.x[j] > EPS && (bj < 0 || lp.x[j] > lp.x[bj])) bj = j;
        if (bj < 0) continue;
        used += cost[bj];
        for (const s of members[bj]) {
          const k = C[s], list = free.get(k);
          const at = list.includes(s) ? list.indexOf(s) : 0; // keep p's own copy when it is still free
          if (!list.length) { ok = false; break; }
          roster[list[at]] = p; list.splice(at, 1);
        }
      }
      if (ok) {
        // Copies of a class cost the same to whoever holds them, so the roster's value is the chosen columns' costs plus the open shifts.
        let openH = used;
        for (let s = 0; s < S; s++) if (roster[s] < 0) openH += oc[s];
        if (openH < best - 1e-9) { best = openH; bestRoster = roster; }
        solved = openH <= lb + 1e-7 * (1 + Math.abs(lb));
      }
    }
    let lpCols = null;
    if (pins) {
      lpCols = [];
      for (let j = 0; j < cols.length; j++) if (owner[j] >= 0 && lp.x[j] > EPS) lpCols.push({ p: owner[j], f: members[j], cost: cost[j], x: lp.x[j] });
    }
    return { fix, bound: lb, pick, settled, solved, lpCols };
  };

  // Root dive (2026-11-11): a primal heuristic for weeks where the root LP is already the optimum but the tree does not reach a
  // roster in time (60 people x 168 lines: floor = HiGHS optimum on 3 of 3 weeks, 13-31 nodes and no roster in 60 s). Each step
  // pins every unpinned person whose LP column is at 1, plus the person with the heaviest fractional column, then re-prices the
  // rest; it ends at an integral LP (a roster), when the pinned problem cannot beat the best roster, or after `diveSteps`. No
  // backtracking: a failed dive costs its steps and leaves the tree search as it was.
  // Backtracking (2026-11-11 later): with `backtrack` > 0 the dive is a depth-first search. When a step dead-ends (the pinned
  // problem is infeasible or cannot beat the best roster) it returns to the step before and pins that step's next fractional
  // candidate instead, up to `backtrack` such retries in all (a retry is one extra pinned LP). A roster found above the root
  // bound does not end the search: it only tightens the cut, so later branches must beat it. Still a heuristic: rosters only,
  // never a floor. Retries stop once half of `ms` is spent, so a long dive leaves the tree its share of the time.
  const runDive = (maxSteps, width, backtrack = 0) => {
    let retries = backtrack;
    const goal = () => cut(root.bound); // a roster meets the root bound
    const go = (pins, depth) => {
      if (depth >= maxSteps || timeUp()) return;
      stats.diveSteps = (stats.diveSteps || 0) + 1;
      const r = evalNode(new Map(), 0, pins);
      if (r.bound === Infinity || r.solved || !r.lpCols) return;
      if (roundUp(r.bound, unit) >= best - tolerance - 1e-9) return;
      const base = new Map(pins);
      const frac = [];
      for (const c of r.lpCols) {
        if (base.has(c.p)) continue;
        if (c.x > 1 - 1e-7) base.set(c.p, { f: c.f, key: c.f.join(","), cost: c.cost });
        else frac.push(c);
      }
      // Then the heaviest fractional columns, up to `width` of them, of different people and sharing no shift copy with each other
      // or with a pin (a shared copy would leave the pinned problem infeasible).
      frac.sort((a, b) => b.x - a.x || b.f.length - a.f.length);
      const taken = new Set();
      for (const [, { f }] of base) for (const s of f) taken.add(s);
      const fits = frac.filter((c) => !c.f.some((s) => taken.has(s)));
      const pick = (from, n) => {
        const next = new Map(base), t = new Set(taken);
        let took = 0;
        for (let i = from; i < fits.length && took < n; i++) {
          const c = fits[i];
          if (next.has(c.p) || c.f.some((s) => t.has(s))) continue;
          next.set(c.p, { f: c.f, key: c.f.join(","), cost: c.cost }); took++;
          for (const s of c.f) t.add(s);
        }
        return next.size > pins.size ? next : null;
      };
      const first = pick(0, width);
      if (!first) return;
      go(first, depth + 1);
      // Retry this step with the next candidates, one pin each, while retries last and no roster meets the root bound.
      for (let i = 1; i < fits.length && retries > 0 && !goal() && Date.now() - t0 < ms / 2; i++) {
        if (roundUp(r.bound, unit) >= best - tolerance - 1e-9) return; // a roster found below now beats this whole subtree
        const alt = pick(i, 1);
        if (!alt) continue;
        retries--; stats.diveRetries = (stats.diveRetries || 0) + 1;
        go(alt, depth + 1);
      }
    };
    go(new Map(), 0);
  };

  const root = evalNode(new Map(), 0);
  const rootLP = root.bound;
  if (rootDive && root.bound !== Infinity && !root.solved && !cut(root.bound)) {
    // A wide dive (several fractional pins a step) first, a narrow one (one a step) unless a roster already meets the root bound: on the 40-person bench
    // weeks a width of 6 took 7 steps where width 1 took 31-38, but missed one week the narrow dive solves.
    const before = best;
    const widths = diveWidth ? [diveWidth] : [Math.max(1, Math.ceil(P / 7)), 1];
    for (const w of [...new Set(widths)]) {
      if (timeUp() || cut(root.bound)) break; // stop once a roster meets the root bound
      runDive(P + 1, w, w === 1 ? (diveBacktrack ?? P) : 0);
    }
    stats.diveFound = best < before;
  }
  const open = [];
  if (root.bound !== Infinity && !cut(root.bound) && !root.solved) open.push(root);
  let aborted = false;
  while (open.length) {
    if (stats.nodes >= nodeLimit || timeUp()) { aborted = true; break; }
    let bi = 0;
    if (dive) {
      // Best bound on the open-hours grid, deepest first among ties: when the LP is tight, nodes share the bound and this
      // follows one branch down to a roster instead of widening the tree level by level.
      const key = (nd) => roundUp(nd.bound, unit);
      for (let i = 1; i < open.length; i++) {
        const a = key(open[i]), b = key(open[bi]);
        if (a < b - 1e-9 || (a < b + 1e-9 && open[i].fix.size > open[bi].fix.size)) bi = i;
      }
    } else for (let i = 1; i < open.length; i++) if (open[i].bound < open[bi].bound) bi = i;
    const nd = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cut(nd.bound)) continue;
    if (nd.pick < 0) { open.push(nd); aborted = true; break; } // unsettled with nothing fractional: no branch to take
    for (const v of [1, 0]) {
      const fix = new Map(nd.fix); fix.set(nd.pick, v);
      const c = evalNode(fix, nd.bound);
      if (c.bound === Infinity || cut(c.bound) || c.solved) continue;
      open.push(c);
    }
  }
  let low = best;
  for (const nd of open) if (nd.bound < low) low = nd.bound;
  const floor = Math.min(best, roundUp(low, unit), cutLow);
  stats.ms = Date.now() - t0;
  return { floor, rootLP, rootSettled: root.settled, best: best === Infinity ? null : best, roster: bestRoster, proven: (!aborted && open.length === 0) || floor >= best - tolerance - 1e-9, openNodes: open.length, stats };
}
