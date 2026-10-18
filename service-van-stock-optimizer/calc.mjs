// Service van stock optimizer -- pure logic, no DOM, no network.
//
// Question: which parts (and how many of each) should a service van carry so the
// most jobs are finished on the first visit, given what each part costs, how
// much room it takes, and what a return trip costs? The history of past jobs
// (which parts each one used) is the only data; everything stays in the browser.
//
// Model. A job is completed on the first visit only if EVERY part it needs is on
// the van in the needed quantity, so parts are not independent: a capacitor that
// always travels with a contactor is worth little without it. That is why this is
// a set-cover problem and not a ranking by frequency. Each (part, k-th unit) is
// one "item". A job needs items (p,1)..(p,q). Net yearly value of a stock S:
//   callback * jobsPerYear * covered(S)/N  -  carryRate * cost(S)
// subject to an optional inventory budget and van space.
//   * up to EXACT_MAX_ITEMS items: every subset is enumerated; the number of jobs
//     covered by each subset comes from a subset-sum (zeta) transform, so the
//     answer is proven optimal for the inputs.
//   * more: exact over the most-used items, compared with greedy + pair-add +
//     drop + swap local search over all of them; the better one wins.

export const MAX_LEVELS = 6;
export const EXACT_MAX_ITEMS = 20;
const EPS = 1e-9;

const clean = (s) => String(s).trim().replace(/\s+/g, " ");
const key = (s) => clean(s).toLowerCase();
const parseMoney = (s) => Number(String(s).replace(/[$\s]/g, ""));

export function num(n, d = 1) {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** d;
  return String(Math.round(n * f) / f);
}
export function money(n) {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US");
}
export function pct(x) {
  return Number.isFinite(x) ? `${Math.round(x * 1000) / 10}%` : "—";
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- parsing

export function parseCatalog(text) {
  const parts = new Map();
  const warnings = [];
  let seenData = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const f = line.split(/\t|,/).map((s) => s.trim());
    const cost = f.length >= 2 ? parseMoney(f[1]) : NaN;
    if (!Number.isFinite(cost)) {
      if (!seenData) { seenData = true; continue; } // a header row
      return { error: `Catalog line "${line}": give a part name and a unit cost, like: Run capacitor 45/5, 16, 1` };
    }
    seenData = true;
    if (cost < 0) return { error: `Catalog line "${line}": a cost cannot be negative.` };
    const space = f[2] === undefined || f[2] === "" ? 1 : Number(f[2]);
    if (!Number.isFinite(space) || space < 0) return { error: `Catalog line "${line}": space must be a number of shelf slots (0 or more).` };
    const k = key(f[0]);
    if (!k) return { error: `Catalog line "${line}": the part has no name.` };
    if (parts.has(k)) warnings.push(`"${clean(f[0])}" is listed twice in the catalog; the later line is used.`);
    parts.set(k, { name: clean(f[0]), cost, space });
  }
  if (!parts.size) return { error: "Add your parts catalog: one part per line as name, unit cost, space." };
  return { parts: [...parts.values()], warnings };
}

function parseEntry(t) {
  let m = t.match(/^(.+?)\s+x\s*(\d+)$/i) || t.match(/^(.+?)\s*[×*]\s*(\d+)$/);
  if (m) return { name: clean(m[1]), qty: Number(m[2]) };
  m = t.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (m) return { name: clean(m[2]), qty: Number(m[1]) };
  return { name: t, qty: 1 };
}

function mergeEntries(list) {
  const by = new Map();
  for (const e of list) {
    if (!e.name || !(e.qty >= 1)) continue;
    const k = key(e.name);
    const cur = by.get(k);
    if (cur) cur.qty += e.qty;
    else by.set(k, { name: e.name, qty: e.qty });
  }
  return [...by.values()];
}

export function parseHistory(text) {
  const jobs = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^(none|-|—|no parts?)$/i.test(line)) { jobs.push([]); continue; }
    const entries = line.split(/[;|,]/).map(clean).filter(Boolean).map(parseEntry);
    jobs.push(mergeEntries(entries));
  }
  if (!jobs.length) return { error: "Add your job history: one past job per line, listing the parts it used, like: Run capacitor 45/5; Contactor x2. Write none for a job that used no parts." };
  return { jobs };
}

export function parseCurrent(text) {
  const list = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    for (const tok of line.split(/[;|,]/).map(clean).filter(Boolean)) list.push(parseEntry(tok));
  }
  return { stock: mergeEntries(list) };
}

// ---------------------------------------------------------------- model

function buildModel({ catalog, history, current }, opt) {
  const cat = new Map(catalog.map((p) => [key(p.name), p]));
  const warnings = [];
  const unknown = new Map();
  const partInfo = (name) => {
    const k = key(name);
    if (cat.has(k)) return cat.get(k);
    if (!unknown.has(k)) unknown.set(k, { name: clean(name), cost: opt.defaultCost, space: 1, unknown: true });
    return unknown.get(k);
  };

  const maxQty = new Map();
  for (const job of history) for (const e of job) maxQty.set(key(e.name), Math.max(maxQty.get(key(e.name)) || 0, e.qty));

  const items = [];
  const levelIndex = new Map(); // "partkey#level" -> item index
  for (const [k, q] of [...maxQty.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const info = partInfo(history.flat().find((e) => key(e.name) === k).name);
    for (let lvl = 1; lvl <= Math.min(MAX_LEVELS, q); lvl++) {
      levelIndex.set(`${k}#${lvl}`, items.length);
      items.push({ pkey: k, part: info.name, level: lvl, cost: info.cost, space: info.space });
    }
  }

  let impossible = 0;
  const jobs = history.map((job) => {
    const idx = [];
    let bad = false;
    for (const e of job) {
      if (e.qty > MAX_LEVELS) bad = true;
      for (let lvl = 1; lvl <= Math.min(MAX_LEVELS, e.qty); lvl++) idx.push(levelIndex.get(`${key(e.name)}#${lvl}`));
    }
    if (bad) impossible++;
    return { items: idx, impossible: bad };
  });
  if (impossible) warnings.push(`${impossible} job(s) needed more than ${MAX_LEVELS} of one part; they are counted as never completable from the van.`);
  if (unknown.size) {
    warnings.push(`${unknown.size} part(s) in the history are not in the catalog and were given a cost of ${money(opt.defaultCost)} and 1 slot: ${[...unknown.values()].map((u) => u.name).join(", ")}.`);
  }

  // What the van carries now, as item flags plus the cost of anything the history never used.
  let cur = null;
  if (current && current.length) {
    const flags = new Set();
    const dead = [];
    let cost = 0, space = 0;
    for (const e of current) {
      const info = partInfo(e.name);
      const k = key(e.name);
      const q = e.qty;
      cost += info.cost * q;
      space += info.space * q;
      if (!maxQty.has(k)) { dead.push({ name: info.name, qty: q, cost: info.cost * q }); continue; }
      for (let lvl = 1; lvl <= Math.min(q, MAX_LEVELS); lvl++) if (levelIndex.has(`${k}#${lvl}`)) flags.add(levelIndex.get(`${k}#${lvl}`));
      // Carrying more than the history ever needed is cost with no benefit.
      const useless = q - Math.min(q, maxQty.get(k));
      if (useless > 0) dead.push({ name: info.name, qty: useless, cost: info.cost * useless, excess: true });
    }
    cur = { flags, cost, space, dead };
  }
  return { items, jobs, cur, warnings };
}

// ---------------------------------------------------------------- evaluation

function coveredCount(jobs, inStock) {
  let c = 0;
  for (const j of jobs) {
    if (j.impossible) continue;
    let ok = true;
    for (const i of j.items) if (!inStock[i]) { ok = false; break; }
    if (ok) c++;
  }
  return c;
}

const netValue = (covered, cost, n, opt) => (opt.callback * covered * opt.jobsPerYear) / n - opt.carry * cost;

function setTotals(items, set) {
  let cost = 0, space = 0;
  for (const i of set) { cost += items[i].cost; space += items[i].space; }
  return { cost, space };
}

function flagsOf(size, set) {
  const f = new Uint8Array(size);
  for (const i of set) f[i] = 1;
  return f;
}

// Level k without level k-1 buys nothing (a job needing k also needs k-1).
function normalise(items, set) {
  const have = new Set(set);
  const out = new Set();
  const order = [...have].sort((a, b) => items[a].level - items[b].level);
  for (const i of order) {
    if (items[i].level === 1) { out.add(i); continue; }
    const below = items.findIndex((x) => x.pkey === items[i].pkey && x.level === items[i].level - 1);
    if (out.has(below)) out.add(i);
  }
  return out;
}

function frequencies(items, jobs) {
  const f = new Array(items.length).fill(0);
  for (const j of jobs) if (!j.impossible) for (const i of j.items) f[i]++;
  return f;
}

// ---------------------------------------------------------------- exact

function exactTables(items, jobs, cand) {
  const n = cand.length;
  const bit = new Map(cand.map((c, b) => [c, b]));
  const size = 1 << n;
  const g = new Int32Array(size);
  for (const j of jobs) {
    if (j.impossible) continue;
    let m = 0, ok = true;
    for (const i of j.items) {
      if (!bit.has(i)) { ok = false; break; }
      m |= 1 << bit.get(i);
    }
    if (ok) g[m]++;
  }
  for (let b = 0; b < n; b++) {
    const bb = 1 << b;
    for (let m = 0; m < size; m++) if (m & bb) g[m] += g[m ^ bb];
  }
  const cost = new Float64Array(size);
  const space = new Float64Array(size);
  for (let m = 1; m < size; m++) {
    const low = 31 - Math.clz32(m & -m);
    const rest = m & (m - 1);
    cost[m] = cost[rest] + items[cand[low]].cost;
    space[m] = space[rest] + items[cand[low]].space;
  }
  return { n, size, g, cost, space, cand };
}

function solveExact(items, jobs, cand, opt) {
  const t = exactTables(items, jobs, cand);
  const N = jobs.length;
  let best = 0, bestNet = -Infinity, bestCost = Infinity;
  for (let m = 0; m < t.size; m++) {
    if (t.cost[m] > opt.budget + EPS || t.space[m] > opt.space + EPS) continue;
    const v = netValue(t.g[m], t.cost[m], N, opt);
    if (v > bestNet + EPS || (Math.abs(v - bestNet) <= EPS && t.cost[m] < bestCost)) { best = m; bestNet = v; bestCost = t.cost[m]; }
  }
  const set = new Set();
  for (let b = 0; b < t.n; b++) if (best & (1 << b)) set.add(cand[b]);
  return { set: normalise(items, set), tables: t };
}

function exactFrontier(t, fractions) {
  const top = t.cost[t.size - 1];
  return fractions.map((f) => {
    const cap = top * f;
    let g = -1, c = 0;
    for (let m = 0; m < t.size; m++) {
      if (t.cost[m] > cap + EPS) continue;
      if (t.g[m] > g || (t.g[m] === g && t.cost[m] < c)) { g = t.g[m]; c = t.cost[m]; }
    }
    return { cap, cost: c, covered: g };
  });
}

// ---------------------------------------------------------------- local search

function localSearch(items, jobs, opt, startSet = new Set()) {
  const N = jobs.length;
  const freq = frequencies(items, jobs);
  const pool = items.map((_, i) => i).filter((i) => freq[i] > 0).sort((a, b) => freq[b] - freq[a]).slice(0, 60);
  const stock = flagsOf(items.length, startSet);
  const levelBelow = items.map((x) => items.findIndex((y) => y.pkey === x.pkey && y.level === x.level - 1));
  const levelAbove = items.map((x) => items.findIndex((y) => y.pkey === x.pkey && y.level === x.level + 1));
  const canAdd = (i) => !stock[i] && (levelBelow[i] < 0 || stock[levelBelow[i]]);
  const canDrop = (i) => stock[i] && (levelAbove[i] < 0 || !stock[levelAbove[i]]);

  const totals = () => { let c = 0, s = 0; for (let i = 0; i < stock.length; i++) if (stock[i]) { c += items[i].cost; s += items[i].space; } return { c, s }; };
  const score = () => {
    const { c, s } = totals();
    if (c > opt.budget + EPS || s > opt.space + EPS) return -Infinity;
    return netValue(coveredCount(jobs, stock), c, N, opt);
  };

  let cur = score();
  if (cur === -Infinity) { stock.fill(0); cur = score(); }
  for (let iter = 0; iter < 400; iter++) {
    let bestV = cur + 1e-7, move = null;
    const tryMove = (adds, drops) => {
      for (const i of drops) stock[i] = 0;
      for (const i of adds) stock[i] = 1;
      const v = score();
      for (const i of adds) stock[i] = 0;
      for (const i of drops) stock[i] = 1;
      if (v > bestV) { bestV = v; move = { adds: [...adds], drops: [...drops] }; }
    };
    for (const i of pool) if (canAdd(i)) tryMove([i], []);
    for (const i of pool) if (canDrop(i)) tryMove([], [i]);
    for (const i of pool) {
      if (!canDrop(i)) continue;
      for (const k of pool) if (k !== i && canAdd(k) && items[k].pkey !== items[i].pkey) tryMove([k], [i]);
    }
    // Pair adds let a set of parts that only pay together (a job needing both) get started.
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        const x = pool[a], y = pool[b];
        if (stock[x] || stock[y]) continue;
        const okX = levelBelow[x] < 0 || stock[levelBelow[x]];
        const okY = levelBelow[y] < 0 || stock[levelBelow[y]];
        if (okX && okY) tryMove([x, y], []);
      }
    }
    if (!move) break;
    for (const i of move.drops) stock[i] = 0;
    for (const i of move.adds) stock[i] = 1;
    cur = bestV;
  }
  const set = new Set();
  for (let i = 0; i < stock.length; i++) if (stock[i]) set.add(i);
  return normalise(items, set);
}

// ---------------------------------------------------------------- solver

export function solveStock(items, jobs, opt) {
  const freq = frequencies(items, jobs);
  const used = items.map((_, i) => i).filter((i) => freq[i] > 0);
  const ranked = [...used].sort((a, b) => freq[b] - freq[a] || items[a].cost - items[b].cost || a - b);
  if (ranked.length <= EXACT_MAX_ITEMS) {
    const { set, tables } = solveExact(items, jobs, ranked, opt);
    return { set, method: "exact", tables };
  }
  const { set: exactSet, tables } = solveExact(items, jobs, ranked.slice(0, EXACT_MAX_ITEMS), opt);
  const local = localSearch(items, jobs, opt, exactSet);
  const fresh = localSearch(items, jobs, opt);
  const value = (s) => {
    const { cost, space } = setTotals(items, s);
    if (cost > opt.budget + EPS || space > opt.space + EPS) return -Infinity;
    return netValue(coveredCount(jobs, flagsOf(items.length, s)), cost, jobs.length, opt);
  };
  const cands = [exactSet, local, fresh];
  cands.sort((a, b) => value(b) - value(a));
  return { set: cands[0], method: "heuristic", tables: null };
}

function topSellers(items, jobs, capCost, capSpace) {
  const freq = frequencies(items, jobs);
  const order = items.map((_, i) => i).filter((i) => freq[i] > 0).sort((a, b) => freq[b] - freq[a] || items[a].level - items[b].level || a - b);
  const set = new Set();
  let cost = 0, space = 0;
  for (const i of order) {
    const below = items.findIndex((x) => x.pkey === items[i].pkey && x.level === items[i].level - 1);
    if (items[i].level > 1 && !set.has(below)) continue;
    if (cost + items[i].cost > capCost + EPS || space + items[i].space > capSpace + EPS) continue;
    set.add(i); cost += items[i].cost; space += items[i].space;
  }
  return set;
}

function groupStock(items, jobs, set) {
  const flags = flagsOf(items.length, set);
  const base = coveredCount(jobs, flags);
  const freq = frequencies(items, jobs);
  const by = new Map();
  for (const i of [...set].sort((a, b) => a - b)) {
    const it = items[i];
    if (!by.has(it.pkey)) by.set(it.pkey, { name: it.part, qty: 0, unitCost: it.cost, unitSpace: it.space, cost: 0, space: 0, jobsNeeding: 0, jobsLostIfDropped: 0 });
    const g = by.get(it.pkey);
    g.qty++; g.cost += it.cost; g.space += it.space;
    if (it.level === 1) g.jobsNeeding = freq[i];
  }
  // Jobs lost if the whole part (all its units) came off the van.
  for (const [pk, g] of by) {
    const f = flagsOf(items.length, set);
    for (let i = 0; i < items.length; i++) if (items[i].pkey === pk) f[i] = 0;
    g.jobsLostIfDropped = base - coveredCount(jobs, f);
  }
  return [...by.values()].sort((a, b) => b.jobsLostIfDropped - a.jobsLostIfDropped || b.cost - a.cost);
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function bootstrapRate(jobs, flags, seed, rounds = 400) {
  const rnd = mulberry32(seed);
  const n = jobs.length;
  const covered = jobs.map((j) => !j.impossible && j.items.every((i) => flags[i]));
  const rates = [];
  for (let r = 0; r < rounds; r++) {
    let c = 0;
    for (let k = 0; k < n; k++) if (covered[Math.floor(rnd() * n)]) c++;
    rates.push(c / n);
  }
  rates.sort((a, b) => a - b);
  return { lo: percentile(rates, 0.1), hi: percentile(rates, 0.9) };
}

// ---------------------------------------------------------------- public API

export function optimize(input, o = {}) {
  const opt = {
    callback: Number.isFinite(o.callback) ? o.callback : 150,
    jobsPerYear: Number.isFinite(o.jobsPerYear) ? o.jobsPerYear : 600,
    carry: (Number.isFinite(o.carryPct) ? o.carryPct : 20) / 100,
    budget: Number.isFinite(o.budget) && o.budget > 0 ? o.budget : Infinity,
    space: Number.isFinite(o.space) && o.space > 0 ? o.space : Infinity,
    defaultCost: Number.isFinite(o.defaultCost) ? o.defaultCost : 20,
  };
  if (opt.callback < 0) return { error: "The cost of a return trip cannot be negative." };
  if (!(opt.jobsPerYear > 0)) return { error: "Jobs per year must be more than zero." };
  if (opt.carry < 0 || opt.carry > 1) return { error: "The yearly carrying cost must be between 0% and 100%." };
  if (!input.catalog || !input.catalog.length) return { error: "Add your parts catalog first." };
  if (!input.history || input.history.length < 1) return { error: "Add at least one past job." };

  const model = buildModel(input, opt);
  const { items, jobs, cur } = model;
  const N = jobs.length;
  const warnings = [...model.warnings];
  if (N < 20) warnings.push(`Only ${N} jobs in the history. With fewer than about 20, the result mostly memorises those jobs; add more history before trusting the list.`);

  const scale = opt.jobsPerYear / N;
  const covered0 = jobs.filter((j) => !j.impossible && j.items.length === 0).length;
  const solved = solveStock(items, jobs, opt);
  const set = solved.set;
  const flags = flagsOf(items.length, set);
  const covered = coveredCount(jobs, flags);
  const { cost, space } = setTotals(items, set);
  const gross = opt.callback * (covered - covered0) * scale;
  const carrying = opt.carry * cost;

  // Baselines.
  const capCost = Math.min(opt.budget, cost), capSpace = Math.min(opt.space, Math.max(space, 0));
  const tsSet = topSellers(items, jobs, capCost, capSpace);
  const ts = { set: tsSet, ...setTotals(items, tsSet), covered: coveredCount(jobs, flagsOf(items.length, tsSet)) };
  let current = null;
  if (cur) {
    const cov = coveredCount(jobs, flagsOf(items.length, cur.flags));
    const deadCost = cur.dead.reduce((s, d) => s + d.cost, 0);
    current = {
      covered: cov, rate: cov / N, cost: cur.cost, space: cur.space, dead: cur.dead, deadCost,
      net: netValue(cov, cur.cost, N, opt),
    };
  }

  // Frontier: best coverage at each fraction of the money a full van would tie up.
  let frontier = [];
  if (solved.tables) {
    frontier = exactFrontier(solved.tables, [0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]).map((p) => ({ cost: p.cost, rate: p.covered / N }));
  } else {
    const full = items.reduce((s, i) => s + i.cost, 0);
    for (const f of [0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]) {
      const s = localSearch(items, jobs, { ...opt, callback: 1e9, carry: 0, budget: Math.min(opt.budget, full * f) });
      frontier.push({ cost: setTotals(items, s).cost, rate: coveredCount(jobs, flagsOf(items.length, s)) / N });
    }
  }

  // What still gets missed, and what adding one more thing would do.
  const miss = new Map();
  let missed = 0;
  for (const j of jobs) {
    if (j.impossible) continue;
    const lacking = j.items.filter((i) => !flags[i]);
    if (!lacking.length) continue;
    missed++;
    for (const pk of new Set(lacking.map((i) => items[i].pkey))) miss.set(pk, (miss.get(pk) || 0) + 1);
  }
  const missing = [...miss.entries()].map(([pk, n]) => ({ name: items.find((x) => x.pkey === pk).part, jobs: n })).sort((a, b) => b.jobs - a.jobs).slice(0, 4);
  const nextBest = [];
  for (let i = 0; i < items.length; i++) {
    if (flags[i]) continue;
    const below = items.findIndex((x) => x.pkey === items[i].pkey && x.level === items[i].level - 1);
    if (items[i].level > 1 && !flags[below]) continue;
    flags[i] = 1;
    const gain = coveredCount(jobs, flags) - covered;
    flags[i] = 0;
    if (gain > 0) nextBest.push({ name: items[i].level > 1 ? `${items[i].part} (unit ${items[i].level})` : items[i].part, gainJobs: gain, cost: items[i].cost, space: items[i].space, worthIt: opt.callback * gain * scale - opt.carry * items[i].cost > 0 });
  }
  nextBest.sort((a, b) => b.gainJobs - a.gainJobs || a.cost - b.cost);

  // Hold-out: fit on the older 70% of the history, score on the newest 30%.
  let holdout = null;
  if (N >= 20) {
    const nTrain = Math.floor(N * 0.7);
    const train = jobs.slice(0, nTrain), test = jobs.slice(nTrain);
    const fit = solveStock(items, train, opt);
    const tf = flagsOf(items.length, fit.set);
    const fitCost = setTotals(items, fit.set);
    const tsTrain = topSellers(items, train, Math.min(opt.budget, fitCost.cost), Math.min(opt.space, Math.max(fitCost.space, 0)));
    holdout = {
      trainJobs: train.length, testJobs: test.length,
      trainRate: coveredCount(train, tf) / train.length,
      testRate: coveredCount(test, tf) / test.length,
      topSellersTestRate: coveredCount(test, flagsOf(items.length, tsTrain)) / test.length,
      cost: fitCost.cost,
    };
  }
  const boot = N >= 5 ? bootstrapRate(jobs, flags, 20260930) : null;

  // Return-trip cost sensitivity.
  const sens = [0.5, 2].map((mult) => {
    const o2 = { ...opt, callback: opt.callback * mult };
    const s = solveStock(items, jobs, o2);
    const t = setTotals(items, s.set);
    return { callback: o2.callback, parts: new Set([...s.set].map((i) => items[i].pkey)).size, cost: t.cost, rate: coveredCount(jobs, flagsOf(items.length, s.set)) / N };
  });
  sens.splice(1, 0, { callback: opt.callback, parts: new Set([...set].map((i) => items[i].pkey)).size, cost, rate: covered / N });

  return {
    jobCount: N, itemCount: items.length, method: solved.method,
    callback: opt.callback, jobsPerYear: opt.jobsPerYear, carryPct: opt.carry * 100,
    stock: groupStock(items, jobs, set),
    cost, space, covered, rate: covered / N, baseRate: covered0 / N,
    gross, carrying, net: gross - carrying,
    topSellers: { cost: ts.cost, space: ts.space, rate: ts.covered / N },
    current, frontier, missed, missing, nextBest: nextBest.slice(0, 3),
    holdout, bootstrap: boot, sensitivity: sens, warnings,
  };
}

export function stockCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["part", "quantity", "unit cost", "total cost", "shelf slots", "jobs needing it", "jobs lost if dropped"].join(",")];
  for (const s of r.stock) rows.push([q(s.name), s.qty, s.unitCost.toFixed(2), s.cost.toFixed(2), s.space, s.jobsNeeding, s.jobsLostIfDropped].join(","));
  rows.push("");
  rows.push(["total", "", "", r.cost.toFixed(2), r.space, "", ""].join(","));
  rows.push([q("first-visit completion"), pct(r.rate)].join(","));
  rows.push([q("net yearly value"), Math.round(r.net)].join(","));
  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------- sample (invented)

export function sampleCatalog() {
  return [
    "part,unit cost,shelf slots",
    "Run capacitor 45/5 µF,16,1",
    "Dual run capacitor 35/5 µF,19,1",
    "Contactor 2-pole 30A,14,1",
    "Condenser fan motor 1/4 hp,118,6",
    "Blower motor PSC 1/2 hp,165,8",
    "Hot surface igniter,38,1",
    "Flame sensor,14,1",
    "Thermostat non-programmable,32,2",
    "Float switch,12,1",
    "Condensate pump,68,4",
    "Gas valve,142,4",
    "Transformer 40VA,22,1",
    "Inducer motor,156,7",
    "Filter drier,19,1",
    "Air filter 16x25x1,7,2",
  ].join("\n");
}

export function sampleHistory() {
  const rnd = mulberry32(7);
  const pick = (p) => rnd() < p;
  const types = [
    [25, () => [pick(0.6) ? "Dual run capacitor 35/5 µF" : "Run capacitor 45/5 µF", ...(pick(0.3) ? ["Contactor 2-pole 30A"] : [])]],
    [12, () => ["Condenser fan motor 1/4 hp", "Run capacitor 45/5 µF"]],
    [15, () => ["Hot surface igniter", ...(pick(0.4) ? ["Flame sensor"] : [])]],
    [10, () => ["Flame sensor"]],
    [10, () => ["Float switch", ...(pick(0.3) ? ["Condensate pump"] : [])]],
    [8, () => ["Blower motor PSC 1/2 hp", "Dual run capacitor 35/5 µF"]],
    [7, () => ["Thermostat non-programmable", ...(pick(0.3) ? ["Transformer 40VA"] : [])]],
    [10, () => (pick(0.5) ? [] : pick(0.5) ? ["Air filter 16x25x1"] : ["Air filter 16x25x1 x2"])],
    [2, () => ["Gas valve", "Hot surface igniter"]],
    [3, () => ["Inducer motor", "Transformer 40VA"]],
    [3, () => ["Contactor 2-pole 30A", "Filter drier"]],
  ];
  const total = types.reduce((s, t) => s + t[0], 0);
  const lines = [];
  for (let n = 0; n < 90; n++) {
    let r = rnd() * total;
    let gen = types[0][1];
    for (const [w, g] of types) { if (r < w) { gen = g; break; } r -= w; }
    const parts = gen();
    lines.push(parts.length ? parts.join("; ") : "none");
  }
  return lines.join("\n");
}

export function sampleCurrent() {
  return [
    "Run capacitor 45/5 µF x4",
    "Contactor 2-pole 30A x2",
    "Air filter 16x25x1 x6",
    "Gas valve x1",
    "Blower motor PSC 1/2 hp x1",
    "Float switch x2",
    "Thermostat non-programmable x2",
  ].join("\n");
}
