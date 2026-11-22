// Brute-force oracle for crash.mjs on networks with every P6 relationship
// type (FS, SS, FF, SF) and whole-day lags, including leads. Same method as
// eval/crash-oracle.mjs: enumerate every combination of whole-day
// shortenings within each activity's room, schedule each with an
// independent forward pass (no shared code), and compare the greedy cut's
// cumulative cost at each gain with the least cost of at least that gain.
//
// What is new against the FS oracle: with FF and SF links an activity's
// start is pulled from its finish, so shortening it can push its own start
// later and, through an SS or SF successor, push the finish out (reverse
// drag). The brute force sees that directly; the tool has to.
//   node eval/crash-oracle-links.mjs [seeds] [nMax] [roomMax] [density] [lagMin] [lagMax]
import { pathToFileURL } from "node:url";
import { crashAnalysis } from "../crash.mjs";
import { project, task, link, rng } from "./crash-oracle.mjs";

const TYPES = ["PR_FS", "PR_SS", "PR_FF", "PR_SF"];

// Forward pass in whole days from day 0 (the data date). rels: [{ i, j, type, lag }].
export function finishOf(dur, rels, n) {
  const into = Array.from({ length: n }, () => []);
  for (const r of rels) into[r.j].push(r);
  const es = [], ef = [];
  for (let j = 0; j < n; j++) { // rels only run from lower to higher index
    let s = 0;
    for (const { i, type, lag } of into[j]) {
      const t = type === "PR_FS" ? ef[i] + lag : type === "PR_SS" ? es[i] + lag : type === "PR_FF" ? ef[i] + lag - dur[j] : es[i] + lag - dur[j];
      if (t > s) s = t;
    }
    es[j] = s; ef[j] = s + dur[j];
  }
  return Math.max(...ef);
}

export function linkOracleCase({ d, room, cost, rels, giveBack = true }) {
  const n = d.length;
  const L = finishOf(d, rels, n);
  const best = new Map();
  const v = new Array(n).fill(0);
  let reverse = 0; // combinations that finish later than doing nothing
  const rec = (k) => {
    if (k === n) {
      const g = L - finishOf(d.map((x, i) => x - v[i]), rels, n);
      if (g < 0) { reverse++; return; }
      const c = v.reduce((a, x, i) => a + x * cost[i], 0);
      if (!best.has(g) || c < best.get(g)) best.set(g, c);
      return;
    }
    for (let s = 0; s <= room[k]; s++) { v[k] = s; rec(k + 1); }
  };
  rec(0);
  const x = project(d.map((h, i) => task(`T${i}`, h * 8)), rels.map((r) => link(`T${r.j}`, `T${r.i}`, r.type, r.lag * 8)));
  const data = new Map(d.map((_, i) => [`T${i}`, { roomDays: room[i], costPerDay: cost[i] }]));
  const res = crashAnalysis(x, { data, giveBack });
  const before = res.finishBefore, maxG = Math.max(...best.keys());
  const misses = [];
  let points = 0, optimal = 0, worst = 0, below = 0;
  for (const s of res.steps) {
    if (!Number.isInteger(s.cumulativeDays)) continue;
    let opt = Infinity; for (const [g, c] of best) if (g >= s.cumulativeDays && c < opt) opt = c;
    points++;
    if (Math.abs(s.cumulativeCost - opt) < 1e-6) optimal++;
    else if (s.cumulativeCost < opt - 1e-6) { below++; misses.push({ kind: "below", days: s.cumulativeDays, cost: s.cumulativeCost, opt }); }
    else { worst = Math.max(worst, s.cumulativeCost / opt - 1); misses.push({ kind: "cost", days: s.cumulativeDays, cost: s.cumulativeCost, opt }); }
  }
  const reachOk = res.gainedDays === maxG;
  if (!reachOk) misses.push({ kind: "reach", got: res.gainedDays, max: maxG, stopped: res.stoppedBecause });
  return {
    points, optimal, worst, below, reachOk, misses, maxGain: maxG, reverse, before,
    givenBack: res.steps.filter((s) => s.givenBack.length).length,
    steps: res.steps.map((s) => `${s.activities.map((a) => a.code).join("+")}${s.givenBack.length ? ` (give back ${s.givenBack.map((a) => a.code).join("+")})` : ""} ${s.shortenHours} h: ${s.cumulativeDays} d for ${s.cumulativeCost}`),
    warnings: res.warnings,
  };
}

export function randomLinkCase(seed, { nMin = 4, nMax = 7, dMax = 6, roomMax = 2, density = 1.6, lagMin = 0, lagMax = 2, types = TYPES } = {}) {
  const rand = rng(seed);
  const n = nMin + Math.floor(rand() * (nMax - nMin + 1));
  const d = Array.from({ length: n }, () => 2 + Math.floor(rand() * (dMax - 1)));
  const room = d.map((x) => Math.min(x - 1, Math.floor(rand() * (roomMax + 1))));
  const cost = d.map(() => 1 + Math.floor(rand() * 5));
  const rels = [];
  for (let j = 1; j < n; j++) for (let i = 0; i < j; i++) if (rand() < density / j) {
    const type = types[Math.floor(rand() * types.length)];
    const lag = lagMin + Math.floor(rand() * (lagMax - lagMin + 1));
    rels.push({ i, j, type, lag });
  }
  return { d, room, cost, rels };
}

export function linkOracleRun({ seeds = 300, from = 1, giveBack = true, ...shape } = {}) {
  const misses = [];
  let givenBack = 0, points = 0, optimal = 0, worst = 0, below = 0, reach = 0, reachOk = 0, reverseCases = 0, links = {};
  for (let seed = from; seed < from + seeds; seed++) {
    const c = randomLinkCase(seed, shape);
    for (const r of c.rels) links[r.type] = (links[r.type] || 0) + 1;
    const o = linkOracleCase({ ...c, giveBack });
    givenBack += o.givenBack; points += o.points; optimal += o.optimal; below += o.below; worst = Math.max(worst, o.worst);
    if (o.reverse) reverseCases++;
    reach++; if (o.reachOk) reachOk++;
    for (const m of o.misses) misses.push({ seed, ...m });
  }
  return { givenBack, points, optimal, below, worst: Math.round(worst * 1000) / 1000, reach, reachOk, reverseCases, links, misses };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [seeds = 300, nMax = 7, roomMax = 2, density = 1.6, lagMin = 0, lagMax = 2] = process.argv.slice(2).map(Number);
  const o = linkOracleRun({ seeds, nMax, roomMax, density, lagMin, lagMax });
  console.log(JSON.stringify({ ...o, misses: o.misses.slice(0, 20), missCount: o.misses.length }));
}
