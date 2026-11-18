// Capacitated vehicle routing with time windows (CVRPTW), solved by ruin and
// recreate with adjacent string removal and simulated annealing, after
// Christiaens & Vanden Berghe, "Slack Induction by String Removals for Vehicle
// Routing Problems", Transportation Science 54(2), 2020.
//
// Plain JavaScript with no dependencies, so the same file runs in the page and
// in the benchmark (eval/solomon.mjs). Deterministic for a given seed and
// iteration count.
//
// Instance shape (node 0 is the depot):
//   { n, dist: Float64Array(n*n), time: Float64Array(n*n) (defaults to dist),
//     service[], ready[], due[], demand[], capacity (Infinity allowed),
//     maxVehicles (Infinity allowed) }
// A route leaves the depot no earlier than ready[0] and returns by due[0].
// Service at a customer starts inside [ready, due]; arriving early waits.
// Objective: total dist over all routes, plus `missPenalty` per customer left
// unserved (only when no feasible plan places it).

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Schedule a route (array of customer ids, depot excluded). Returns null when a
// window, the depot's closing time or the capacity is broken.
export function schedule(inst, nodes) {
  const { n, time, dist, service, ready, due, demand } = inst;
  const k = nodes.length;
  const start = new Float64Array(k + 2);
  const latest = new Float64Array(k + 2);
  let load = 0, cost = 0, prev = 0, t = ready[0];
  start[0] = t;
  for (let i = 0; i < k; i++) {
    const c = nodes[i];
    t = Math.max(ready[c], t + service[prev] + time[prev * n + c]);
    if (t > due[c] + 1e-9) return null;
    start[i + 1] = t;
    cost += dist[prev * n + c];
    load += demand[c];
    prev = c;
  }
  t = t + service[prev] + time[prev * n];
  if (t > due[0] + 1e-9) return null;
  if (load > inst.capacity + 1e-9) return null;
  start[k + 1] = t;
  cost += dist[prev * n];
  latest[k + 1] = due[0];
  for (let i = k; i >= 0; i--) {
    const a = i === 0 ? 0 : nodes[i - 1];
    const b = i === k ? 0 : nodes[i];
    const cap = i === 0 ? Infinity : due[a];
    latest[i] = Math.min(cap, latest[i + 1] - service[a] - time[a * n + b]);
  }
  return { nodes, start, latest, load, cost };
}

// Cheapest feasible way to put customer u into route r (or a new route when r
// is null). Returns { pos, delta } or null.
function bestInsertion(inst, r, u, rand, blink) {
  const { n, dist, time, service, ready, due, demand } = inst;
  if (r === null) {
    const s = Math.max(ready[u], ready[0] + time[u]);
    if (s > due[u] + 1e-9) return null;
    if (s + service[u] + time[u * n] > due[0] + 1e-9) return null;
    if (demand[u] > inst.capacity + 1e-9) return null;
    return { pos: 0, delta: dist[u] + dist[u * n] };
  }
  if (r.load + demand[u] > inst.capacity + 1e-9) return null;
  const nodes = r.nodes, k = nodes.length;
  let best = null, bestDelta = Infinity;
  for (let p = 0; p <= k; p++) {
    if (blink > 0 && rand() < blink) continue;
    const a = p === 0 ? 0 : nodes[p - 1];
    const b = p === k ? 0 : nodes[p];
    const delta = dist[a * n + u] + dist[u * n + b] - dist[a * n + b];
    if (delta >= bestDelta) continue;
    const su = Math.max(ready[u], r.start[p] + service[a] + time[a * n + u]);
    if (su > due[u] + 1e-9) continue;
    if (su + service[u] + time[u * n + b] > r.latest[p + 1] + 1e-9) continue;
    bestDelta = delta; best = p;
  }
  return best === null ? null : { pos: best, delta: bestDelta };
}

function totalCost(sol, penalty) {
  let c = sol.missing.length * penalty;
  for (const r of sol.routes) c += r.cost;
  return c;
}

// Recreate: insert every customer in `pool` at its cheapest feasible place,
// in one of the SISR orders, skipping each position with probability `blink`.
function recreate(inst, sol, pool, rand, blink) {
  const { n, ready, demand, dist } = inst;
  const x = rand() * 11;
  if (x < 4) {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  } else if (x < 8) pool.sort((a, b) => demand[b] - demand[a]);
  else if (x < 10) pool.sort((a, b) => dist[b] - dist[a]);
  else pool.sort((a, b) => ready[a] - ready[b] || dist[a] - dist[b]);
  const missing = [];
  for (const u of pool) {
    let bestR = -1, best = null;
    for (let ri = 0; ri < sol.routes.length; ri++) {
      const ins = bestInsertion(inst, sol.routes[ri], u, rand, blink);
      if (ins && (!best || ins.delta < best.delta)) { best = ins; bestR = ri; }
    }
    if (sol.routes.length < inst.maxVehicles) {
      const ins = bestInsertion(inst, null, u, rand, 0);
      if (ins && (!best || ins.delta < best.delta)) { best = ins; bestR = sol.routes.length; }
    }
    if (!best) { missing.push(u); continue; }
    if (bestR === sol.routes.length) {
      const r = schedule(inst, [u]);
      sol.routes.push(r);
    } else {
      const old = sol.routes[bestR].nodes;
      const nodes = old.slice(0, best.pos).concat([u], old.slice(best.pos));
      const r = schedule(inst, nodes);
      if (!r) { missing.push(u); continue; } // numerical edge; never seen
      sol.routes[bestR] = r;
    }
  }
  sol.missing = sol.missing.concat(missing);
}

// Ruin: remove adjacent strings from routes near a random seed customer.
function ruin(inst, sol, neighbours, rand, p) {
  const routeOf = new Int32Array(inst.n).fill(-1);
  const posOf = new Int32Array(inst.n);
  let served = 0;
  sol.routes.forEach((r, ri) => r.nodes.forEach((c, i) => { routeOf[c] = ri; posOf[c] = i; served++; }));
  if (served === 0) return [];
  const avgCard = served / sol.routes.length;
  const lsMax = Math.min(p.lMax, avgCard);
  const ksMax = (4 * p.cBar) / (1 + lsMax) - 1;
  const ks = Math.floor(rand() * ksMax) + 1;
  let seed;
  do { seed = 1 + Math.floor(rand() * (inst.n - 1)); } while (routeOf[seed] < 0);
  const ruined = new Set();
  const removed = [];
  const newNodes = new Map();
  for (const c of [seed, ...neighbours[seed]]) {
    if (ruined.size >= ks) break;
    const ri = routeOf[c];
    if (ri < 0 || ruined.has(ri)) continue;
    const nodes = sol.routes[ri].nodes;
    const k = nodes.length;
    const lMaxT = Math.min(k, lsMax);
    const l = Math.floor(rand() * lMaxT) + 1;
    const pos = posOf[c];
    let keep = [];
    if (l < k && rand() < p.splitRate) {
      // split string: remove l of a window of l + m, keeping m in the middle
      let m = 1;
      while (l + m < k && rand() > p.splitDepth) m++;
      const w = l + m;
      const lo = Math.max(0, Math.min(k - w, pos - Math.floor(rand() * w)));
      const keepAt = lo + Math.floor(rand() * (l + 1));
      const window = nodes.slice(lo, lo + w);
      keep = window.slice(keepAt - lo, keepAt - lo + m);
      for (const x of window) if (!keep.includes(x)) removed.push(x);
      newNodes.set(ri, nodes.slice(0, lo).concat(keep, nodes.slice(lo + w)));
    } else {
      const lo = Math.max(0, Math.min(k - l, pos - Math.floor(rand() * l)));
      for (let i = lo; i < lo + l; i++) removed.push(nodes[i]);
      newNodes.set(ri, nodes.slice(0, lo).concat(nodes.slice(lo + l)));
    }
    ruined.add(ri);
  }
  const routes = [];
  for (let ri = 0; ri < sol.routes.length; ri++) {
    if (!newNodes.has(ri)) { routes.push(sol.routes[ri]); continue; }
    const nodes = newNodes.get(ri);
    if (nodes.length === 0) continue;
    const r = schedule(inst, nodes);
    if (!r) return null; // a removal broke a window (triangle inequality fails); skip
    routes.push(r);
  }
  sol.routes = routes;
  return removed;
}

export const DEFAULTS = {
  iterations: 50000,
  seed: 1,
  cBar: 10,
  lMax: 10,
  splitRate: 0.5,
  splitDepth: 0.01,
  blink: 0.01,
  t0: null, // default: mean depot distance / 2
  tf: null, // default: t0 / 100
  neighbours: 60,
};

function neighbourLists(inst, k) {
  const { n, dist } = inst;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push([]); continue; }
    const ids = [];
    for (let j = 1; j < n; j++) if (j !== i) ids.push(j);
    ids.sort((a, b) => dist[i * n + a] + dist[a * n + i] - dist[i * n + b] - dist[b * n + i]);
    out.push(ids.slice(0, k));
  }
  return out;
}

export function solve(inst, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  if (!inst.time) inst = { ...inst, time: inst.dist };
  const rand = rng(p.seed);
  const n = inst.n;
  let depotSum = 0, maxD = 0;
  for (let i = 1; i < n; i++) { depotSum += inst.dist[i]; maxD = Math.max(maxD, inst.dist[i] + inst.dist[i * n]); }
  const penalty = p.missPenalty ?? Math.max(1, 100 * maxD);
  const t0 = p.t0 ?? Math.max(1e-6, depotSum / Math.max(1, n - 1) / 2);
  const tf = p.tf ?? t0 / 100;
  const neighbours = neighbourLists(inst, Math.min(n - 2, p.neighbours));

  let cur = { routes: [], missing: [] };
  const all = [];
  for (let i = 1; i < n; i++) all.push(i);
  recreate(inst, cur, all, rand, 0);
  if (p.initial) {
    const warm = { routes: [], missing: [] };
    const seen = new Set();
    let ok = true;
    for (const nodes of p.initial) {
      if (!nodes.length) continue;
      const r = schedule(inst, nodes);
      if (!r) { ok = false; break; }
      warm.routes.push(r); nodes.forEach((c) => seen.add(c));
    }
    if (ok && warm.routes.length <= inst.maxVehicles) {
      const rest = all.filter((c) => !seen.has(c));
      if (rest.length) recreate(inst, warm, rest, rand, 0);
      if (totalCost(warm, penalty) < totalCost(cur, penalty)) cur = warm;
    }
  }
  let curCost = totalCost(cur, penalty);
  let best = cur, bestCost = curCost;
  const startCost = curCost;
  const iters = Math.max(0, p.iterations | 0);
  let accepted = 0, improved = 0;
  for (let it = 0; it < iters; it++) {
    const T = t0 * Math.pow(tf / t0, it / Math.max(1, iters));
    const next = { routes: cur.routes.slice(), missing: cur.missing.slice() };
    const removed = ruin(inst, next, neighbours, rand, p);
    if (removed === null) continue;
    const pool = next.missing.concat(removed);
    next.missing = [];
    recreate(inst, next, pool, rand, p.blink);
    const c = totalCost(next, penalty);
    if (c < curCost - T * Math.log(rand())) {
      cur = next; curCost = c; accepted++;
      if (c < bestCost - 1e-9) { best = next; bestCost = c; improved++; }
    }
  }
  const routes = best.routes.map((r) => r.nodes.slice());
  return {
    routes,
    missing: best.missing.slice().sort((a, b) => a - b),
    distance: best.routes.reduce((s, r) => s + r.cost, 0),
    vehicles: routes.length,
    startDistance: startCost,
    stats: { iterations: iters, accepted, improved },
  };
}

// Independent check of a plan: every customer once, windows, capacity, depot
// hours. Returns { ok, distance, errors }.
export function verify(inst, routes) {
  const time = inst.time || inst.dist;
  const errors = [];
  const seen = new Uint8Array(inst.n);
  let distance = 0;
  if (routes.length > inst.maxVehicles) errors.push(`${routes.length} routes > ${inst.maxVehicles} vehicles`);
  routes.forEach((nodes, ri) => {
    let t = inst.ready[0], prev = 0, load = 0;
    for (const c of nodes) {
      if (c <= 0 || c >= inst.n) { errors.push(`route ${ri}: bad id ${c}`); continue; }
      if (seen[c]) errors.push(`customer ${c} visited twice`);
      seen[c] = 1;
      t = Math.max(inst.ready[c], t + inst.service[prev] + time[prev * inst.n + c]);
      if (t > inst.due[c] + 1e-6) errors.push(`route ${ri}: customer ${c} starts ${t} after ${inst.due[c]}`);
      distance += inst.dist[prev * inst.n + c];
      load += inst.demand[c];
      prev = c;
    }
    t += inst.service[prev] + time[prev * inst.n];
    distance += inst.dist[prev * inst.n];
    if (t > inst.due[0] + 1e-6) errors.push(`route ${ri}: returns ${t} after ${inst.due[0]}`);
    if (load > inst.capacity + 1e-6) errors.push(`route ${ri}: load ${load} > ${inst.capacity}`);
  });
  return { ok: errors.length === 0, distance, errors, served: seen.reduce((a, b) => a + b, 0) };
}
