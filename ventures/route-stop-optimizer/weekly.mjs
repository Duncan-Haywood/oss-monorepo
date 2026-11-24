// Recurring weekly routes: which day(s) each customer is served, and the
// routes on each day. A periodic vehicle routing problem (PVRP): every
// customer needs `freq` visits a week on one of its allowed visit patterns
// (Mon+Thu, Tue+Fri, ...), each day has `vehicles` routes from one depot,
// and a route longer than the shift is penalised per overtime minute.
//
// Search: ruin and recreate with simulated annealing, the same family as
// vrptw.mjs (Christiaens & Vanden Berghe 2020), lifted to the week: ruin
// removes a customer and its nearest neighbours from every day they are on;
// recreate puts each back on the pattern whose days' cheapest insertions sum
// lowest (plus an optional penalty for moving a customer off its current
// days); touched routes are then 2-opted. No dependencies, no network calls.

import { rng } from "./vrptw.mjs";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OT_WEIGHT = 100; // one overtime minute costs as much as 100 driving minutes

// Every set of `freq` planning days, drawn from `allowed` (planning-day
// indexes), whose visits are spread across the week: each gap between
// consecutive visits, wrapping round a 7-day week, is at least floor(7/freq)
// calendar days, or at least 1 if the allowed days cannot do that.
export function patternsFor(freq, allowed, dayOfWeek) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === freq) { out.push(acc.slice()); return; }
    for (let i = start; i < allowed.length; i++) { acc.push(allowed[i]); pick(i + 1, acc); acc.pop(); }
  };
  if (freq < 1 || freq > allowed.length) return [];
  pick(0, []);
  const minGap = (p) => {
    if (p.length < 2) return 7;
    const c = p.map((d) => dayOfWeek[d]).sort((a, b) => a - b);
    let g = 7 - c[c.length - 1] + c[0];
    for (let i = 1; i < c.length; i++) g = Math.min(g, c[i] - c[i - 1]);
    return g;
  };
  const want = Math.floor(7 / freq);
  const spread = out.filter((p) => minGap(p) >= want);
  if (spread.length) return spread;
  const best = Math.max(...out.map(minGap));
  return out.filter((p) => minGap(p) === best);
}

// inst: { n, dist (minutes, (n+1)x(n+1), node 0 the depot), service (n+1),
//   days, vehicles, maxMinutes, patterns (n+1 arrays of day-index arrays),
//   current (optional n+1 pattern indexes, -1 for none), movePenalty (minutes) }
export function planWeek(inst, opts = {}) {
  const { n, dist, service, days: D, vehicles: K } = inst;
  const H = Number.isFinite(inst.maxMinutes) ? inst.maxMinutes : Infinity;
  const pats = inst.patterns;
  const current = inst.current || null;
  const movePen = current ? inst.movePenalty || 0 : 0;
  for (let c = 1; c <= n; c++) if (!pats[c] || !pats[c].length) throw new Error(`customer ${c} has no feasible visit pattern`);
  const iters = opts.iterations ?? Math.min(40000, 4000 + 200 * n);
  const rand = rng(opts.seed ?? 1);
  const maxRemove = Math.max(Math.min(n, 5), Math.min(opts.maxRemove ?? 25, Math.ceil(0.15 * n)));

  // neighbours by distance
  const near = [];
  for (let c = 1; c <= n; c++) {
    const l = [];
    for (let j = 1; j <= n; j++) if (j !== c) l.push(j);
    l.sort((a, b) => dist[c][a] - dist[c][b]);
    near[c] = l;
  }

  // state
  const routes = Array.from({ length: D }, () => Array.from({ length: K }, () => []));
  const pat = new Int32Array(n + 1).fill(-1);
  const travel = (r) => { let t = 0, p = 0; for (const c of r) { t += dist[p][c]; p = c; } return r.length ? t + dist[p][0] : 0; };
  const svc = (r) => r.reduce((a, c) => a + service[c], 0);
  const ot = (dur) => (dur > H ? dur - H : 0);
  // overtime weight used by the search; it starts low so the search can pass
  // through overtime between tight days, and rises to OT_WEIGHT
  let w = OT_WEIGHT;
  const routeObj = (r, wt) => { const t = travel(r); return t + wt * ot(t + svc(r)); };
  const moveCost = (c, p) => (current && current[c] >= 0 && p !== current[c] ? movePen : 0);
  const objective = (wt = w) => {
    let s = 0;
    for (const day of routes) for (const r of day) s += routeObj(r, wt);
    for (let c = 1; c <= n; c++) s += moveCost(c, pat[c]);
    return s;
  };

  // cache of route travel and service, kept in step with edits
  const tr = routes.map((day) => day.map(() => 0));
  const sv = routes.map((day) => day.map(() => 0));
  const refresh = (d, k) => { tr[d][k] = travel(routes[d][k]); sv[d][k] = svc(routes[d][k]); };

  function bestInsert(c, d) {
    let best = Infinity, bk = -1, bi = -1;
    for (let k = 0; k < K; k++) {
      const r = routes[d][k];
      const before = w * ot(tr[d][k] + sv[d][k]);
      let prev = 0;
      for (let i = 0; i <= r.length; i++) {
        const next = i < r.length ? r[i] : 0;
        if (rand() < 0.01 && r.length) { prev = next; continue; } // blink
        const delta = r.length ? dist[prev][c] + dist[c][next] - dist[prev][next] : dist[0][c] + dist[c][0];
        const cost = delta + w * ot(tr[d][k] + delta + sv[d][k] + service[c]) - before;
        if (cost < best) { best = cost; bk = k; bi = i; }
        prev = next;
      }
    }
    if (bk < 0) { // every position blinked
      bk = 0; bi = 0;
      const r = routes[d][0];
      const delta = r.length ? dist[0][c] + dist[c][r[0]] - dist[0][r[0]] : dist[0][c] + dist[c][0];
      best = delta + w * (ot(tr[d][0] + delta + sv[d][0] + service[c]) - ot(tr[d][0] + sv[d][0]));
    }
    return { cost: best, k: bk, i: bi };
  }

  function insert(c, touched) {
    const perDay = new Map();
    let best = Infinity, bp = -1;
    pats[c].forEach((p, pi) => {
      let s = moveCost(c, pi);
      for (const d of p) {
        if (!perDay.has(d)) perDay.set(d, bestInsert(c, d));
        s += perDay.get(d).cost;
      }
      if (s < best) { best = s; bp = pi; }
    });
    pat[c] = bp;
    for (const d of pats[c][bp]) {
      const { k, i } = perDay.get(d);
      routes[d][k].splice(i, 0, c);
      tr[d][k] = travel(routes[d][k]);
      sv[d][k] += service[c];
      touched.add(d * K + k);
    }
  }

  function remove(c, touched) {
    for (const d of pats[c][pat[c]]) {
      for (let k = 0; k < K; k++) {
        const i = routes[d][k].indexOf(c);
        if (i >= 0) { routes[d][k].splice(i, 1); refresh(d, k); touched.add(d * K + k); break; }
      }
    }
    pat[c] = -1;
  }

  // 2-opt on one route (symmetric or not: the delta is computed exactly)
  function twoOpt(d, k) {
    const r = routes[d][k];
    if (r.length < 3) return;
    let improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      const seq = [0, ...r, 0];
      for (let i = 1; i < seq.length - 2; i++) {
        for (let j = i + 1; j < seq.length - 1; j++) {
          const a = seq[i - 1], b = seq[i], c = seq[j], e = seq[j + 1];
          let rev = 0, fwd = 0;
          for (let x = i; x < j; x++) { fwd += dist[seq[x]][seq[x + 1]]; rev += dist[seq[x + 1]][seq[x]]; }
          const delta = dist[a][c] + dist[b][e] - dist[a][b] - dist[c][e] + rev - fwd;
          if (delta < -1e-9) {
            const mid = seq.slice(i, j + 1).reverse();
            seq.splice(i, j - i + 1, ...mid);
            improved = true;
          }
        }
      }
      r.splice(0, r.length, ...seq.slice(1, -1));
    }
    refresh(d, k);
  }

  const snapshot = () => ({ routes: routes.map((day) => day.map((r) => r.slice())), pat: Array.from(pat) });
  const restore = (s) => {
    for (let d = 0; d < D; d++) for (let k = 0; k < K; k++) { routes[d][k] = s.routes[d][k].slice(); refresh(d, k); }
    for (let c = 0; c <= n; c++) pat[c] = s.pat[c];
  };

  // initial: most frequent first, then farthest from the depot
  const order = Array.from({ length: n }, (_, i) => i + 1)
    .sort((a, b) => pats[b][0].length - pats[a][0].length || dist[0][b] - dist[0][a]);
  const t0 = new Set();
  for (const c of order) insert(c, t0);
  for (const key of t0) twoOpt(Math.floor(key / K), key % K);

  let cur = objective();
  let best = cur, bestSnap = snapshot();
  // temperature in units of the mean nearest-neighbour distance
  let nn = 0;
  for (let c = 1; c <= n; c++) nn += n > 1 ? dist[c][near[c][0]] : dist[0][c];
  nn = Math.max(1e-6, nn / Math.max(1, n));
  const T0 = (opts.t0 ?? 4) * nn;
  const Tf = T0 / 100;

  const wLow = opts.otStart ?? 0.1;
  for (let it = 0; it < iters && n > 0; it++) {
    const T = T0 * Math.pow(Tf / T0, it / iters);
    const nw = wLow * Math.pow(OT_WEIGHT / wLow, Math.min(1, it / (0.7 * iters)));
    if (nw !== w) { w = nw; cur = objective(); }
    const save = snapshot();
    const touched = new Set();
    const q = 1 + Math.floor(rand() * maxRemove);
    let removed;
    const pickRuin = rand();
    if (pickRuin < 0.1) {
      // empty one non-empty route, plus the nearest neighbours of one of its stops
      const live = [];
      for (let d = 0; d < D; d++) for (let k = 0; k < K; k++) if (routes[d][k].length) live.push(routes[d][k]);
      const r = live[Math.floor(rand() * live.length)];
      const s = new Set(r);
      for (const c of near[r[Math.floor(rand() * r.length)]].slice(0, Math.floor(q / 2))) s.add(c);
      removed = [...s];
    } else if (pickRuin < 0.775) {
      const seed = 1 + Math.floor(rand() * n);
      removed = [seed, ...near[seed].slice(0, q - 1)];
    } else {
      const s = new Set();
      while (s.size < Math.min(q, n)) s.add(1 + Math.floor(rand() * n));
      removed = [...s];
    }
    for (const c of removed) remove(c, touched);
    const mode = rand();
    if (mode < 0.4) removed.sort(() => rand() - 0.5);
    else if (mode < 0.7) removed.sort((a, b) => dist[0][b] - dist[0][a]);
    else if (mode < 0.85) removed.sort((a, b) => dist[0][a] - dist[0][b]);
    else removed.sort((a, b) => pats[b][0].length - pats[a][0].length || service[b] - service[a]);
    for (const c of removed) insert(c, touched);
    for (const key of touched) twoOpt(Math.floor(key / K), key % K);
    const next = objective();
    if (next < cur - T * Math.log(rand())) {
      cur = next;
      const truth = w === OT_WEIGHT ? cur : objective(OT_WEIGHT);
      if (truth < best - 1e-9) { best = truth; bestSnap = snapshot(); }
    } else restore(save);
  }
  restore(bestSnap);
  return summarize(inst, routes, Array.from(pat));
}

// Score a given week plan: routes[d][k] arrays of customer indexes.
export function summarize(inst, routes, pat) {
  const { dist, service } = inst;
  const H = Number.isFinite(inst.maxMinutes) ? inst.maxMinutes : Infinity;
  let travel = 0, overtime = 0, serviceMin = 0, moved = 0;
  const days = routes.map((day) => day.map((r) => {
    let t = 0, p = 0;
    for (const c of r) { t += dist[p][c]; p = c; }
    if (r.length) t += dist[p][0];
    const s = r.reduce((a, c) => a + service[c], 0);
    const o = t + s > H ? t + s - H : 0;
    travel += t; overtime += o; serviceMin += s;
    return { stops: r.slice(), travel: t, service: s, overtime: o };
  }));
  if (inst.current) for (let c = 1; c <= inst.n; c++) if (inst.current[c] >= 0 && pat[c] !== inst.current[c]) moved++;
  const movePen = inst.current ? (inst.movePenalty || 0) * moved : 0;
  return { routes: routes.map((day) => day.map((r) => r.slice())), pattern: pat, days, travel, overtime, service: serviceMin, moved, objective: travel + OT_WEIGHT * overtime + movePen };
}

// Check a plan: every customer on exactly the days of one of its patterns,
// once per day, and the reported totals re-scored from scratch.
export function verifyWeek(inst, plan) {
  const seen = Array.from({ length: inst.n + 1 }, () => []);
  plan.routes.forEach((day, d) => day.forEach((r) => r.forEach((c) => seen[c].push(d))));
  for (let c = 1; c <= inst.n; c++) {
    const got = seen[c].slice().sort((a, b) => a - b).join(",");
    const p = inst.patterns[c][plan.pattern[c]];
    if (!p) return `customer ${c} has no pattern`;
    if (got !== p.slice().sort((a, b) => a - b).join(",")) return `customer ${c} is on days [${got}], not its pattern [${p}]`;
  }
  const re = summarize(inst, plan.routes, plan.pattern);
  if (Math.abs(re.travel - plan.travel) > 1e-6) return "travel total does not re-score";
  return null;
}
