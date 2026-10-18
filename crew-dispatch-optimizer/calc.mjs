// Crew dispatch optimizer: assign jobs to crews and sequence each crew's stops
// at the lowest total cost, with hours-per-day, skill and value constraints.
//
// Pure ES module, no imports, no network. Two solvers share one cost model:
//   - exact (<= 12 jobs): Held-Karp gives the cheapest order of every job subset
//     for every crew, then a subset DP chooses which crew takes which subset;
//   - heuristic (more jobs): seeded multi-start cheapest insertion followed by
//     relocate / swap / 2-opt local search. Deterministic for a given input.
// Cost of a crew's day = rate x (work hours + drive hours) + mileCost x miles.
// Drive time and miles are both proportional to distance, so minimising
// distance minimises cost and is what decides feasibility.

export const MAX_JOBS = 80;
export const MAX_CREWS = 12;
export const EXACT_LIMIT = 12;
const BIG = 1e7; // penalty for a job with no stated value, so it is served whenever it can be
const EPS = 1e-9;

export const num = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
export const money = (n) => (Number.isFinite(n) ? (n < -0.5 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US") : "—");
export const pct = (n, d = 0) => (Number.isFinite(n) ? (n * 100).toFixed(d) + "%" : "—");
export function fmtTime(minutes) {
  const m = Math.round(minutes);
  const h24 = Math.floor(m / 60) % 24;
  const mm = String(((m % 60) + 60) % 60).padStart(2, "0");
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mm} ${h24 < 12 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------- parsing

function splitLine(line, delim) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function rowsOf(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return [];
  const delim = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  return lines.map((l) => splitLine(l, delim));
}

function parseHours(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return NaN;
  const hm = t.match(/^(\d+):(\d{1,2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const n = Number(t.replace(/\s*(h|hr|hrs|hours?)$/, ""));
  return Number.isFinite(n) ? n : NaN;
}

const skillList = (s) => String(s || "").split(/[|/+]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

const ALIASES = {
  name: ["name", "job", "crew", "tech", "id", "label", "address", "site"],
  a: ["lat", "latitude", "x", "east"],
  b: ["lon", "lng", "long", "longitude", "y", "north"],
  hours: ["hours", "hrs", "duration", "time", "job hours", "available", "available hours", "capacity", "shift"],
  skill: ["skill", "skills", "requires", "needs", "trade", "type", "certs"],
  value: ["value", "revenue", "price", "worth", "quote", "$"],
  rate: ["rate", "cost", "hourly", "wage", "$/hr", "hourly cost", "cost per hour", "loaded rate"],
};

function columns(row, spec) {
  // spec: {field: default index}; if the first row has a non-number where coordinates go, it is a header.
  const hasHeader = !Number.isFinite(Number(row[1]));
  if (!hasHeader) return { hasHeader: false, idx: { ...spec } };
  const idx = {};
  const low = row.map((c) => c.toLowerCase());
  for (const f of Object.keys(spec)) {
    const k = low.findIndex((c) => ALIASES[f].includes(c));
    idx[f] = k;
  }
  // Header present but a required column not recognised: fall back to position for the core four.
  for (const f of ["name", "a", "b", "hours"]) if (idx[f] === undefined || idx[f] < 0) idx[f] = spec[f];
  for (const f of Object.keys(spec)) if (idx[f] === undefined) idx[f] = -1;
  return { hasHeader: true, idx };
}

export function parseJobs(text) {
  const rows = rowsOf(text);
  if (!rows.length) return { error: "Add your jobs: one per line as name, lat, lon, hours, skill (optional), value (optional)." };
  const { hasHeader, idx } = columns(rows[0], { name: 0, a: 1, b: 2, hours: 3, skill: 4, value: 5 });
  const jobs = [];
  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const row = rows[r];
    const a = Number(row[idx.a]), b = Number(row[idx.b]), hours = parseHours(row[idx.hours]);
    const label = `Job row ${r + 1}`;
    if (!Number.isFinite(a) || !Number.isFinite(b) || row[idx.a] === "" || row[idx.b] === "") return { error: `${label}: the two location numbers (lat, lon) must be numbers.` };
    if (!(hours > 0)) return { error: `${label}: hours on site must be more than 0.` };
    const vRaw = idx.value >= 0 ? row[idx.value] : "";
    const value = vRaw === undefined || vRaw === "" ? null : Number(String(vRaw).replace(/[$,]/g, ""));
    if (value !== null && !(value >= 0)) return { error: `${label}: value must be a number of dollars or blank.` };
    jobs.push({ name: row[idx.name] || `Job ${jobs.length + 1}`, a, b, hours, skills: skillList(idx.skill >= 0 ? row[idx.skill] : ""), value });
  }
  if (!jobs.length) return { error: "No job rows found." };
  if (jobs.length > MAX_JOBS) return { error: `This tool plans up to ${MAX_JOBS} jobs at a time; you pasted ${jobs.length}. Split the day by area.` };
  return { jobs };
}

export function parseCrews(text) {
  const rows = rowsOf(text);
  if (!rows.length) return { error: "Add your crews: one per line as name, lat, lon, hours available, hourly cost (optional), skills (optional)." };
  const { hasHeader, idx } = columns(rows[0], { name: 0, a: 1, b: 2, hours: 3, rate: 4, skill: 5 });
  const crews = [];
  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const row = rows[r];
    const a = Number(row[idx.a]), b = Number(row[idx.b]), hours = parseHours(row[idx.hours]);
    const label = `Crew row ${r + 1}`;
    if (!Number.isFinite(a) || !Number.isFinite(b) || row[idx.a] === "" || row[idx.b] === "") return { error: `${label}: the two start-location numbers (lat, lon) must be numbers.` };
    if (!(hours > 0)) return { error: `${label}: hours available must be more than 0.` };
    const rRaw = idx.rate >= 0 ? row[idx.rate] : "";
    const rate = rRaw === undefined || rRaw === "" ? null : Number(String(rRaw).replace(/[$,]/g, ""));
    if (rate !== null && !(rate >= 0)) return { error: `${label}: hourly cost must be a number or blank.` };
    crews.push({ name: row[idx.name] || `Crew ${crews.length + 1}`, a, b, hours, rate, skills: skillList(idx.skill >= 0 ? row[idx.skill] : "") });
  }
  if (!crews.length) return { error: "No crew rows found." };
  if (crews.length > MAX_CREWS) return { error: `This tool plans up to ${MAX_CREWS} crews; you pasted ${crews.length}.` };
  return { crews };
}

// ------------------------------------------------------------ problem model

export function normalizeOptions(o = {}) {
  const pos = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
  const nonneg = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
  return {
    speedMph: pos(o.speedMph, 30),
    circuity: pos(o.circuity, 1.3),
    mileCost: nonneg(o.mileCost, 0.7),
    defaultRate: nonneg(o.defaultRate, 35),
    returnToStart: o.returnToStart !== false,
    startMinute: Number.isFinite(o.startMinute) ? o.startMinute : 8 * 60,
    coords: o.coords === "grid" || o.coords === "latlon" ? o.coords : "auto",
    restarts: Number.isFinite(o.restarts) ? Math.max(1, Math.floor(o.restarts)) : 40,
    seed: Number.isFinite(o.seed) ? o.seed : 1,
  };
}

function haversine(p, q) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (q.a - p.a) * rad, dLon = (q.b - p.b) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(p.a * rad) * Math.cos(q.a * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function looksLikeGrid(jobs, crews) {
  return [...jobs, ...crews].some((p) => Math.abs(p.a) > 90 || Math.abs(p.b) > 180);
}

export function makeProblem(jobs, crews, o) {
  const opt = o.circuity && o.speedMph !== undefined && o.restarts !== undefined ? o : normalizeOptions(o);
  const grid = opt.coords === "grid" || (opt.coords === "auto" && looksLikeGrid(jobs, crews));
  const base = grid ? (p, q) => Math.hypot(p.a - q.a, p.b - q.b) : haversine;
  const d = (p, q) => base(p, q) * opt.circuity;
  const n = jobs.length, m = crews.length;
  const dJ = jobs.map((p) => jobs.map((q) => d(p, q)));
  const dS = crews.map((c) => jobs.map((q) => d(c, q)));
  const rate = crews.map((c) => (c.rate === null || c.rate === undefined ? opt.defaultRate : c.rate));
  const ok = crews.map((c) => jobs.map((j) => j.skills.every((s) => c.skills.includes(s))));
  const pen = jobs.map((j) => (j.value === null || j.value === undefined ? BIG : j.value));
  return { jobs, crews, opt, grid, n, m, dJ, dS, rate, ok, pen };
}

function routeStats(P, c, seq) {
  let dist = 0, work = 0, prev = -1;
  for (const j of seq) {
    dist += prev < 0 ? P.dS[c][j] : P.dJ[prev][j];
    work += P.jobs[j].hours;
    prev = j;
  }
  if (prev >= 0 && P.opt.returnToStart) dist += P.dS[c][prev];
  const time = work + dist / P.opt.speedMph;
  return { dist, work, time, cost: P.rate[c] * time + P.opt.mileCost * dist };
}

function routeCost(P, c, seq) {
  if (!seq.length) return 0;
  for (const j of seq) if (!P.ok[c][j]) return Infinity;
  const s = routeStats(P, c, seq);
  return s.time > P.crews[c].hours + 1e-9 ? Infinity : s.cost;
}

// ------------------------------------------------------------------- exact

function solveExact(P) {
  const { n, m } = P, size = 1 << n, full = size - 1;
  const workOf = new Float64Array(size), penOf = new Float64Array(size);
  for (let mask = 1; mask < size; mask++) {
    const j = 31 - Math.clz32(mask & -mask), rest = mask & (mask - 1);
    workOf[mask] = workOf[rest] + P.jobs[j].hours;
    penOf[mask] = penOf[rest] + P.pen[j];
  }
  const g = [], trace = [];
  for (let c = 0; c < m; c++) {
    const dp = new Float64Array(size * n).fill(Infinity), par = new Int8Array(size * n).fill(-1);
    for (let j = 0; j < n; j++) if (P.ok[c][j]) dp[(1 << j) * n + j] = P.dS[c][j];
    const gc = new Float64Array(size).fill(Infinity), last = new Int8Array(size).fill(-1);
    gc[0] = 0;
    for (let mask = 1; mask < size; mask++) {
      let bestD = Infinity, bestL = -1;
      for (let l = 0; l < n; l++) {
        if (!(mask & (1 << l))) continue;
        const cur = dp[mask * n + l];
        if (cur === Infinity) continue;
        const total = cur + (P.opt.returnToStart ? P.dS[c][l] : 0);
        if (total < bestD) { bestD = total; bestL = l; }
        const restMask = mask;
        for (let nx = 0; nx < n; nx++) {
          if (restMask & (1 << nx) || !P.ok[c][nx]) continue;
          const nm = restMask | (1 << nx), v = cur + P.dJ[l][nx];
          if (v < dp[nm * n + nx]) { dp[nm * n + nx] = v; par[nm * n + nx] = l; }
        }
      }
      if (bestL >= 0) {
        const time = workOf[mask] + bestD / P.opt.speedMph;
        if (time <= P.crews[c].hours + 1e-9) { gc[mask] = P.rate[c] * time + P.opt.mileCost * bestD; last[mask] = bestL; }
      }
    }
    g.push(gc);
    trace.push({ par, last });
  }
  const pathOf = (c, mask) => {
    const out = [];
    let l = trace[c].last[mask], cur = mask;
    while (l >= 0) { out.push(l); const p = trace[c].par[cur * n + l]; cur ^= 1 << l; l = p; }
    return out.reverse();
  };
  // F[c][mask]: cheapest way for crews 0..c-1 to serve exactly the jobs in mask.
  let F = new Float64Array(size).fill(Infinity);
  F[0] = 0;
  const choices = [];
  for (let c = 0; c < m; c++) {
    const N = new Float64Array(size).fill(Infinity), ch = new Int32Array(size);
    for (let mask = 0; mask < size; mask++) {
      let best = Infinity, bs = 0;
      for (let sub = mask; ; sub = (sub - 1) & mask) {
        const gv = g[c][sub];
        if (gv !== Infinity) {
          const v = F[mask ^ sub] + gv;
          if (v < best) { best = v; bs = sub; }
        }
        if (sub === 0) break;
      }
      N[mask] = best; ch[mask] = bs;
    }
    choices.push(ch);
    F = N;
  }
  let bestMask = 0, bestTotal = Infinity;
  for (let mask = 0; mask < size; mask++) {
    const v = F[mask] + penOf[full ^ mask];
    if (v < bestTotal) { bestTotal = v; bestMask = mask; }
  }
  const routes = Array.from({ length: m }, () => []);
  let mask = bestMask;
  for (let c = m - 1; c >= 0; c--) {
    const sub = choices[c][mask];
    routes[c] = sub ? pathOf(c, sub) : [];
    mask ^= sub;
  }
  return routes;
}

// --------------------------------------------------------------- heuristic

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function objective(P, routes) {
  let total = 0;
  const assigned = new Set();
  routes.forEach((r, c) => { total += routeCost(P, c, r); r.forEach((j) => assigned.add(j)); });
  for (let j = 0; j < P.n; j++) if (!assigned.has(j)) total += P.pen[j];
  return total;
}

function insertBest(P, routes, rc, j) {
  let best = null;
  for (let c = 0; c < P.m; c++) {
    if (!P.ok[c][j]) continue;
    for (let p = 0; p <= routes[c].length; p++) {
      const seq = routes[c].slice(0, p).concat(j, routes[c].slice(p));
      const v = routeCost(P, c, seq);
      if (v === Infinity) continue;
      const delta = v - rc[c];
      if (!best || delta < best.delta) best = { c, seq, delta, cost: v };
    }
  }
  if (best && best.delta < P.pen[j]) { routes[best.c] = best.seq; rc[best.c] = best.cost; return true; }
  return false;
}

function localSearch(P, routes) {
  const rc = routes.map((r, c) => routeCost(P, c, r));
  let improved = true, guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    // relocate / unassign / assign
    for (let j = 0; j < P.n; j++) {
      let c0 = -1;
      for (let c = 0; c < P.m; c++) if (routes[c].includes(j)) { c0 = c; break; }
      const without = c0 >= 0 ? routes[c0].filter((x) => x !== j) : null;
      const costWithout = c0 >= 0 ? routeCost(P, c0, without) : 0;
      const marginal = c0 >= 0 ? rc[c0] - costWithout : P.pen[j];
      let best = null;
      for (let c = 0; c < P.m; c++) {
        if (!P.ok[c][j]) continue;
        const base = c === c0 ? without : routes[c];
        const baseCost = c === c0 ? costWithout : rc[c];
        for (let p = 0; p <= base.length; p++) {
          const seq = base.slice(0, p).concat(j, base.slice(p));
          const v = routeCost(P, c, seq);
          if (v === Infinity) continue;
          const delta = v - baseCost;
          if (delta < marginal - 1e-7 && (!best || delta < best.delta)) best = { c, seq, delta, cost: v };
        }
      }
      if (c0 >= 0 && P.pen[j] < marginal - 1e-7 && (!best || P.pen[j] < best.delta)) {
        routes[c0] = without; rc[c0] = costWithout; improved = true; continue;
      }
      if (best) {
        if (c0 >= 0) { routes[c0] = without; rc[c0] = costWithout; }
        routes[best.c] = best.seq; rc[best.c] = best.cost; improved = true;
      }
    }
    // swap two jobs between routes
    for (let a = 0; a < P.m; a++) for (let b = a + 1; b < P.m; b++) {
      for (let i = 0; i < routes[a].length; i++) for (let k = 0; k < routes[b].length; k++) {
        const ra = routes[a].slice(), rb = routes[b].slice();
        [ra[i], rb[k]] = [rb[k], ra[i]];
        const va = routeCost(P, a, ra), vb = routeCost(P, b, rb);
        if (va + vb < rc[a] + rc[b] - 1e-7) { routes[a] = ra; routes[b] = rb; rc[a] = va; rc[b] = vb; improved = true; }
      }
    }
    // swap an unassigned job in for an assigned one
    const used = new Set(routes.flat());
    for (let u = 0; u < P.n; u++) {
      if (used.has(u)) continue;
      for (let c = 0; c < P.m && !used.has(u); c++) {
        for (let i = 0; i < routes[c].length; i++) {
          const out = routes[c][i], seq = routes[c].slice();
          seq[i] = u;
          const v = routeCost(P, c, seq);
          if (v + P.pen[out] < rc[c] + P.pen[u] - 1e-7) { routes[c] = seq; rc[c] = v; used.add(u); used.delete(out); improved = true; break; }
        }
      }
    }
    // 2-opt inside each route
    for (let c = 0; c < P.m; c++) {
      const r = routes[c];
      for (let i = 0; i < r.length - 1; i++) for (let k = i + 1; k < r.length; k++) {
        const seq = r.slice(0, i).concat(r.slice(i, k + 1).reverse(), r.slice(k + 1));
        const v = routeCost(P, c, seq);
        if (v < rc[c] - 1e-7) { routes[c] = seq; rc[c] = v; improved = true; }
      }
    }
  }
}

function solveHeuristic(P, restarts) {
  const rand = rng(P.opt.seed);
  let best = null, bestV = Infinity;
  for (let r = 0; r < restarts; r++) {
    const order = [...Array(P.n).keys()];
    if (r === 0) order.sort((x, y) => P.jobs[y].hours - P.jobs[x].hours);
    else for (let i = order.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [order[i], order[k]] = [order[k], order[i]]; }
    const routes = Array.from({ length: P.m }, () => []);
    const rc = new Array(P.m).fill(0);
    for (const j of order) insertBest(P, routes, rc, j);
    localSearch(P, routes);
    const v = objective(P, routes);
    if (v < bestV - 1e-9) { bestV = v; best = routes.map((x) => x.slice()); }
  }
  return best;
}

export function solve(P, restarts = P.opt.restarts) {
  if (P.n <= EXACT_LIMIT) return { routes: solveExact(P), method: "exact" };
  return { routes: solveHeuristic(P, restarts), method: "heuristic" };
}

// ------------------------------------------------------------- description

function bestOrder(P, c, jobIdx) {
  if (jobIdx.length <= 1) return jobIdx.slice();
  if (jobIdx.length <= 9) {
    let best = null, bestD = Infinity;
    const perm = (arr, k) => {
      if (k === arr.length) {
        const d = routeStats(P, c, arr).dist;
        if (d < bestD - 1e-12) { bestD = d; best = arr.slice(); }
        return;
      }
      for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
    };
    perm(jobIdx.slice(), 0);
    return best;
  }
  // nearest neighbour then 2-opt
  const left = new Set(jobIdx), seq = [];
  let prev = -1;
  while (left.size) {
    let bj = -1, bd = Infinity;
    for (const j of left) { const d = prev < 0 ? P.dS[c][j] : P.dJ[prev][j]; if (d < bd) { bd = d; bj = j; } }
    seq.push(bj); left.delete(bj); prev = bj;
  }
  let improved = true;
  while (improved) {
    improved = false;
    const cur = routeStats(P, c, seq).dist;
    for (let i = 0; i < seq.length - 1 && !improved; i++) for (let k = i + 1; k < seq.length && !improved; k++) {
      const cand = seq.slice(0, i).concat(seq.slice(i, k + 1).reverse(), seq.slice(k + 1));
      if (routeStats(P, c, cand).dist < cur - 1e-9) { seq.splice(0, seq.length, ...cand); improved = true; }
    }
  }
  return seq;
}

function describeRoutes(P, routes) {
  const out = routes.map((seq, c) => {
    const s = routeStats(P, c, seq);
    let t = P.opt.startMinute, prev = -1;
    const stops = seq.map((j) => {
      const leg = prev < 0 ? P.dS[c][j] : P.dJ[prev][j];
      t += (leg / P.opt.speedMph) * 60;
      const arrive = t;
      t += P.jobs[j].hours * 60;
      prev = j;
      return { job: j, name: P.jobs[j].name, legMiles: leg, arriveMinute: arrive, departMinute: t, hours: P.jobs[j].hours };
    });
    const backMiles = prev >= 0 && P.opt.returnToStart ? P.dS[c][prev] : 0;
    return {
      crew: c, name: P.crews[c].name, stops, miles: s.dist, driveHours: s.dist / P.opt.speedMph, workHours: s.work,
      totalHours: s.time, capacity: P.crews[c].hours, cost: seq.length ? s.cost : 0, backMiles,
      endMinute: seq.length ? t + (backMiles / P.opt.speedMph) * 60 : P.opt.startMinute,
    };
  });
  return out;
}

function unassignedReasons(P, routes) {
  const used = new Set(routes.flat()), out = [];
  for (let j = 0; j < P.n; j++) {
    if (used.has(j)) continue;
    const job = P.jobs[j];
    const eligible = [...Array(P.m).keys()].filter((c) => P.ok[c][j]);
    let reason;
    if (!eligible.length) reason = job.skills.length ? `no crew has ${job.skills.join(" + ")}` : "no eligible crew";
    else {
      const solo = eligible.map((c) => ({ c, cost: routeCost(P, c, [j]) })).filter((x) => x.cost !== Infinity);
      if (!solo.length) reason = "too long for any single crew's day, even alone";
      else if (job.value !== null && job.value !== undefined && Math.min(...solo.map((x) => x.cost)) > job.value) reason = `costs more to serve (${money(Math.min(...solo.map((x) => x.cost)))} alone) than its ${money(job.value)} value`;
      else if (job.value !== null && job.value !== undefined) reason = "adding it would cost more than its value once the other jobs are placed";
      else reason = "no crew has enough hours left after the other jobs";
    }
    out.push({ job: j, name: job.name, reason, value: job.value });
  }
  return out;
}

function totals(P, routes) {
  const d = describeRoutes(P, routes);
  const used = new Set(routes.flat());
  let lost = 0, lostCount = 0;
  for (let j = 0; j < P.n; j++) if (!used.has(j)) { lostCount++; if (P.jobs[j].value !== null && P.jobs[j].value !== undefined) lost += P.jobs[j].value; }
  const cost = d.reduce((s, r) => s + r.cost, 0);
  return { routes: d, cost, miles: d.reduce((s, r) => s + r.miles, 0), driveHours: d.reduce((s, r) => s + r.driveHours, 0), served: used.size, unserved: lostCount, lostValue: lost };
}

function nearestCrewBaseline(P, ordered) {
  const routes = Array.from({ length: P.m }, () => []);
  let unplaced = 0;
  for (let j = 0; j < P.n; j++) {
    let bc = -1, bd = Infinity;
    for (let c = 0; c < P.m; c++) if (P.ok[c][j] && P.dS[c][j] < bd) { bd = P.dS[c][j]; bc = c; }
    if (bc < 0) unplaced++; else routes[bc].push(j);
  }
  const seqs = routes.map((r, c) => (ordered ? bestOrder(P, c, r) : r));
  let cost = 0, over = 0, miles = 0;
  seqs.forEach((seq, c) => {
    if (!seq.length) return;
    const s = routeStats(P, c, seq);
    cost += s.cost; miles += s.dist;
    over += Math.max(0, s.time - P.crews[c].hours);
  });
  const lost = [...Array(P.n).keys()].filter((j) => !seqs.some((s) => s.includes(j))).reduce((sum, j) => sum + (P.jobs[j].value || 0), 0);
  return { cost: cost + lost, rawCost: cost, miles, overHours: over, unplaced };
}

export function optimize(input, o = {}) {
  const { jobs, crews } = input || {};
  if (!jobs || !jobs.length) return { error: "Add at least one job." };
  if (!crews || !crews.length) return { error: "Add at least one crew." };
  const opt = normalizeOptions(o);
  const P = makeProblem(jobs, crews, opt);
  const warnings = [];
  if (P.grid) warnings.push("Locations read as miles on a grid (a number outside latitude/longitude range, or you chose grid). Distances are straight lines times the road factor.");
  const free = jobs.filter((_, j) => ![...Array(P.m).keys()].some((c) => P.ok[c][j]));
  if (free.length) warnings.push(`${free.length} job${free.length === 1 ? " needs a skill no crew has" : "s need a skill no crew has"}: ${free.map((j) => j.name).join(", ")}. They cannot be planned.`);
  if (jobs.some((j) => j.value === null || j.value === undefined)) warnings.push("Jobs with no value are always served when any crew can fit them; add a value in dollars to let the tool skip jobs that cost more than they earn.");

  const { routes, method } = solve(P);
  const res = totals(P, routes);
  const naive = nearestCrewBaseline(P, false), naiveBest = nearestCrewBaseline(P, true);
  const planTotal = res.cost + res.lostValue;

  // What-if tables, each a fresh solve with fewer restarts so the page stays fast.
  const quick = { ...opt, restarts: Math.min(opt.restarts, 12) };
  const whatIf = (jobsX, crewsX) => {
    const Q = makeProblem(jobsX, crewsX, quick);
    const s = totals(Q, solve(Q, quick.restarts).routes);
    return { cost: s.cost + s.lostValue, served: s.served, unserved: s.unserved };
  };
  const crewOut = crews.length > 1 ? crews.map((c, i) => {
    const w = whatIf(jobs, crews.filter((_, k) => k !== i));
    return { crew: c.name, cost: w.cost, delta: w.cost - planTotal, unserved: w.unserved };
  }) : [];
  const extra = whatIf(jobs, crews.concat({ ...crews[0], name: `${crews[0].name} (second)` }));
  const longRows = [0.1, 0.2, 0.3].map((f) => {
    const w = whatIf(jobs.map((j) => ({ ...j, hours: j.hours * (1 + f) })), crews);
    return { change: f, cost: w.cost, delta: w.cost - planTotal, unserved: w.unserved };
  });

  return {
    method, restarts: method === "heuristic" ? opt.restarts : null, warnings, grid: P.grid, options: opt,
    crews: res.routes, cost: res.cost, miles: res.miles, driveHours: res.driveHours, served: res.served, unserved: res.unserved,
    lostValue: res.lostValue, total: planTotal, jobCount: jobs.length,
    unassigned: unassignedReasons(P, routes),
    naive, naiveBest, saveVsNaive: naive.cost - planTotal, saveVsNaiveBest: naiveBest.cost - planTotal,
    saveVsNaiveMiles: naive.miles - res.miles,
    crewOut, extraCrew: { cost: extra.cost, delta: extra.cost - planTotal, unserved: extra.unserved }, longRows,
  };
}

export function dispatchCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["crew,stop,job,arrive,depart,miles_from_previous,hours_on_site"];
  for (const c of r.crews) {
    c.stops.forEach((s, i) => lines.push([q(c.name), i + 1, q(s.name), fmtTime(s.arriveMinute), fmtTime(s.departMinute), s.legMiles.toFixed(1), s.hours].join(",")));
  }
  for (const u of r.unassigned) lines.push([q("UNASSIGNED"), "", q(u.name), "", "", "", q(u.reason)].join(","));
  return lines.join("\n") + "\n";
}

export function sampleJobs() {
  return [
    "job,lat,lon,hours,skill,value",
    "Smith furnace tune-up,39.7392,-104.9903,1.5,hvac,260",
    "Lopez AC no cooling,39.7201,-104.9442,2,hvac,420",
    "Oak St water heater,39.7685,-105.0121,2.5,plumb,640",
    "Kim leaking faucet,39.7059,-105.0210,1,plumb,190",
    "Patel panel check,39.7810,-104.9605,2,elec,480",
    "Brown thermostat,39.6904,-104.9750,1,hvac,170",
    "Garcia drain clog,39.7471,-104.9123,1.5,plumb,310",
    "Nguyen duct clean,39.8120,-105.0450,3,hvac,520",
    "Hill outlet repair,39.7330,-105.0480,1,elec,210",
    "Foster toilet,39.6610,-104.9120,1,plumb,150",
    "Ruiz far-out estimate,39.9480,-104.7200,1.5,hvac,90",
  ].join("\n");
}

export function sampleCrews() {
  return [
    "crew,lat,lon,hours,hourly cost,skills",
    "Van 1 (Dana),39.7400,-104.9850,8,48,hvac|plumb",
    "Van 2 (Marcus),39.7300,-105.0100,8,52,plumb|elec",
    "Van 3 (Priya),39.7000,-104.9400,6,45,hvac",
  ].join("\n");
}
