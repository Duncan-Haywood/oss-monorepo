// Cutting bars from stock lengths with the least steel bought.
//
// The model is the cutting-stock problem (Gilmore and Gomory, 1961): pieces
// of length l_i are needed d_i times; stock bars come in one or more lengths
// L_k; a pattern is a way to cut one stock bar; choose how many times to use
// each pattern so every piece is cut and the total stock length bought is
// least. Steps:
//
// 1. The linear relaxation is solved exactly by column generation: a revised
//    simplex on the patterns found so far, and a bounded-knapsack dynamic
//    programme that prices out the best new pattern for each stock length
//    from the simplex duals. When no pattern prices out, the LP optimum is
//    proven (no pattern anywhere has negative reduced cost).
// 2. Its value is a lower bound on any cutting plan. With one stock length,
//    the bound is rounded up to whole bars.
// 3. A whole-bar plan is built three ways (the LP solution rounded down and
//    the rest cut by a greedy best-fill programme, the greedy programme
//    alone, and first-fit decreasing) and the cheapest is kept. When it meets
//    the rounded bound, it is proven optimal; otherwise the gap is reported.
//
// Lengths are integers (mm). `kerf` is lost at every cut (0 for shear cutting).

const EPS = 1e-9;

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

// Bounded knapsack: maximise sum v_i a_i with sum w_i a_i <= cap, 0 <= a_i <= ub_i,
// by binary splitting into 0/1 items and a DP over capacity. Returns counts.
export function boundedKnapsack(values, weights, ubs, cap) {
  const items = [];
  values.forEach((v, i) => {
    if (v <= EPS || weights[i] > cap || ubs[i] <= 0) return;
    let left = Math.min(ubs[i], Math.floor(cap / weights[i]));
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      items.push({ i, n: take, v: v * take, w: weights[i] * take });
      left -= take;
    }
  });
  const best = new Float64Array(cap + 1);
  const choice = [];
  for (let t = 0; t < items.length; t++) {
    const { v, w } = items[t];
    const took = new Uint8Array(cap + 1);
    for (let c = cap; c >= w; c--) {
      const cand = best[c - w] + v;
      if (cand > best[c] + EPS) { best[c] = cand; took[c] = 1; }
    }
    choice.push(took);
  }
  const counts = new Array(values.length).fill(0);
  let c = cap;
  for (let t = items.length - 1; t >= 0; t--) {
    if (choice[t][c]) { counts[items[t].i] += items[t].n; c -= items[t].w; }
  }
  return { value: best[cap], counts };
}

// Scale lengths by their common divisor so the knapsack runs on a small grid.
function scaled(pieceLens, stockLens, kerf) {
  const all = [...pieceLens.map(l => l + kerf), ...stockLens.map(L => L + kerf)];
  const g = all.reduce((a, b) => gcd(a, b));
  return {
    w: pieceLens.map(l => (l + kerf) / g),
    caps: stockLens.map(L => (L + kerf) / g),
  };
}

function patternLength(a, lens) { return a.reduce((s, n, i) => s + n * lens[i], 0); }

// Revised simplex for min c.x, A x = b, x >= 0, columns added on demand.
// Starts from the homogeneous patterns, which form a feasible diagonal basis.
export function solveLP(lens, demand, stock, kerf = 0, { maxIter = 5000 } = {}) {
  const m = lens.length;
  const { w, caps } = scaled(lens, stock.map(s => s.length), kerf);
  const cols = [];
  const basis = [];
  // Initial basis: for each piece, the stock length that cuts it cheapest per piece.
  for (let i = 0; i < m; i++) {
    let best = null;
    stock.forEach((s, k) => {
      const n = Math.min(demand[i], Math.floor(caps[k] / w[i]));
      if (n > 0 && (!best || s.cost / n < best.cost / best.n)) best = { k, n, cost: s.cost };
    });
    if (!best) throw new Error(`A ${lens[i]} mm piece is longer than every stock bar.`);
    const a = new Array(m).fill(0); a[i] = best.n;
    cols.push({ a, k: best.k, cost: best.cost });
    basis.push(i);
  }
  // Explicit basis inverse (m is the number of distinct lengths, small).
  let Binv = Array.from({ length: m }, (_, i) => { const r = new Array(m).fill(0); r[i] = 1 / cols[i].a[i]; return r; });
  let xB = demand.map((d, i) => d / cols[i].a[i]);
  let iter = 0;
  let y;
  for (; iter < maxIter; iter++) {
    // Duals y = c_B B^-1.
    y = new Array(m).fill(0);
    for (let r = 0; r < m; r++) { const c = cols[basis[r]].cost; for (let j = 0; j < m; j++) y[j] += c * Binv[r][j]; }
    // Price: best pattern per stock length.
    let enter = null;
    stock.forEach((s, k) => {
      const { value, counts } = boundedKnapsack(y, w, demand, caps[k]);
      const reduced = s.cost - value;
      if (reduced < -1e-7 * Math.max(1, s.cost) && (!enter || reduced < enter.reduced)) enter = { a: counts, k, cost: s.cost, reduced };
    });
    if (!enter) break;
    // Direction u = B^-1 a.
    const u = Binv.map(row => row.reduce((s, v, j) => s + v * enter.a[j], 0));
    let leave = -1, ratio = Infinity;
    for (let r = 0; r < m; r++) if (u[r] > EPS) { const t = xB[r] / u[r]; if (t < ratio - EPS) { ratio = t; leave = r; } }
    if (leave < 0) throw new Error('Unbounded LP (cannot happen with positive costs).');
    cols.push({ a: enter.a, k: enter.k, cost: enter.cost });
    // Pivot.
    const pr = Binv[leave].map(v => v / u[leave]);
    Binv = Binv.map((row, r) => (r === leave ? pr : row.map((v, j) => v - u[r] * pr[j])));
    xB = xB.map((x, r) => (r === leave ? ratio : x - u[r] * ratio));
    basis[leave] = cols.length - 1;
  }
  const x = basis.map((c, r) => ({ col: cols[c], x: Math.max(0, xB[r]) })).filter(e => e.x > EPS);
  const value = x.reduce((s, e) => s + e.x * e.col.cost, 0);
  return { value, x, duals: y, iterations: iter, proven: iter < maxIter };
}

// Greedy best-fill: repeatedly cut the pattern that wastes the least share of
// its stock bar from what is left, as many times as the demand allows.
function greedyFill(lens, demand, stock, kerf) {
  const { w, caps } = scaled(lens, stock.map(s => s.length), kerf);
  const left = demand.slice();
  const plan = [];
  while (left.some(n => n > 0)) {
    let best = null;
    stock.forEach((s, k) => {
      const { counts } = boundedKnapsack(w, w, left, caps[k]);
      const used = patternLength(counts, lens);
      if (used <= 0) return;
      const score = used / s.cost; // steel used per unit bought
      if (!best || score > best.score + EPS) best = { a: counts, k, score };
    });
    if (!best) throw new Error('A piece is longer than every stock bar.');
    let times = Infinity;
    best.a.forEach((n, i) => { if (n > 0) times = Math.min(times, Math.floor(left[i] / n)); });
    best.a.forEach((n, i) => { left[i] -= n * times; });
    plan.push({ a: best.a, k: best.k, times });
  }
  return plan;
}

// Diving: fix the pattern the LP uses most (rounded up, at least one bar),
// take its pieces off the demand, solve the LP again on what is left, repeat.
function lpDive(lens, demand, stock, kerf) {
  const left = demand.slice();
  const plan = [];
  for (let guard = 0; guard < 10000 && left.some(n => n > 0); guard++) {
    const idx = left.map((n, i) => (n > 0 ? i : -1)).filter(i => i >= 0);
    const lp = solveLP(idx.map(i => lens[i]), idx.map(i => left[i]), stock, kerf);
    const top = lp.x.reduce((b, e) => (e.x > b.x ? e : b));
    const frac = lp.x.reduce((b, e) => (e.x - Math.floor(e.x) > b.x - Math.floor(b.x) ? e : b));
    const pick = top.x >= 1 ? { col: top.col, times: Math.floor(top.x + 1e-7) } : { col: frac.col, times: 1 };
    const a = new Array(lens.length).fill(0);
    idx.forEach((i, j) => { a[i] = pick.col.a[j]; });
    let times = pick.times;
    a.forEach((n, i) => { if (n > 0) times = Math.min(times, Math.ceil(left[i] / n)); });
    a.forEach((n, i) => { left[i] = Math.max(0, left[i] - n * times); });
    plan.push({ a, k: pick.col.k, times });
  }
  return plan;
}

// First-fit decreasing into the longest stock length: what a cutter does by hand.
export function firstFitDecreasing(lens, demand, stock, kerf = 0) {
  const k = stock.reduce((b, s, i) => (s.length > stock[b].length ? i : b), 0);
  const L = stock[k].length;
  const pieces = [];
  lens.forEach((l, i) => { for (let n = 0; n < demand[i]; n++) pieces.push(i); });
  pieces.sort((p, q) => lens[q] - lens[p]);
  const bars = [];
  for (const i of pieces) {
    if (lens[i] > L) throw new Error(`A ${lens[i]} mm piece is longer than the stock bar.`);
    let bar = bars.find(b => b.used + lens[i] + (b.n ? kerf : 0) <= L);
    if (!bar) { bar = { used: 0, n: 0, a: new Array(lens.length).fill(0) }; bars.push(bar); }
    bar.used += lens[i] + (bar.n ? kerf : 0); bar.n++; bar.a[i]++;
  }
  return bars.map(b => ({ a: b.a, k, times: 1 }));
}

function planCost(plan, stock) { return plan.reduce((s, p) => s + p.times * stock[p.k].cost, 0); }

// Merge identical patterns, and drop pieces cut beyond the demand.
function tidy(plan, demand, lens) {
  const left = demand.slice();
  const out = new Map();
  for (const p of plan) {
    for (let t = 0; t < p.times; t++) {
      const a = p.a.map((n, i) => { const take = Math.min(n, left[i]); left[i] -= take; return take; });
      if (a.every(n => n === 0)) continue;
      const key = `${p.k}|${a.join(',')}`;
      const e = out.get(key);
      if (e) e.times++; else out.set(key, { a, k: p.k, times: 1 });
    }
  }
  return [...out.values()].sort((p, q) => q.times - p.times || patternLength(q.a, lens) - patternLength(p.a, lens));
}

// Plan the cutting for one bar size.
// pieces: [{ length, count }]; stock: [{ length, cost? }] (cost defaults to length).
export function planCutting(pieces, stockIn, { kerf = 0 } = {}) {
  const merged = new Map();
  for (const p of pieces) if (p.count > 0) merged.set(p.length, (merged.get(p.length) || 0) + p.count);
  const lens = [...merged.keys()].sort((a, b) => b - a);
  const demand = lens.map(l => merged.get(l));
  const stock = stockIn.map(s => ({ length: s.length, cost: s.cost ?? s.length }));
  if (!lens.length) return { patterns: [], bars: 0, bought: 0, lowerBound: 0, gap: 0, proven: true };
  const maxStock = Math.max(...stock.map(s => s.length));
  const tooLong = lens.filter(l => l > maxStock);
  if (tooLong.length) throw new Error(`Cut lengths ${tooLong.join(', ')} mm exceed the longest stock bar (${maxStock} mm): lap or order special lengths.`);

  const lp = solveLP(lens, demand, stock, kerf);
  // Candidate 1: LP rounded down, remainder by greedy fill.
  const floorPlan = lp.x.map(e => ({ a: e.col.a, k: e.col.k, times: Math.floor(e.x + 1e-7) })).filter(p => p.times > 0);
  const left = demand.slice();
  for (const p of floorPlan) p.a.forEach((n, i) => { left[i] -= n * p.times; });
  const rest = left.some(n => n > 0) ? greedyFill(lens, left.map(n => Math.max(0, n)), stock, kerf) : [];
  // Candidate 2: LP rounded up (then the surplus pieces are dropped by tidy).
  const ceilPlan = lp.x.map(e => ({ a: e.col.a, k: e.col.k, times: Math.ceil(e.x - 1e-7) }));
  const candidates = [
    { how: 'lp-round-down + best-fill', plan: [...floorPlan, ...rest] },
    { how: 'lp-dive', plan: lpDive(lens, demand, stock, kerf) },
    { how: 'lp-round-up', plan: ceilPlan },
    { how: 'best-fill', plan: greedyFill(lens, demand, stock, kerf) },
    { how: 'first-fit decreasing', plan: firstFitDecreasing(lens, demand, stock, kerf) },
  ].map(c => ({ ...c, plan: tidy(c.plan, demand, lens) }));
  for (const c of candidates) {
    const cut = new Array(lens.length).fill(0);
    c.plan.forEach(p => p.a.forEach((n, i) => { cut[i] += n * p.times; }));
    c.ok = cut.every((n, i) => n === demand[i]);
    c.cost = planCost(c.plan, stock);
  }
  const best = candidates.filter(c => c.ok).sort((p, q) => p.cost - q.cost)[0];
  // Lower bound: with one stock length, whole bars; otherwise the LP value
  // rounded up to the common step of the stock costs.
  let lowerBound;
  if (stock.length === 1) lowerBound = Math.ceil(lp.value / stock[0].cost - 1e-6) * stock[0].cost;
  else {
    const g = stock.map(s => Math.round(s.cost)).reduce((a, b) => gcd(a, b));
    lowerBound = Math.ceil(lp.value / g - 1e-6) * g;
  }
  const ffd = candidates.find(c => c.how === 'first-fit decreasing');
  const patterns = best.plan.map(p => {
    const used = patternLength(p.a, lens) + kerf * Math.max(0, p.a.reduce((s, n) => s + n, 0) - 1);
    return {
      stock: stock[p.k].length, times: p.times,
      cuts: lens.flatMap((l, i) => (p.a[i] ? [{ length: l, count: p.a[i] }] : [])),
      used, offcut: stock[p.k].length - used,
    };
  });
  const bought = patterns.reduce((s, p) => s + p.times * p.stock, 0);
  const needed = lens.reduce((s, l, i) => s + l * demand[i], 0);
  return {
    patterns, method: best.how,
    bars: patterns.reduce((s, p) => s + p.times, 0),
    bought, needed, waste: bought - needed,
    cost: best.cost, lpValue: lp.value, lowerBound,
    gap: best.cost - lowerBound, proven: lp.proven && best.cost <= lowerBound + 1e-6,
    firstFit: { bars: ffd.plan.reduce((s, p) => s + p.times, 0), cost: ffd.cost },
  };
}
