// Weekly planner measurement: node eval/weekly-check.mjs
// 1. Exact check: random small weeks (6 customers) against enumeration of
//    every pattern choice, vehicle split and visit order.
// 2. Invented service books (one depot, 40 / 80 / 150 customers, a quarter
//    twice a week, an 8-hour shift): what choosing days saves against the
//    days a book grows into (each customer on a random allowed pattern) and
//    against a pie-slice zoning (customers cut into one angular sector per
//    day, the usual hand method), each routed by the same engine. Plus the
//    spread over 5 seeds.
import { patternsFor, planWeek, verifyWeek } from "../weekly.mjs";
import { rng } from "../vrptw.mjs";

const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

function make(seed, n, D, K, H, twiceEvery = 4, svcMin = 15, svcMax = 35) {
  const r = rng(seed);
  // a metro area of about 20 x 20 miles at 30 mph with a 1.3 road factor: minutes
  const pts = Array.from({ length: n + 1 }, (_, i) => (i === 0 ? [10, 10] : [r() * 20, r() * 20]));
  const dist = pts.map((a) => pts.map((b) => (Math.hypot(a[0] - b[0], a[1] - b[1]) * 1.3 / 30) * 60));
  const service = pts.map((_, i) => (i === 0 ? 0 : svcMin + Math.floor(r() * (svcMax - svcMin + 1))));
  const days = Array.from({ length: D }, (_, d) => d);
  const patterns = [[]];
  for (let c = 1; c <= n; c++) patterns.push(patternsFor(c % twiceEvery === 0 ? 2 : 1, days, days));
  return { inst: { n, dist, service, days: D, vehicles: K, maxMinutes: H, patterns }, pts, r };
}

function exactPart() {
  const tour = (inst, p) => { let t = 0, q = 0; for (const c of p) { t += inst.dist[q][c]; q = c; } return p.length ? t + inst.dist[q][0] : 0; };
  let equal = 0, total = 0;
  for (let s = 1; s <= 40; s++) {
    const K = s % 2 ? 1 : 2;
    const { inst } = make(500 + s, 6, 5, K, 140, 2, 10, 30);
    const memo = new Map();
    const dayCost = (set) => {
      const key = set.join(",");
      if (memo.has(key)) return memo.get(key);
      let best = Infinity;
      for (let code = 0; code < K ** set.length; code++) {
        const g = Array.from({ length: K }, () => []);
        let x = code;
        for (const c of set) { g[x % K].push(c); x = Math.floor(x / K); }
        let sum = 0;
        for (const grp of g) {
          if (!grp.length) continue;
          const sv = grp.reduce((a, c) => a + inst.service[c], 0);
          sum += Math.min(...perms(grp).map((p) => { const t = tour(inst, p); return t + 100 * Math.max(0, t + sv - inst.maxMinutes); }));
        }
        best = Math.min(best, sum);
      }
      memo.set(key, best);
      return best;
    };
    let opt = Infinity;
    const ch = new Array(7).fill(0);
    const rec = (c) => {
      if (c > 6) {
        const sets = Array.from({ length: 5 }, () => []);
        for (let i = 1; i <= 6; i++) for (const d of inst.patterns[i][ch[i]]) sets[d].push(i);
        opt = Math.min(opt, sets.reduce((a, x) => a + dayCost(x), 0));
        return;
      }
      for (let p = 0; p < inst.patterns[c].length; p++) { ch[c] = p; rec(c + 1); }
    };
    rec(1);
    const plan = planWeek(inst, { seed: s, iterations: 2500 });
    if (verifyWeek(inst, plan)) throw new Error(verifyWeek(inst, plan));
    total++;
    if (plan.objective <= opt + 1e-6) equal++;
  }
  return { equal, total };
}

function pieSlice(inst, pts) {
  // sort by angle round the depot; cut into D sectors of equal service-plus-visits load;
  // twice-a-week customers get their sector's day and the day 3 later (or the nearest allowed pattern)
  const { n, days: D } = inst;
  const ang = (c) => Math.atan2(pts[c][1] - pts[0][1], pts[c][0] - pts[0][0]);
  const order = Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => ang(a) - ang(b));
  const load = (c) => inst.patterns[c][0].length * (inst.service[c] + 10);
  const total = order.reduce((a, c) => a + load(c), 0);
  const patterns = [[]];
  const fixed = new Array(n + 1);
  let acc = 0;
  for (const c of order) {
    const d = Math.min(D - 1, Math.floor((acc / total) * D));
    acc += load(c);
    const p = inst.patterns[c];
    const hit = p.findIndex((q) => q[0] === d) >= 0 ? p.findIndex((q) => q[0] === d) : p.findIndex((q) => q.includes(d));
    fixed[c] = [p[hit >= 0 ? hit : 0]];
  }
  for (let c = 1; c <= n; c++) patterns.push(fixed[c]);
  return { ...inst, patterns };
}

const out = [];
const ex = exactPart();
out.push(`Exact check: ${ex.equal} of ${ex.total} small weeks (6 customers, 5 days, 1 or 2 vehicles, 140-minute shift, half twice a week) equal the enumerated optimum.`);
out.push("");
out.push("| customers | vehicles/day | books | vs grown days: travel cut | vs pie-slice: travel cut | overtime h/week grown / slice / chosen | seed spread (max-min)/min | ms per plan |");
out.push("|---|---|---|---|---|---|---|---|");
for (const [n, K] of [[40, 1], [80, 2], [150, 3]]) {
  let cutGrown = 0, cutSlice = 0, otG = 0, otS = 0, otC = 0, spread = 0, ms = 0;
  const books = 5;
  for (let b = 0; b < books; b++) {
    const { inst, pts, r } = make(1000 * n + b, n, 5, K, 480);
    const grown = { ...inst, patterns: inst.patterns.map((p, c) => (c === 0 ? p : [p[Math.floor(r() * p.length)]])) };
    const its = Math.min(20000, 3000 + 120 * n);
    const g = planWeek(grown, { seed: 1, iterations: its });
    const s = planWeek(pieSlice(inst, pts), { seed: 1, iterations: its });
    const runs = [];
    for (let seed = 1; seed <= 5; seed++) {
      const t = Date.now();
      runs.push(planWeek(inst, { seed, iterations: its }));
      ms += Date.now() - t;
    }
    const obj = runs.map((x) => x.objective);
    const best = runs[0];
    cutGrown += 1 - best.travel / g.travel;
    cutSlice += 1 - best.travel / s.travel;
    otG += g.overtime / 60; otS += s.overtime / 60; otC += best.overtime / 60;
    spread += (Math.max(...obj) - Math.min(...obj)) / Math.min(...obj);
  }
  const f = (x) => (100 * x / books).toFixed(1) + "%";
  out.push(`| ${n} | ${K} | ${books} | ${f(cutGrown)} | ${f(cutSlice)} | ${(otG / books).toFixed(1)} / ${(otS / books).toFixed(1)} / ${(otC / books).toFixed(1)} | ${f(spread)} | ${Math.round(ms / books / 5)} |`);
}
console.log(out.join("\n"));
